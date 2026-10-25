// Zarządzanie użytkownikami (telefon, admin): menu ⋮ jak w panelu - Edytuj, Wyloguj z punktu (punkt zalogowany),
// Resetuj 2FA / Resetuj moje 2FA (konta admina), Usuń. Akcje wołają te same adresy serwera co panel.
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import axios from 'axios';
import UsersManagement from '../../app/users-management';
import { GlobalStateContext } from '../../context/GlobalState';
import { appAlert } from '../../services/appAlert';

jest.mock('axios');
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() { return React.createElement('Ionicons'); };
});
jest.mock('../../services/tokenService', () => ({
  getTokens: jest.fn(() => Promise.resolve({ accessToken: 'TOKEN' })),
  authenticatedFetch: jest.fn(),
}));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));

const USERS = [
  { _id: 'adm1', email: 'ja@test.pl', role: 'admin', symbol: 'ADM' },
  { _id: 'adm2', email: 'kolega@test.pl', role: 'admin', symbol: 'ADM2' },
  { _id: 'p1', email: 'p@test.pl', role: 'user', symbol: 'P', sellingPoint: 'Parzygnat', location: 'Zakopane',
    activeSession: { id: 's1', deviceName: 'Samsung', startedAt: '2026-10-25T07:00:00.000Z' } },
  { _id: 't1', email: 't@test.pl', role: 'user', symbol: 'T', sellingPoint: 'Tata', location: 'Zakopane' },
];

const renderScreen = () => render(
  <GlobalStateContext.Provider value={{ user: { email: 'ja@test.pl', role: 'admin' } }}>
    <UsersManagement />
  </GlobalStateContext.Provider>
);

// Okienko potwierdzenia (appAlert) - naciśnij przycisk o danej treści
const pressAlertButton = async (text) => {
  const call = appAlert.mock.calls[appAlert.mock.calls.length - 1];
  const button = (call[2] || []).find((b) => b.text === text);
  await act(async () => { await button.onPress(); });
};

describe('Zarządzanie użytkownikami - menu ⋮', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    appAlert.mockReset();
    axios.get.mockReset();
    axios.post.mockReset();
    axios.get.mockImplementation((url) => Promise.resolve({
      data: url.includes('localization') ? { localizations: [] } : { users: USERS },
    }));
    axios.post.mockResolvedValue({ data: { message: 'OK z serwera' } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('zalogowany punkt: Edytuj, Wyloguj z punktu, Usuń (bez 2FA); status sesji na karcie', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('user-actions-p1')).toBeTruthy());
    expect(screen.getByTestId('user-session-p1').props.children).toMatch(/Zalogowany: Samsung/);
    expect(screen.getByTestId('user-session-t1').props.children).toBe('Niezalogowany');

    fireEvent.press(screen.getByTestId('user-actions-p1'));
    expect(screen.getByTestId('user-action-edit')).toBeTruthy();
    expect(screen.getByTestId('user-action-logout')).toBeTruthy();
    expect(screen.getByTestId('user-action-delete')).toBeTruthy();
    expect(screen.queryByTestId('user-action-reset-2fa')).toBeNull();
  });

  test('niezalogowany punkt: bez „Wyloguj z punktu”', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('user-actions-t1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('user-actions-t1'));
    expect(screen.queryByTestId('user-action-logout')).toBeNull();
  });

  test('Wyloguj z punktu → potwierdzenie → POST /user/:id/force-logout', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('user-actions-p1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('user-actions-p1'));
    fireEvent.press(screen.getByTestId('user-action-logout'));
    act(() => { jest.advanceTimersByTime(300); });

    expect(appAlert).toHaveBeenCalledWith('Wyloguj z punktu', expect.stringContaining('p@test.pl'), expect.any(Array));
    await pressAlertButton('Wyloguj');
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/user/p1/force-logout'), {}, expect.any(Object));
  });

  test('admin: „Resetuj moje 2FA” dla siebie, „Resetuj 2FA” dla kolegi → POST /user/:id/reset-2fa', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('user-actions-adm1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('user-actions-adm1'));
    expect(screen.getByText('Resetuj moje 2FA')).toBeTruthy();
    expect(screen.queryByTestId('user-action-logout')).toBeNull();
    fireEvent.press(screen.getByText('Anuluj'));

    fireEvent.press(screen.getByTestId('user-actions-adm2'));
    expect(screen.getByText('Resetuj 2FA')).toBeTruthy();
    fireEvent.press(screen.getByTestId('user-action-reset-2fa'));
    act(() => { jest.advanceTimersByTime(300); });

    expect(appAlert).toHaveBeenCalledWith('Reset 2FA', expect.stringContaining('kolega@test.pl'), expect.any(Array));
    await pressAlertButton('Resetuj 2FA');
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/user/adm2/reset-2fa'), {}, expect.any(Object));
  });
});
