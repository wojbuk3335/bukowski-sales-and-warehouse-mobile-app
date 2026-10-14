/**
 * Blokada „jedna osoba na punkcie”: komunikaty na ekranie logowania.
 *
 * - 403 SESSION_ACTIVE z session -> „Na tym punkcie jest już zalogowany inny telefon (Android, od HH:MM,
 *   ostatnia aktywność X min temu)…” w czasie lokalnym telefonu
 * - SESSION_ACTIVE bez session -> ogólny komunikat jak dotąd
 * - wejście z params { reason: 'SESSION_REVOKED' } -> „Zostałeś wylogowany…”
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignIn from '../app/(auth)/sign-in';
import { GlobalStateContext } from '../context/GlobalState';
import {
  buildSessionActiveMessage,
  formatTimeAgo,
  GENERIC_SESSION_ACTIVE_MESSAGE,
  SESSION_REVOKED_MESSAGE,
} from '../utils/sessionLockMessages';

const mockReplace = jest.fn();
const mockUseParams = jest.fn(() => ({}));

jest.mock('expo-router', () => ({
  router: {
    replace: (...args) => mockReplace(...args),
    push: jest.fn(),
  },
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useLocalSearchParams: () => mockUseParams(),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() {
    return React.createElement('Ionicons');
  };
});

// Sprawdzanie OTA kończy się od razu - przycisk logowania jest aktywny
jest.mock('../services/appUpdates', () => ({
  checkAndApplyUpdate: jest.fn(() => Promise.resolve({ status: 'skipped' })),
  getVersionLabel: () => 'v1.1.3',
}));

const renderSignIn = (bukowski_login) => render(
  <GlobalStateContext.Provider value={{ setUser: jest.fn(), bukowski_login, isLoading: false, user: null }}>
    <SignIn />
  </GlobalStateContext.Provider>
);

// Wpisuje dane i naciska „Zaloguj się” (ostatni tekst o tej treści to przycisk; pierwszy to tytuł karty)
const submitLogin = async (screen) => {
  await waitFor(() => expect(screen.queryByText('Sprawdzanie aktualizacji…')).toBeNull());
  const [emailInput, passwordInput] = screen.getAllByTestId('text-input');
  fireEvent.changeText(emailInput, 'punkt@test.pl');
  fireEvent.changeText(passwordInput, 'tajne');
  const buttons = screen.getAllByText('Zaloguj się');
  // act: setError po odrzuconej obietnicy logowania dzieje się już po zdarzeniu
  await act(async () => {
    fireEvent.press(buttons[buttons.length - 1]);
  });
};

const sessionActiveError = (session) => {
  const error = new Error('Konto jest już zalogowane');
  error.code = 'SESSION_ACTIVE';
  error.status = 403;
  error.session = session;
  return error;
};

const pad = (n) => String(n).padStart(2, '0');

describe('SignIn - blokada „jedna osoba na punkcie”', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUseParams.mockReturnValue({});
  });

  test('SESSION_ACTIVE pokazuje, kto i od kiedy zajmuje punkt (godzina lokalna, „X min temu”)', async () => {
    const startedAt = new Date();
    startedAt.setHours(9, 15, 0, 0);
    // startedAt może być „w przyszłości” względem teraz w teście - liczy się tylko godzina
    const lastSeenAt = new Date(Date.now() - 2 * 60 * 1000);
    const login = jest.fn(() => Promise.reject(sessionActiveError({
      startedAt: startedAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
      deviceName: 'Android',
    })));

    const screen = renderSignIn(login);
    await submitLogin(screen);

    const expected = 'Na tym punkcie jest już zalogowany inny telefon (Android, od 09:15, ostatnia aktywność 2 min temu). ' +
      'Poproś tę osobę o wylogowanie albo administratora o wylogowanie z panelu.';
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
    expect(login).toHaveBeenCalledWith('punkt@test.pl', 'tajne', expect.anything(), false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('godzina w komunikacie jest w czasie lokalnym telefonu (ISO z UTC)', async () => {
    const startedIso = '2026-10-14T06:05:00.000Z';
    const local = new Date(startedIso);
    const expectedClock = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
    const login = jest.fn(() => Promise.reject(sessionActiveError({
      startedAt: startedIso,
      lastSeenAt: new Date().toISOString(),
      deviceName: 'iPhone',
    })));

    const screen = renderSignIn(login);
    await submitLogin(screen);

    await waitFor(() => expect(screen.getByText(
      `Na tym punkcie jest już zalogowany inny telefon (iPhone, od ${expectedClock}, ostatnia aktywność przed chwilą). ` +
      'Poproś tę osobę o wylogowanie albo administratora o wylogowanie z panelu.'
    )).toBeTruthy());
  });

  test('SESSION_ACTIVE bez szczegółów sesji -> ogólny komunikat', async () => {
    const login = jest.fn(() => Promise.reject(sessionActiveError(null)));

    const screen = renderSignIn(login);
    await submitLogin(screen);

    await waitFor(() => expect(screen.getByText(GENERIC_SESSION_ACTIVE_MESSAGE)).toBeTruthy());
  });

  test('params.reason=SESSION_REVOKED -> informacja o wylogowaniu przez serwer', async () => {
    mockUseParams.mockReturnValue({ reason: 'SESSION_REVOKED' });

    const screen = renderSignIn(jest.fn());

    await waitFor(() => expect(screen.getByText(SESSION_REVOKED_MESSAGE)).toBeTruthy());
  });

  test('bez params.reason nie ma informacji o wylogowaniu', async () => {
    const screen = renderSignIn(jest.fn());

    await waitFor(() => expect(screen.queryByText('Sprawdzanie aktualizacji…')).toBeNull());
    expect(screen.queryByText(SESSION_REVOKED_MESSAGE)).toBeNull();
  });
});

describe('utils/sessionLockMessages', () => {
  const now = new Date('2026-10-14T10:00:00.000Z').getTime();

  test('formatTimeAgo: przed chwilą / min / godz.', () => {
    expect(formatTimeAgo('2026-10-14T09:59:30.000Z', now)).toBe('przed chwilą');
    expect(formatTimeAgo('2026-10-14T09:47:00.000Z', now)).toBe('13 min temu');
    expect(formatTimeAgo('2026-10-14T07:30:00.000Z', now)).toBe('2 godz. temu');
    expect(formatTimeAgo('nie-data', now)).toBeNull();
    expect(formatTimeAgo(undefined, now)).toBeNull();
  });

  test('buildSessionActiveMessage pomija brakujące pola i wraca do ogólnego komunikatu', () => {
    expect(buildSessionActiveMessage(undefined)).toBe(GENERIC_SESSION_ACTIVE_MESSAGE);
    expect(buildSessionActiveMessage({})).toBe(GENERIC_SESSION_ACTIVE_MESSAGE);
    expect(buildSessionActiveMessage({ startedAt: 'zepsute', lastSeenAt: null })).toBe(GENERIC_SESSION_ACTIVE_MESSAGE);
    expect(buildSessionActiveMessage({ deviceName: 'Android', lastSeenAt: '2026-10-14T09:55:00.000Z' }, now)).toBe(
      'Na tym punkcie jest już zalogowany inny telefon (Android, ostatnia aktywność 5 min temu). ' +
      'Poproś tę osobę o wylogowanie albo administratora o wylogowanie z panelu.'
    );
  });
});
