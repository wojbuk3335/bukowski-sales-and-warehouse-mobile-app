import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Sprzedaż (29.10.2026): nagłówek i stopka listy są gotowymi elementami, nie funkcjami. Funkcja przekazana jako
// ListHeaderComponent to dla FlatList nowy typ komponentu przy każdym renderze - nagłówek (sprzedawcy, godziny)
// i stopka (transfery, zaliczki, zamknięcie dnia) były montowane od nowa po każdej zmianie stanu ekranu,
// czyli po każdej literce w którymkolwiek z okienek. Test liczy montowania nagłówka.

global.__screenHeaderMounts = 0;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
  useIsFocused: () => true,
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true }, jest.fn(() => Promise.resolve({ granted: true }))],
}));
jest.mock('../../components/scanner/ScanCamera', () => () => null);
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}`, API_CONFIG: { BASE_URL: 'http://mock.api', TIMEOUT: 30000 } }));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../../services/currencyService', () => ({
  __esModule: true,
  default: {
    getAllExchangeRates: jest.fn(() => Promise.resolve({})),
    getDefaultRates: jest.fn(() => ({})),
    getCurrencyRate: jest.fn(() => Promise.resolve(1)),
    updateCurrencyRate: jest.fn(() => Promise.resolve(true)),
  },
}));
jest.mock('../../components/AdminLook', () => {
  const actual = jest.requireActual('../../components/AdminLook');
  const React = require('react');
  const { Text } = require('react-native');
  const ScreenHeader = ({ title }) => {
    React.useEffect(() => { global.__screenHeaderMounts += 1; }, []);
    return React.createElement(Text, null, title);
  };
  return { ...actual, ScreenHeader };
});

import Home from '../../app/(tabs)/home';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { _id: 'u1', email: 'p@test.pl', symbol: 'P', sellingPoint: 'Parzygnat', role: 'user' },
  users: [], stateData: [], goods: [], sizes: [], colors: [], stocks: [],
  fetchUsers: jest.fn(), fetchState: jest.fn(), fetchGoods: jest.fn(), fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
  ensureData: jest.fn(() => Promise.resolve([])),
};

const renderHome = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Home />
  </GlobalStateContext.Provider>
);

beforeEach(() => {
  global.__screenHeaderMounts = 0;
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation(() => response([]));
  Object.values(contextValue).forEach((value) => value?.mockClear?.());
});

describe('Sprzedaż: wejście na zakładkę', () => {
  test('słowniki i stan przez ensureData (tylko gdy nieświeże), nie salwa 6 pełnych pobrań', async () => {
    window.__TESTING_API_CALLS__ = true;
    try {
      const screen = renderHome();
      await screen.findByText('Sprzedaż dzisiaj', {}, { timeout: 5000 });
      await waitFor(() => expect(contextValue.ensureData).toHaveBeenCalled());

      expect(contextValue.ensureData).toHaveBeenCalledTimes(1);
      expect(contextValue.ensureData.mock.calls[0][0]).toEqual(['users', 'state', 'goods', 'sizes', 'colors', 'stocks']);
      ['fetchUsers', 'fetchState', 'fetchGoods', 'fetchSizes', 'fetchColors', 'fetchStock'].forEach((name) => {
        expect(contextValue[name]).not.toHaveBeenCalled();
      });
    } finally {
      delete window.__TESTING_API_CALLS__;
    }
  });
});

describe('Sprzedaż: nagłówek i stopka listy nie są montowane od nowa', () => {
  test('ListHeaderComponent / ListFooterComponent to elementy, nie funkcje', async () => {
    const screen = renderHome();
    await screen.findByText('Sprzedaż dzisiaj', {}, { timeout: 5000 });

    const list = screen.getByTestId('home-flatlist');
    expect(React.isValidElement(list.props.ListHeaderComponent)).toBe(true);
    expect(React.isValidElement(list.props.ListFooterComponent)).toBe(true);
  });

  test('zmiana stanu ekranu (otwarcie okienka) przerysowuje nagłówek, ale nie montuje go od nowa', async () => {
    const screen = renderHome();
    await screen.findByText('Sprzedaż dzisiaj', {}, { timeout: 5000 });
    await waitFor(() => expect(global.__screenHeaderMounts).toBe(1));

    fireEvent.press(screen.getByTestId('add-salesperson-button')); // setState w Home → nowy render całego ekranu
    await waitFor(() => expect(screen.getByText('Sprzedaż dzisiaj')).toBeTruthy());
    fireEvent.press(screen.getByTestId('add-salesperson-button'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(global.__screenHeaderMounts).toBe(1); // przed poprawką: 3 (nowe zamontowanie po każdym renderze)
  });
});
