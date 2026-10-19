/**
 * Blokada aplikacji przy szybkim logowaniu: przy otwarciu aplikacji i po 5 min w tle trzeba odblokować telefonem.
 * Bez włączonego szybkiego logowania albo bez ważnej sesji - bez blokady.
 */
import React from 'react';
import { AppState } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() { return React.createElement('Ionicons'); };
});
jest.mock('../../services/quickLogin', () => ({
  __esModule: true,
  default: { getSaved: jest.fn(), availability: jest.fn(), unlock: jest.fn() },
}));
jest.mock('../../services/tokenService', () => ({ __esModule: true, default: { isAuthenticated: jest.fn() } }));

const quickLogin = require('../../services/quickLogin').default;
const tokenService = require('../../services/tokenService').default;
const { GlobalStateContext } = require('../../context/GlobalState');
const AppLock = require('../../components/AppLock').default;

let appStateListener;
beforeEach(() => {
  jest.clearAllMocks();
  quickLogin.getSaved.mockResolvedValue({ userId: 'u1', symbol: 'P', sellingPoint: 'Parzygnat', role: 'user' });
  quickLogin.availability.mockResolvedValue('ok');
  quickLogin.unlock.mockResolvedValue(false);
  tokenService.isAuthenticated.mockResolvedValue(true);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => { appStateListener = listener; return { remove: jest.fn() }; });
});

const renderLock = (logout = jest.fn()) => render(
  <GlobalStateContext.Provider value={{ logout }}>
    <AppLock />
  </GlobalStateContext.Provider>
);

test('otwarcie aplikacji z szybkim logowaniem: blokada i od razu okno odblokowania; po odblokowaniu znika', async () => {
  const screen = renderLock();
  await waitFor(() => expect(screen.getByTestId('app-lock')).toBeTruthy());
  expect(screen.getByText('P · Parzygnat')).toBeTruthy();
  await waitFor(() => expect(quickLogin.unlock).toHaveBeenCalledTimes(1));
  quickLogin.unlock.mockResolvedValueOnce(true);
  await act(async () => { fireEvent.press(screen.getByTestId('app-lock-unlock')); });
  await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
});

test('bez szybkiego logowania / bez ważnej sesji / telefon bez blokady: brak blokady', async () => {
  for (const setup of [
    () => quickLogin.getSaved.mockResolvedValue(null),
    () => tokenService.isAuthenticated.mockResolvedValue(false),
    () => quickLogin.availability.mockResolvedValue('no-lock'),
  ]) {
    setup();
    const screen = renderLock();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('app-lock')).toBeNull();
    screen.unmount();
    quickLogin.getSaved.mockResolvedValue({ userId: 'u1', symbol: 'P' });
    tokenService.isAuthenticated.mockResolvedValue(true);
    quickLogin.availability.mockResolvedValue('ok');
  }
});

test('powrót po 5 min w tle blokuje, po krótkiej przerwie nie; „Wyloguj” wylogowuje', async () => {
  quickLogin.unlock.mockResolvedValue(true);
  const logout = jest.fn();
  const screen = renderLock(logout);
  await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull()); // odblokowane przy starcie
  const now = Date.now();
  const spy = jest.spyOn(Date, 'now');
  spy.mockReturnValue(now);
  act(() => appStateListener('background'));
  spy.mockReturnValue(now + 60 * 1000);
  await act(async () => { appStateListener('active'); });
  expect(screen.queryByTestId('app-lock')).toBeNull();

  quickLogin.unlock.mockResolvedValue(false);
  act(() => appStateListener('background'));
  spy.mockReturnValue(now + 60 * 1000 + 5 * 60 * 1000);
  await act(async () => { appStateListener('active'); });
  await waitFor(() => expect(screen.getByTestId('app-lock')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByTestId('app-lock-logout')); });
  expect(logout).toHaveBeenCalled();
  spy.mockRestore();
});
