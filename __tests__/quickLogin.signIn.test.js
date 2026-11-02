/**
 * Ekran logowania z szybkim logowaniem (19.10.2026): zapamiętane konto -> karta „Odblokuj” i od razu okno
 * odblokowania; po odblokowaniu wejście do panelu; odcięty telefon -> zwykły formularz z komunikatem;
 * „Zaloguj innym kontem” pokazuje formularz; po zalogowaniu hasłem propozycja włączenia.
 * 2.11.2026: konta pokazywane wszystkie naraz (bez dzielenia na panele) - PIN sam odpala się tylko przy JEDYNYM
 * koncie na telefonie; przy kilku lista do wyboru. Przełącznik Użytkownik / Administrator tylko przy formularzu hasła.
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
  default: { getAccounts: jest.fn(), getSaved: jest.fn(), availability: jest.fn(), forget: jest.fn() },
}));
jest.mock('../utils/quickLoginOffer', () => ({ offerQuickLogin: jest.fn() }));
jest.mock('../services/tokenService', () => ({
  __esModule: true,
  default: { isAuthenticated: jest.fn(async () => false) },
}));

const quickLogin = require('../services/quickLogin').default;
const tokenService = require('../services/tokenService').default;
const { offerQuickLogin } = require('../utils/quickLoginOffer');

const SAVED = { userId: 'u1', secret: 'x', symbol: 'P', sellingPoint: 'Parzygnat', email: 'parzygnat@wp.pl', role: 'user' };

const renderSignIn = (value) => render(
  <GlobalStateContext.Provider value={{ setUser: jest.fn(), isLoading: false, user: null, bukowski_login: jest.fn(), quick_login: jest.fn(), ...value }}>
    <SignIn />
  </GlobalStateContext.Provider>
);

beforeEach(async () => {
  jest.clearAllMocks();
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).clear(); // zapamiętany panel nie przechodzi między testami
  quickLogin.getAccounts.mockResolvedValue([SAVED]);
  quickLogin.getSaved.mockResolvedValue(SAVED);
  quickLogin.availability.mockResolvedValue('ok');
  tokenService.isAuthenticated.mockResolvedValue(false);
});

test('zapamiętane konto: karta „Odblokuj”, od razu szybkie logowanie i wejście do panelu użytkownika', async () => {
  const quick_login = jest.fn(async () => ({ role: 'user', symbol: 'P' }));
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(screen.getByTestId('quick-login-card')).toBeTruthy());
  expect(screen.getByText('P')).toBeTruthy();
  expect(screen.getByText('Parzygnat · parzygnat@wp.pl')).toBeTruthy();
  await waitFor(() => expect(quick_login).toHaveBeenCalledTimes(1));
  expect(quick_login).toHaveBeenCalledWith('u1');
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
  // odcięty telefon: serwisu klucz tego konta usuwa - lista kont pusta
  const quick_login = jest.fn(async () => { quickLogin.getAccounts.mockResolvedValue([]); throw rejected; });
  const screen = renderSignIn({ quick_login, bukowski_login });
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
  expect(screen.queryByTestId('panel-admin')).toBeNull(); // przełącznik panelu tylko przy formularzu hasła
  fireEvent.press(screen.getByTestId('quick-other-account'));
  expect(screen.getAllByTestId('text-input')).toHaveLength(2);
  expect(screen.getByTestId('panel-admin')).toBeTruthy();
  fireEvent.press(screen.getByTestId('quick-back'));
  expect(screen.getByTestId('quick-login-card')).toBeTruthy();
});

test('dwa konta na telefonie (admin + punkt): lista obu kont, PIN nie odpala się sam; wybór konta punktu loguje do panelu użytkownika', async () => {
  const ADMIN = { userId: 'a1', secret: 'y', symbol: 'ADM', email: 'admin@x.pl', role: 'admin' };
  quickLogin.getAccounts.mockResolvedValue([SAVED, ADMIN]);
  const quick_login = jest.fn(async (userId) => (userId === 'u1' ? { role: 'user', symbol: 'P' } : { role: 'admin' }));
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(screen.getByTestId('quick-login-list')).toBeTruthy());
  expect(screen.getByText('P')).toBeTruthy();
  expect(screen.getByText('ADM')).toBeTruthy();
  expect(screen.queryByTestId('quick-login-card')).toBeNull();
  expect(screen.queryByTestId('panel-user')).toBeNull(); // bez przełącznika panelu nad listą kont
  await act(async () => { await Promise.resolve(); });
  expect(quick_login).not.toHaveBeenCalled(); // dawniej PIN strzelał od razu dla „jedynego konta w panelu”

  await act(async () => { fireEvent.press(screen.getByTestId('quick-account-u1')); });
  expect(quick_login).toHaveBeenCalledWith('u1');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
});

test('dwa konta: wybór konta admina loguje do panelu admina; „Zaloguj innym kontem” pokazuje formularz z przełącznikiem panelu', async () => {
  const ADMIN = { userId: 'a1', secret: 'y', symbol: 'ADM', email: 'admin@x.pl', role: 'admin' };
  quickLogin.getAccounts.mockResolvedValue([SAVED, ADMIN]);
  const quick_login = jest.fn(async () => ({ role: 'admin' }));
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(screen.getByTestId('quick-login-list')).toBeTruthy());

  await act(async () => { fireEvent.press(screen.getByTestId('quick-account-a1')); });
  expect(quick_login).toHaveBeenCalledWith('a1');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(admin-tabs)/dashboard'));

  fireEvent.press(screen.getByTestId('quick-other-account'));
  expect(screen.getAllByTestId('text-input')).toHaveLength(2);
  expect(screen.getByTestId('panel-admin')).toBeTruthy();
  fireEvent.press(screen.getByTestId('quick-back'));
  expect(screen.getByTestId('quick-login-list')).toBeTruthy();
});

test('ważna sesja przy wejściu: admin wchodzi do swojego panelu, choć zapamiętany panel formularza to Użytkownik', async () => {
  const storage = require('@react-native-async-storage/async-storage');
  const AsyncStorage = storage.default || storage;
  await AsyncStorage.setItem('user', JSON.stringify({ userId: 'a1', role: 'admin', symbol: 'ADM' }));
  await AsyncStorage.setItem('BukowskiLoginPanel', 'user');
  tokenService.isAuthenticated.mockResolvedValue(true);
  const quick_login = jest.fn();
  const setUser = jest.fn();
  renderSignIn({ quick_login, setUser });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(admin-tabs)/dashboard'));
  expect(setUser).toHaveBeenCalledWith({ userId: 'a1', role: 'admin', symbol: 'ADM' });
  expect(quick_login).not.toHaveBeenCalled(); // zalogowany - bez okna PIN
});

test('dwa konta punktów: lista do wyboru, bez automatycznego PIN-u', async () => {
  const SECOND = { userId: 'u2', secret: 'z', symbol: 'SOP', sellingPoint: 'Sopot', email: 'sopot@wp.pl', role: 'user' };
  quickLogin.getAccounts.mockResolvedValue([SAVED, SECOND]);
  const quick_login = jest.fn(async () => ({ role: 'user', symbol: 'SOP' }));
  const screen = renderSignIn({ quick_login });
  await waitFor(() => expect(screen.getByTestId('quick-login-list')).toBeTruthy());
  await act(async () => { await Promise.resolve(); });
  expect(quick_login).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByTestId('quick-account-u2')); });
  expect(quick_login).toHaveBeenCalledWith('u2');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
});
