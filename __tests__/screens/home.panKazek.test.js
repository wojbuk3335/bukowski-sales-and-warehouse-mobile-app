import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Pan Kazek w Sprzedaży (1.11.2026): kropka szara po zwrocie, rozliczona / zwrócona kurtka bez „Usuń z listy”
// (serwer i tak odrzucał), lista pobierana tylko na punkcie Most i tylko dzisiejsza.

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

import Home from '../../app/(tabs)/home';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const now = new Date().toISOString();
const sale = (id, fullName, extra = {}) => ({ _id: id, fullName, size: 'XL', sellingPoint: 'Most', from: 'M', date: now, timestamp: now, cash: [{ price: 900, currency: 'PLN' }], card: [], ...extra });
const SALES = [sale('s-new', 'Ada CZERWONY'), sale('s-paid', 'Bella CZARNY'), sale('s-back', 'Cyra ZIELONY', { returned: true }), sale('s-plain', 'Dora BIAŁY')];
const KAZEK = [
  { productId: 's-new', status: 'pending' },
  { productId: 's-paid', status: 'paid' },
  { productId: 's-back', status: 'cancelled' },
];

const contextFor = (user) => ({
  user, users: [], stateData: [], goods: [], sizes: [], colors: [], stocks: [],
  fetchUsers: jest.fn(), fetchState: jest.fn(), fetchGoods: jest.fn(), fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
  ensureData: jest.fn(() => Promise.resolve([])),
});
const MOST = { _id: 'u-m', email: 'most@wp.pl', symbol: 'M', sellingPoint: 'Most', role: 'user' };
const renderHome = (user = MOST) => render(
  <GlobalStateContext.Provider value={contextFor(user)}>
    <Home />
  </GlobalStateContext.Provider>
);
const openOptions = async (screen, name) => {
  const rows = await screen.findAllByText('⋮');
  const index = SALES.findIndex((item) => item.fullName === name);
  fireEvent.press(rows[index]);
};

beforeEach(() => {
  window.__TESTING_API_CALLS__ = true;
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    const text = String(url);
    if (text.includes('/sales/get-all-sales')) return response(SALES);
    if (text.includes('/pan-kazek')) return response({ data: KAZEK });
    return response([]);
  });
});
afterEach(() => { delete window.__TESTING_API_CALLS__; });

test('Most: lista tylko dzisiejsza; kropka zielona (do rozliczenia, rozliczona), szara (zwrot); bez kropki - zwykła sprzedaż', async () => {
  const screen = renderHome();
  expect(await screen.findByTestId('sale-pan-kazek-dot-s-new', {}, { timeout: 5000 })).toBeTruthy();
  const urls = tokenService.authenticatedFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/pan-kazek'));
  expect(urls.every((url) => url.endsWith('/pan-kazek?today=1'))).toBe(true);
  const colorOf = (id) => [].concat(screen.getByTestId(`sale-pan-kazek-dot-${id}`).props.style).find((s) => s?.color).color;
  expect(colorOf('s-new')).toBe('#28a745');
  expect(colorOf('s-paid')).toBe('#28a745');
  expect(colorOf('s-back')).toBe('#94A3B8');
  expect(screen.queryByTestId('sale-pan-kazek-dot-s-plain')).toBeNull();
});

test('Most, ⋮: do rozliczenia - „Usuń z listy”; rozliczona i zwrócona - sam stan; zwykła - „Od Pana Kazka”', async () => {
  const screen = renderHome();
  await screen.findByTestId('sale-pan-kazek-dot-s-new', {}, { timeout: 5000 });

  await openOptions(screen, 'Ada CZERWONY');
  expect(screen.getByTestId('sale-option-pan-kazek-remove')).toBeTruthy();

  await openOptions(screen, 'Bella CZARNY');
  expect(screen.queryByTestId('sale-option-pan-kazek-remove')).toBeNull();
  expect(screen.getByTestId('sale-option-pan-kazek-info-note').props.children).toBe('Rozliczona z Panem Kazkiem');

  await openOptions(screen, 'Cyra ZIELONY');
  expect(screen.getByTestId('sale-option-pan-kazek-info-note').props.children).toBe('Zwrot - Panu Kazkowi nie płacimy');

  await openOptions(screen, 'Dora BIAŁY');
  expect(screen.queryByTestId('sale-option-pan-kazek-info')).toBeNull();
  expect(screen.getByTestId('sale-option-pan-kazek')).toBeTruthy();
});

test('inny punkt: listy Pana Kazka nie pobiera', async () => {
  const screen = renderHome({ _id: 'u-p', email: 'p@test.pl', symbol: 'P', sellingPoint: 'Most2', role: 'user' });
  await screen.findByText('Sprzedaż dzisiaj', {}, { timeout: 5000 });
  await waitFor(() => expect(tokenService.authenticatedFetch.mock.calls.some(([url]) => String(url).includes('/sales/get-all-sales'))).toBe(true));
  expect(tokenService.authenticatedFetch.mock.calls.some(([url]) => String(url).includes('/pan-kazek'))).toBe(false);
});

test('Operacje dzisiaj: zwrot kurtki opisany jako oddane pieniądze (nie „Zaliczka na produkt”), z powodem', async () => {
  const refund = { _id: 'op-r', type: 'refund', amount: -800, currency: 'PLN', date: now, reason: 'Zwrot kurtki: Alan SZARY XL - za mała', productName: 'Alan SZARY', productSize: 'XL', userSymbol: 'M' };
  const advance = { _id: 'op-a', type: 'addition', amount: 200, currency: 'PLN', date: now, reason: 'Zaliczka', productName: 'Bella CZARNY', userSymbol: 'M' };
  tokenService.authenticatedFetch.mockImplementation((url) => {
    const text = String(url);
    if (text.includes('/sales/get-all-sales')) return response(SALES);
    if (text.includes('/pan-kazek')) return response({ data: KAZEK });
    if (text.includes('financial-operations')) return response([refund, advance]);
    return response([]);
  });
  const screen = renderHome();
  expect(await screen.findByText(/Zwrot kurtki - oddano klientowi: Alan SZARY XL/, {}, { timeout: 5000 })).toBeTruthy();
  expect(screen.getByText(/Powód: za mała/)).toBeTruthy();
  expect(screen.queryByText(/Zaliczka na produkt Alan/)).toBeNull();
  expect(screen.getByText(/Zaliczka na produkt Bella CZARNY/)).toBeTruthy();
});
