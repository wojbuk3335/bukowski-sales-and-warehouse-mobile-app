import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// Zakładka „+” (7.11.2026): pełnoekranowe „Pobieranie danych z backendu…” (które odmontowuje skaner) tylko, gdy
// jakiegoś zbioru NIGDY nie udało się pobrać. Przeterminowane dane (stan po 30 s, słowniki po 5 min) odświeżają się
// w tle - skaner stoi od razu. Dawniej każde wejście po > 30 s od ostatniego pobrania stanu = ekran ładowania.

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
  useIsFocused: () => true,
}));
jest.mock('../../app/QRScanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'QR-SCANNER');
});
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));
jest.mock('../../services/tokenService', () => ({
  __esModule: true,
  default: {
    isLoggingOut: false,
    authenticatedFetch: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })),
  },
}));

import Create from '../../app/(tabs)/create';
import { GlobalStateContext } from '../../context/GlobalState';

const REQUIRED = ['sizes', 'colors', 'goods', 'stocks', 'state', 'users', 'bags', 'wallets'];

// everFetched: czy zbiory były kiedykolwiek pobrane (isDataFresh z maxAgeMs = Infinity); przy zwykłym pytaniu
// o świeżość (bez maxAgeMs) zawsze „nieświeże” - jak stan po 30 s od pobrania
const contextWith = ({ everFetched }) => {
  let release;
  const ensureData = jest.fn(() => new Promise((resolve) => { release = () => resolve(REQUIRED); }));
  const isDataFresh = jest.fn((keys, maxAgeMs) => (maxAgeMs === Infinity ? everFetched : false));
  const value = {
    stateData: [], user: { symbol: 'M' }, sizes: [], colors: [], goods: [], stocks: [], users: [], bags: [], wallets: [],
    ensureData, isDataFresh, getFilteredSellingPoints: jest.fn(() => []),
  };
  return { value, ensureData, isDataFresh, release: () => release() };
};

const renderCreate = (value) => render(
  <GlobalStateContext.Provider value={value}>
    <Create />
  </GlobalStateContext.Provider>
);

describe('zakładka „+” - ekran ładowania tylko, gdy danych nigdy nie było', () => {
  it('dane pobrane wcześniej (choć przeterminowane): skaner od razu, odświeżenie w tle, bez ekranu ładowania', async () => {
    const ctx = contextWith({ everFetched: true });
    const screen = renderCreate(ctx.value);

    expect(screen.getByText('QR-SCANNER')).toBeTruthy();
    expect(screen.queryByText('Pobieranie danych z backendu...')).toBeNull();
    await waitFor(() => expect(ctx.ensureData).toHaveBeenCalledWith(REQUIRED));
    expect(ctx.isDataFresh).toHaveBeenCalledWith(REQUIRED, Infinity);

    // w trakcie pobierania w tle skaner nadal stoi
    expect(screen.queryByText('Pobieranie danych z backendu...')).toBeNull();
    ctx.release();
    await waitFor(() => expect(screen.getByText('QR-SCANNER')).toBeTruthy());
  });

  it('jakiegoś zbioru nigdy nie pobrano (np. zaraz po zalogowaniu): ekran ładowania, skaner po pobraniu', async () => {
    const ctx = contextWith({ everFetched: false });
    const screen = renderCreate(ctx.value);

    await waitFor(() => expect(screen.getByText('Pobieranie danych z backendu...')).toBeTruthy());
    expect(screen.queryByText('QR-SCANNER')).toBeNull();
    await waitFor(() => expect(ctx.ensureData).toHaveBeenCalledWith(REQUIRED));

    ctx.release();
    await waitFor(() => expect(screen.getByText('QR-SCANNER')).toBeTruthy());
    expect(screen.queryByText('Pobieranie danych z backendu...')).toBeNull();
  });
});
