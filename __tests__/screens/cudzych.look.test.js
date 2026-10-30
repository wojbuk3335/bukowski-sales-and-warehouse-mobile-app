import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Cudzich (30.10.2026): wygląd jak na ekranach admina - karta salda, karty menu (Odbiór, Zwrot, Wpłata, Wypłata),
// karty transakcji z kolorowym paskiem; ten sam wygląd w zakładce punktu P i na ekranie admina (Różne → Cudzich).
// Filtr dat bez wyników pokazuje „Brak transakcji w wybranym okresie” (dawniej całą historię).

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), []);
  },
  useIsFocused: () => true,
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true }, jest.fn(() => Promise.resolve({ granted: true }))],
}));
jest.mock('../../components/scanner/ScanCamera', () => () => null);
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));

import Cudzych from '../../app/(tabs)/cudzych';
import CudzichList from '../../app/cudzich-list';
import { CudzichBalanceCard, CudzichTransactionCard, cudzichType } from '../../components/CudzichLook';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const TRANSACTIONS = [
  { _id: 't1', type: 'odbior', productName: 'Ada CZERWONY', size: 'XL', price: 900, date: '2026-10-29T10:00:00.000Z', notes: 'na próbę' },
  { _id: 't2', type: 'wplata', price: 500, date: '2026-10-28T10:00:00.000Z' },
];
const context = {
  user: { symbol: 'P', email: 'p@test.pl', role: 'user' },
  goods: [], sizes: [], stocks: [], colors: [], bags: [], wallets: [], stateData: [], users: [],
  ensureData: jest.fn(() => Promise.resolve([])),
};

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    const text = String(url);
    if (text.includes('/cudzich/balance')) return response({ balance: 400 });
    if (text.includes('/cudzich/transactions')) return response(TRANSACTIONS);
    if (text.includes('/cudzich/pricelist')) return response({ priceList: [] });
    return response({});
  });
});

describe('Karty Cudzicha', () => {
  test('karta transakcji: typ po polsku, kwota ze znakiem wpływu na saldo, produkt, rozmiar, uwagi', () => {
    const screen = render(<CudzichTransactionCard transaction={TRANSACTIONS[0]} />);
    expect(screen.getByText('Odbiór')).toBeTruthy();
    expect(screen.getByText('+900,00 zł')).toBeTruthy();
    expect(screen.getByText('Ada CZERWONY')).toBeTruthy();
    expect(screen.getByText('XL')).toBeTruthy();
    expect(screen.getByText('na próbę')).toBeTruthy();

    const payment = render(<CudzichTransactionCard transaction={TRANSACTIONS[1]} />);
    expect(payment.getByText('Wpłata')).toBeTruthy();
    expect(payment.getByText('−500,00 zł')).toBeTruthy(); // wpłata zmniejsza saldo
    expect(payment.queryByText('Produkt:')).toBeNull();
  });

  test('karta salda: dodatnie (do zapłaty) czerwone, zero zielone; kolory typów wspólne', () => {
    const owes = render(<CudzichBalanceCard balance={400} />);
    expect(owes.getByTestId('cudzich-balance-amount').props.children.join('')).toBe('400,00 zł');
    expect(owes.getByTestId('cudzich-balance-amount').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#EF4444' })]));
    const settled = render(<CudzichBalanceCard balance={0} />);
    expect(settled.getByTestId('cudzich-balance-amount').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#10B981' })]));
    expect(cudzichType('odbior').color).toBe('#22C55E');
    expect(cudzichType('zwrot').color).toBe('#EF4444');
  });
});

describe('Zakładka Cudzich (punkt P)', () => {
  const renderTab = () => render(<GlobalStateContext.Provider value={context}><Cudzych /></GlobalStateContext.Provider>);

  test('karta salda, karty menu operacji i karty transakcji jak na ekranach admina', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    expect(screen.getByTestId('cudzich-balance-card')).toBeTruthy();
    ['odbior', 'zwrot', 'wplata', 'wyplata'].forEach((type) => expect(screen.getByTestId(`cudzich-action-${type}`)).toBeTruthy());
    expect(screen.getByText('Cudzich bierze kurtkę - skanuj metkę')).toBeTruthy();
    expect(screen.getByTestId('cudzich-transaction-t2')).toBeTruthy();
  });

  test('Wpłata otwiera okienko wpłaty', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-wplata'));
    await waitFor(() => expect(screen.getAllByText(/Wpłata/).length).toBeGreaterThan(1));
  });

  test('filtr dat bez wyników: „Brak transakcji w wybranym okresie” zamiast całej historii', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-date-filter'));
    fireEvent.press(await screen.findByText('Dziś')); // transakcje są z 28-29.10 - dziś (w teście) nic
    await waitFor(() => expect(screen.queryByTestId('cudzich-transaction-t1')).toBeNull());
    expect(screen.getByText('Brak transakcji w wybranym okresie')).toBeTruthy();
  });

  test('inny punkt niż P - brak dostępu', () => {
    const screen = render(<GlobalStateContext.Provider value={{ ...context, user: { symbol: 'T' } }}><Cudzych /></GlobalStateContext.Provider>);
    expect(screen.getByText('Brak dostępu do tej sekcji')).toBeTruthy();
  });
});

describe('Ekran admina Różne → Cudzich', () => {
  test('te same karty: saldo i transakcje z kwotą i uwagami (dawniej kwota i uwagi się nie pokazywały)', async () => {
    const screen = render(<GlobalStateContext.Provider value={context}><CudzichList /></GlobalStateContext.Provider>);
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    expect(screen.getByTestId('cudzich-balance-card')).toBeTruthy();
    expect(screen.getByText('+900,00 zł')).toBeTruthy();
    expect(screen.getByText('na próbę')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Szukaj transakcji...'), 'wpłata'); // nazwa typu po polsku
    await waitFor(() => expect(screen.queryByTestId('cudzich-transaction-t1')).toBeNull());
    expect(screen.getByTestId('cudzich-transaction-t2')).toBeTruthy();
  });
});
