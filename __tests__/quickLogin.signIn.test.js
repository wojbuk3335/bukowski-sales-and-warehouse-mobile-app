/**
 * Ekran logowania z szybkim logowaniem (19.10.2026): zapamiętane konto -> karta „Odblokuj” i od razu okno
 * odblokowania; po odblokowaniu wejście do panelu; odcięty telefon -> zwykły formularz z komunikatem;
 * „Zaloguj innym kontem” pokazuje formularz; po zalogowaniu hasłem propozycja włączenia.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignIn from '../app/(auth)/sign-in';
import { GlobalStateContext } from '../context/GlobalState';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args) => mockReplace(...args), push: jest.fn() },
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() { return React.createElement('Ionicons'); };
});
jest.mock('../services/appUpdates', () => ({
  checkAndApplyUpdate: jest.fn(() => Promise.resolve({ status: 'skipped' })),
  getVersionLabel: () => 'v1.2.0',
}));
jest.mock('../services/quickLogin', () => ({
  __esModule: true,
  default: { getSaved: jest.fn(), availability: jest.fn(), forget: jest.fn() },
}));
jest.mock('../utils/quickLoginOffer', () => ({ offerQuickLogin: jest.fn() }));

const quickLogin = require('../services/quickLogin').default;
const { offerQuickLogin } = require('../utils/quickLoginOffer');

const SAVED = { userId: 'u1', secret: 'x', symbol: 'P', sellingPoint: 'Parzygnat', email: 'parzygnat@wp.pl', role: 'user' };

const renderSignIn = (value) => render(
  <GlobalStateContext.Provider value={{ setUser: jest.fn(), isLoading: false, user: null, bukowski_login: jest.fn(), quick_login: jest.fn(), ...value }}>
    <SignIn />
  </GlobalStateContext.Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  quickLogin.getSaved.mockResolvedValue(SAVED);
  quickLogin.availability.mockResolvedValue('ok');
});

test('zapamiętane konto: karta „Odblokuj”, od razu szybkie logowanie i wejście do panelu użytkownika', async () => {
  const quick_login = jest.fn(async () => ({ role: 'user', symbol: 'P' }));
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(screen.getByTestId('quick-login-card')).toBeTruthy());
  expect(screen.getByText('P')).toBeTruthy();
  expect(screen.getByText('Parzygnat · parzygnat@wp.pl')).toBeTruthy();
  await waitFor(() => expect(quick_login).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
});

test('anulowane odblokowanie zostawia kartę; ponowne „Odblokuj” loguje admina do panelu admina', async () => {
  const cancelled = Object.assign(new Error('Anulowano'), { code: 'CANCELLED' });
  const quick_login = jest.fn().mockRejectedValueOnce(cancelled).mockResolvedValueOnce({ role: 'admin' });
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(quick_login).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('quick-login-card')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Odblokuj')); });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(admin-tabs)/dashboard'));
});

test('odcięty telefon: zwykły formularz z komunikatem; po zalogowaniu hasłem propozycja szybkiego logowania', async () => {
  const rejected = Object.assign(new Error('Ten telefon nie jest już zaufany'), { code: 'TRUSTED_DEVICE_REJECTED' });
  const bukowski_login = jest.fn(async () => ({ role: 'user', userId: 'u1' }));
  const screen = renderSignIn({ quick_login: jest.fn().mockRejectedValue(rejected), bukowski_login });
  await waitFor(() => expect(screen.getByText('Ten telefon nie jest już zaufany')).toBeTruthy());
  expect(screen.queryByTestId('quick-login-card')).toBeNull();
  const [emailInput, passwordInput] = screen.getAllByTestId('text-input');
  fireEvent.changeText(emailInput, 'parzygnat@wp.pl');
  fireEvent.changeText(passwordInput, 'tajne');
  const buttons = screen.getAllByText('Zaloguj się');
  await act(async () => { fireEvent.press(buttons[buttons.length - 1]); });
  expect(mockReplace).toHaveBeenCalledWith('/home');
  expect(offerQuickLogin).toHaveBeenCalledWith({ role: 'user', userId: 'u1' });
});

test('„Zaloguj innym kontem” pokazuje formularz i link powrotu; bez blokady ekranu bez automatycznego odblokowania', async () => {
  quickLogin.availability.mockResolvedValue('no-lock');
  const quick_login = jest.fn();
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(screen.getByTestId('quick-login-card')).toBeTruthy());
  await act(async () => { await Promise.resolve(); });
  expect(quick_login).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('quick-other-account'));
  expect(screen.getAllByTestId('text-input')).toHaveLength(2);
  fireEvent.press(screen.getByTestId('quick-back'));
  expect(screen.getByTestId('quick-login-card')).toBeTruthy();
});
