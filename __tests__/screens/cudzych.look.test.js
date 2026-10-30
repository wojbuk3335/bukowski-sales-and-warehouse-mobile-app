import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Cudzich (30.10.2026): wygląd jak na ekranach admina; historia porcjami z miejscem na dolny pasek zakładek;
// kamera ta sama co w „Dodaj” na cały ekran; nazwa z karty produktu; cena od razu w polu - cennik Cudzich,
// bez niego karta produktu; skan w „Zwrot” zapisuje zwrot (dawniej zawsze odbiór).

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
// Kamera: przycisk „zeskanuj” podaje kod do onScanned; zapamiętujemy przekazane ustawienia (porównanie z „Dodaj”)
global.__scanCameraProps = null;
jest.mock('../../components/scanner/ScanCamera', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return function ScanCameraMock(props) {
    global.__scanCameraProps = props;
    return React.createElement(View, { testID: 'scan-camera' },
      React.createElement(TouchableOpacity, { testID: 'fake-scan', onPress: () => props.onScanned({ data: global.__scanCode, type: 'code128' }) },
        React.createElement(Text, null, 'scan')),
      ...(props.extraActions || []).map((action) => React.createElement(TouchableOpacity, { key: action.testID, testID: action.testID, onPress: action.onPress },
        React.createElement(Text, null, action.label))),
      props.children);
  };
});
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
import { appAlert } from '../../services/appAlert';

const response = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const tx = (i, extra = {}) => ({ _id: `t${i}`, type: 'wplata', price: 100 + i, date: new Date(Date.UTC(2026, 9, 29, 10, 0, 0) - i * 3600000).toISOString(), ...extra });
const TRANSACTIONS = [
  { _id: 't1', type: 'odbior', productName: 'Ada CZERWONY', size: 'XL', price: 900, date: '2026-10-29T10:00:00.000Z', notes: 'na próbę' },
  { _id: 't2', type: 'wplata', price: 500, date: '2026-10-28T10:00:00.000Z' },
];
// Karty produktów: kurtka Ada (kod modelu+koloru 00107), Bella bez pozycji w cenniku Cudzich, torebka po pełnym kodzie
const GOODS = [
  { _id: 'g-ada', fullName: 'Ada CZERWONY', code: '0010700000002', category: 'Kurtki kożuchy futra', price: 1200, discount_price: 0, priceExceptions: [] },
  { _id: 'g-bella', fullName: 'Bella CZARNY', code: '0020400000009', category: 'Kurtki kożuchy futra', price: 990, discount_price: 0, priceExceptions: [] },
];
const SIZES = [{ _id: 's-xl', Roz_Kod: '013', Roz_Opis: 'XL' }, { _id: 's-m', Roz_Kod: '010', Roz_Opis: 'M' }];
const PRICE_LIST = { items: [{ originalGoodId: 'g-ada', fullName: 'Ada CZERWONY', price: 850, discountPrice: 0, priceExceptions: [] }] };
const ADA_XL = '0010701300002';
const BELLA_M = '0020401000004';

const context = {
  user: { symbol: 'P', email: 'p@test.pl', role: 'user', sellingPoint: 'Parzygnat', location: 'Zakopane' },
  goods: GOODS, sizes: SIZES, stocks: [{ Tow_Kod: '001', Tow_Opis: 'Ada' }], colors: [{ Kol_Kod: '07', Kol_Opis: 'CZERWONY' }],
  stateData: [], users: [{ _id: 'u-p', symbol: 'P', location: 'Zakopane', sellingPoint: 'Parzygnat', role: 'user' }],
  ensureData: jest.fn(() => Promise.resolve([])),
};

let serveTransactions;
let balanceValue;
let candidates;
const urls = () => tokenService.authenticatedFetch.mock.calls.map(([url]) => String(url));
const posts = (part) => tokenService.authenticatedFetch.mock.calls
  .filter(([url, options]) => String(url).includes(part) && options?.method === 'POST')
  .map(([, options]) => JSON.parse(options.body));

beforeEach(() => {
  appAlert.mockReset();
  global.__scanCode = ADA_XL;
  balanceValue = 400;
  candidates = [
    { saleId: 's-new', date: '2026-10-25T10:00:00.000Z', price: 800, fullName: 'Ada CZERWONY', size: 'XL', goodsId: 'g-ada', barcode: ADA_XL, processed: true },
    { saleId: 's-old', date: '2026-10-10T10:00:00.000Z', price: 750, fullName: 'Ada CZERWONY', size: 'XL', goodsId: 'g-ada', barcode: ADA_XL, processed: true },
    { saleId: 's-bella', date: '2026-10-05T10:00:00.000Z', price: 900, fullName: 'Bella CZARNY', size: 'M', goodsId: 'g-bella', barcode: BELLA_M, processed: false },
  ];
  serveTransactions = (params) => {
    if (params.get('startDate')) return { transactions: [], page: 1, limit: 30, total: 0, hasMore: false };
    return { transactions: TRANSACTIONS, page: 1, limit: 30, total: TRANSACTIONS.length, hasMore: false };
  };
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    const text = String(url);
    if (text.includes('/cudzich/balance')) return response({ balance: balanceValue });
    if (text.includes('/cudzich/returns/candidates')) return response({ candidates, count: candidates.length });
    if (text.includes('/cudzich/returns') && options.method === 'POST') return response({ transaction: { price: 750 }, newBalance: -350 }, 201);
    if (text.includes('/cudzich/transactions') && options.method === 'POST') return response({ newBalance: 1250 }, 201);
    if (text.includes('/cudzich/transactions')) return response(serveTransactions(new URL(text).searchParams));
    if (text.includes('/cudzich/pricelist')) return response(PRICE_LIST);
    if (text.includes('/sales/')) return response({ ok: true });
    return response({});
  });
});

const renderTab = (ctx = context) => render(<GlobalStateContext.Provider value={ctx}><Cudzych /></GlobalStateContext.Provider>);
const openScanner = async (screen, type) => {
  await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
  fireEvent.press(screen.getByTestId(`cudzich-action-${type}`));
  await waitFor(() => expect(screen.getByTestId('scan-camera')).toBeTruthy());
};

describe('Karty Cudzicha', () => {
  test('karta transakcji: typ po polsku, kwota ze znakiem wpływu na saldo, produkt, rozmiar, uwagi', () => {
    const screen = render(<CudzichTransactionCard transaction={TRANSACTIONS[0]} />);
    expect(screen.getByText('Odbiór')).toBeTruthy();
    expect(screen.getByText('+900,00 zł')).toBeTruthy();
    expect(screen.getByText('Ada CZERWONY')).toBeTruthy();
    expect(screen.getByText('na próbę')).toBeTruthy();
    const payment = render(<CudzichTransactionCard transaction={TRANSACTIONS[1]} />);
    expect(payment.getByText('−500,00 zł')).toBeTruthy(); // wpłata zmniejsza saldo
  });

  test('karta salda słownie: na plusie „Cudzich jest nam winien”, na minusie „Należy zwrócić Cudzichowi” (kwota bez minusa), zero - rozliczone', () => {
    const owes = render(<CudzichBalanceCard balance={400} />);
    expect(owes.getByTestId('cudzich-balance-label').props.children).toBe('Cudzich jest nam winien');
    expect(owes.getByTestId('cudzich-balance-amount').props.children.join('')).toBe('400,00 zł');
    expect(owes.getByTestId('cudzich-balance-amount').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#EF4444' })]));

    const weOwe = render(<CudzichBalanceCard balance={-590} />);
    expect(weOwe.getByTestId('cudzich-balance-label').props.children).toBe('Należy zwrócić Cudzichowi');
    expect(weOwe.getByTestId('cudzich-balance-amount').props.children.join('')).toBe('590,00 zł');

    const settled = render(<CudzichBalanceCard balance={0} />);
    expect(settled.getByTestId('cudzich-balance-label').props.children).toBe('Rozliczone - nikt nikomu nic nie jest winien');
    expect(settled.getByTestId('cudzich-balance-amount').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#10B981' })]));
    expect(cudzichType('odbior').color).toBe('#22C55E');
  });
});

describe('Zakładka Cudzich (punkt P): lista', () => {
  test('saldo, karty operacji, transakcje; lista ma miejsce na dolny pasek zakładek', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    expect(screen.getByTestId('cudzich-balance-card')).toBeTruthy();
    ['odbior', 'zwrot', 'settle'].forEach((type) => expect(screen.getByTestId(`cudzich-action-${type}`)).toBeTruthy());
    const list = screen.getByTestId('cudzich-transactions-list');
    expect(list.props.contentContainerStyle.paddingBottom).toBeGreaterThanOrEqual(120);
  });

  test('historia porcjami: pierwsza strona z serwera, koniec listy dociąga kolejną', async () => {
    serveTransactions = (params) => {
      const page = Number(params.get('page'));
      const rows = Array.from({ length: 30 }, (_, i) => tx((page - 1) * 30 + i));
      return { transactions: page === 1 ? rows : rows.slice(0, 5), page, limit: 30, total: 35, hasMore: page === 1 };
    };
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-transactions-list').props.data).toHaveLength(30));
    const first = new URL(urls().find((url) => url.includes('/cudzich/transactions'))).searchParams;
    expect(first.get('page')).toBe('1');
    expect(first.get('limit')).toBe('30');
    expect(screen.getByText('Historia transakcji (35)')).toBeTruthy();

    fireEvent(screen.getByTestId('cudzich-transactions-list'), 'onEndReached');
    await waitFor(() => expect(screen.getByTestId('cudzich-transactions-list').props.data).toHaveLength(35));
  });

  test('filtr dat liczy serwer; bez wyników - „Brak transakcji w wybranym okresie”', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-date-filter'));
    fireEvent.press(await screen.findByText('Dziś'));
    expect(await screen.findByText('Brak transakcji w wybranym okresie', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId('cudzich-transaction-t1')).toBeNull();
    expect(urls().some((url) => url.includes('/cudzich/transactions') && new URL(url).searchParams.get('startDate'))).toBe(true);
  });
});

describe('Zakładka Cudzich: skaner, nazwa i cena', () => {
  test('kamera jak w „Dodaj” (+ „Z bazy”), na cały ekran zamiast listy; „Wpisz ręcznie” usunięte', async () => {
    const screen = renderTab();
    expect(await screen.findByTestId('cudzich-action-odbior')).toBeTruthy();
    expect(screen.queryByTestId('cudzich-action-manual')).toBeNull();
    expect(screen.queryByText('Wpisz ręcznie')).toBeNull();
    await openScanner(screen, 'odbior');
    expect(Object.keys(global.__scanCameraProps).filter((key) => key !== 'children').sort()).toEqual(['enabled', 'extraActions', 'facing', 'onScanned', 'resolveName']);
    expect(global.__scanCameraProps.extraActions.map((action) => action.label)).toEqual(['Z bazy']);
    expect(screen.queryByTestId('cudzich-transactions-list')).toBeNull();
    expect(await global.__scanCameraProps.resolveName(ADA_XL)).toBe('Ada CZERWONY XL'); // pełna nazwa z karty produktu
    expect(await global.__scanCameraProps.resolveName('9999999999999')).toBeNull();
  });

  test('odbiór „Z bazy”: produkt i rozmiar z kart produktów - jak skan metki (nazwa, cena z cennika Cudzich)', async () => {
    const screen = renderTab();
    await openScanner(screen, 'odbior');
    fireEvent.press(screen.getByTestId('cudzich-scan-base'));
    expect(await screen.findByTestId('product-base-picker')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('product-base-search'), 'ada');
    fireEvent.press(screen.getByTestId('product-base-good-g-ada'));
    fireEvent.press(await screen.findByTestId('product-base-size-XL'));
    await waitFor(() => expect(screen.getByText('Odbiór - Cudzich bierze kurtkę')).toBeTruthy());
    expect(screen.getByDisplayValue('Ada CZERWONY XL')).toBeTruthy();
    expect(screen.getByDisplayValue(ADA_XL)).toBeTruthy(); // kod metki z karty + rozmiaru
    expect(screen.getByTestId('cudzich-scanned-price').props.value).toBe('850');
  });
  test('odbiór: pełna nazwa z karty produktu, cena od razu w polu z cennika Cudzich, zapis odbioru z produktem', async () => {
    const screen = renderTab();
    await openScanner(screen, 'odbior');
    fireEvent.press(screen.getByTestId('fake-scan'));
    await waitFor(() => expect(screen.getByText('Odbiór - Cudzich bierze kurtkę')).toBeTruthy());
    expect(screen.getByDisplayValue('Ada CZERWONY XL')).toBeTruthy();
    expect(screen.getByTestId('cudzich-scanned-price').props.value).toBe('850'); // cennik Cudzich, nie karta (1200)
    expect(screen.getByText('Sprzedano od')).toBeTruthy();

    fireEvent.press(screen.getByTestId('cudzich-scanned-confirm'));
    await waitFor(() => expect(posts('/cudzich/transactions')).toHaveLength(1));
    expect(posts('/cudzich/transactions')[0]).toMatchObject({ type: 'odbior', productId: 'g-ada', productName: 'Ada CZERWONY', size: 'XL', price: 850 });
    expect(posts('/sales/save-sales')[0]).toMatchObject({ fullName: 'Ada CZERWONY', size: 'XL', barcode: ADA_XL, source: 'Cudzich' });
  });

  test('produkt bez pozycji w cenniku Cudzich: cena z karty produktu; można ją poprawić przed zapisem', async () => {
    global.__scanCode = BELLA_M;
    const screen = renderTab();
    await openScanner(screen, 'odbior');
    fireEvent.press(screen.getByTestId('fake-scan'));
    await waitFor(() => expect(screen.getByTestId('cudzich-scanned-price').props.value).toBe('990'));
    expect(screen.getByDisplayValue('Bella CZARNY M')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('cudzich-scanned-price'), '950,50');
    fireEvent.press(screen.getByTestId('cudzich-scanned-confirm'));
    await waitFor(() => expect(posts('/cudzich/transactions')).toHaveLength(1));
    expect(posts('/cudzich/transactions')[0]).toMatchObject({ productId: 'g-bella', price: 950.5 });
  });

  test('bez cennika Cudzich (404) - cena z karty produktu', async () => {
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      const text = String(url);
      if (text.includes('/cudzich/pricelist')) return response({ error: 'brak' }, 404);
      if (text.includes('/cudzich/balance')) return response({ balance: 0 });
      if (text.includes('/cudzich/transactions')) return response({ transactions: TRANSACTIONS, page: 1, limit: 30, total: 2, hasMore: false });
      return response({});
    });
    const screen = renderTab();
    await openScanner(screen, 'odbior');
    fireEvent.press(screen.getByTestId('fake-scan'));
    await waitFor(() => expect(screen.getByTestId('cudzich-scanned-price').props.value).toBe('1200'));
  });

  test('Zwrot otwiera od razu listę kurtek u Cudzicha (bez skanera); licznik na karcie salda', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-items-count')).toBeTruthy());
    expect(screen.getByText('U Cudzicha: 3 kurtki')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cudzich-action-zwrot'));
    expect(await screen.findByTestId('cudzich-return-list')).toBeTruthy();
    expect(screen.queryByTestId('scan-camera')).toBeNull();
    ['s-new', 's-old', 's-bella'].forEach((id) => expect(screen.getByTestId(`cudzich-return-sale-${id}`)).toBeTruthy());
    expect(urls().some((url) => url.endsWith('/cudzich/returns/candidates'))).toBe(true);
    // bez wyboru nie da się zwrócić
    expect(screen.getByTestId('cudzich-return-confirm').props.accessibilityState?.disabled ?? true).toBe(true);
  });

  test('kilka kurtek naraz: zaznaczanie i odznaczanie, podsumowanie z kredytem, jeden zapis z wieloma pozycjami', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-items-count')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-zwrot'));
    fireEvent.press(await screen.findByTestId('cudzich-return-sale-s-new'));
    fireEvent.press(screen.getByTestId('cudzich-return-sale-s-old'));
    fireEvent.press(screen.getByTestId('cudzich-return-sale-s-bella'));
    fireEvent.press(screen.getByTestId('cudzich-return-sale-s-bella')); // odznaczona
    expect(screen.getByTestId('cudzich-return-summary').props.children.join('')).toBe('Zwracasz 2 kurtki · kredyt dla Cudzicha 1550.00 zł');
    expect(screen.getByText('Zwróć 2 kurtki do MAGAZYNU')).toBeTruthy();

    fireEvent.press(screen.getByTestId('cudzich-return-confirm'));
    await waitFor(() => expect(posts('/cudzich/returns')).toHaveLength(1));
    expect(posts('/cudzich/returns')[0]).toEqual({ items: [{ saleId: 's-new' }, { saleId: 's-old' }], notes: '' });
    expect(posts('/cudzich/transactions')).toHaveLength(0);
    expect(posts('/sales/')).toHaveLength(0);
  });
  test('wyszukiwarka i skan zawężają listę; jedna pasująca kurtka po skanie - od razu zaznaczona', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-items-count')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-zwrot'));
    await screen.findByTestId('cudzich-return-list');
    fireEvent.changeText(screen.getByTestId('cudzich-return-search'), 'bella');
    expect(screen.queryByTestId('cudzich-return-sale-s-new')).toBeNull();
    expect(screen.getByTestId('cudzich-return-sale-s-bella')).toBeTruthy();

    global.__scanCode = BELLA_M;
    fireEvent.press(screen.getByTestId('cudzich-return-scan'));
    await waitFor(() => expect(screen.getByTestId('scan-camera')).toBeTruthy());
    fireEvent.press(screen.getByTestId('fake-scan'));
    await waitFor(() => expect(screen.getByTestId('cudzich-return-list')).toBeTruthy());
    expect(screen.queryByTestId('cudzich-return-sale-s-new')).toBeNull();
    expect(screen.getByTestId('cudzich-return-sale-s-bella').props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('Bella CZARNY M')).toBeTruthy(); // plakietka skanu
  });

  test('zwrot mieszany: kurtka z listy + kurtka sprzed systemu (skan spoza listy → formularz z ceną) w jednym zapisie', async () => {
    candidates = candidates.filter((c) => c.saleId === 's-bella');
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-items-count')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-zwrot'));
    fireEvent.press(await screen.findByTestId('cudzich-return-sale-s-bella'));

    global.__scanCode = ADA_XL;
    fireEvent.press(screen.getByTestId('cudzich-return-scan'));
    await waitFor(() => expect(screen.getByTestId('scan-camera')).toBeTruthy());
    fireEvent.press(screen.getByTestId('fake-scan'));
    expect(await screen.findByTestId('cudzich-return-empty')).toBeTruthy();

    fireEvent.press(screen.getByTestId('cudzich-return-historical'));
    await waitFor(() => expect(screen.getByTestId('cudzich-manual-price').props.value).toBe('850'), { timeout: 3000 });
    fireEvent.changeText(screen.getByTestId('cudzich-manual-price'), '600');
    fireEvent.press(screen.getByText('Dodaj do zwrotu'));

    // z powrotem na liście: zaznaczona Bella + Ada sprzed systemu
    await waitFor(() => expect(screen.getByText('Ada CZERWONY XL · sprzed systemu · 600.00 zł')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByTestId('cudzich-return-summary').props.children.join('')).toBe('Zwracasz 2 kurtki · kredyt dla Cudzicha 1500.00 zł');
    expect(posts('/cudzich/returns')).toHaveLength(0); // jeszcze nic nie zapisane

    fireEvent.press(screen.getByTestId('cudzich-return-confirm'));
    await waitFor(() => expect(posts('/cudzich/returns')).toHaveLength(1));
    expect(posts('/cudzich/returns')[0]).toEqual({
      items: [{ saleId: 's-bella' }, { historical: true, productId: 'g-ada', size: 'XL', barcode: ADA_XL, price: 600 }],
      notes: '',
    });
  });

  test('zwrot „Z bazy”: wybór z kart produktów zawęża listę jak skan', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByTestId('cudzich-items-count')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-zwrot'));
    await screen.findByTestId('cudzich-return-list');
    fireEvent.press(screen.getByTestId('cudzich-return-base'));
    expect(await screen.findByTestId('product-base-picker', {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('product-base-search'), 'bella');
    fireEvent.press(screen.getByTestId('product-base-good-g-bella'));
    fireEvent.press(await screen.findByTestId('product-base-size-M'));
    await waitFor(() => expect(screen.getByTestId('cudzich-return-sale-s-bella').props.accessibilityState.checked).toBe(true), { timeout: 3000 });
    expect(screen.queryByTestId('cudzich-return-sale-s-new')).toBeNull();
  });
  test('bez ceny: komunikat zamiast zapisu', async () => {
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      const text = String(url);
      if (text.includes('/cudzich/transactions') && options.method === 'POST') return response({ newBalance: 0 }, 201);
      if (text.includes('/cudzich/transactions')) return response({ transactions: TRANSACTIONS, page: 1, limit: 30, total: 2, hasMore: false });
      if (text.includes('/cudzich/pricelist')) return response({ error: 'brak' }, 404);
      return response({ balance: 0 });
    });
    const ctx = { ...context, goods: GOODS.map((good) => ({ ...good, price: 0 })) };
    const screen = renderTab(ctx);
    await openScanner(screen, 'odbior');
    fireEvent.press(screen.getByTestId('fake-scan'));
    await waitFor(() => expect(screen.getByTestId('cudzich-scanned-price').props.value).toBe(''));
    fireEvent.press(screen.getByTestId('cudzich-scanned-confirm'));
    await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Brak ceny', expect.stringContaining('Ada CZERWONY XL')));
    expect(posts('/cudzich/transactions')).toHaveLength(0);
  });

  test('„Rozlicz saldo” (zamiast Wpłata/Wypłata): Cudzich jest nam winien → kwota od razu w polu, zapis wpłaty', async () => {
    const screen = renderTab();
    await waitFor(() => expect(screen.getByText('Cudzich płaci nam 400.00 zł')).toBeTruthy());
    expect(screen.queryByTestId('cudzich-action-wplata')).toBeNull();
    expect(screen.queryByTestId('cudzich-action-wyplata')).toBeNull();
    fireEvent.press(screen.getByTestId('cudzich-action-settle'));
    expect((await screen.findByTestId('cudzich-settle-info'))).toBeTruthy();
    expect(screen.getAllByText('Cudzich jest nam winien').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cudzich-settle-amount').props.value).toBe('400');
    fireEvent.press(screen.getByTestId('cudzich-settle-confirm'));
    await waitFor(() => expect(posts('/cudzich/transactions')).toHaveLength(1));
    expect(posts('/cudzich/transactions')[0]).toMatchObject({ type: 'wplata', price: 400 });
  });

  test('„Rozlicz saldo” na minusie: należy zwrócić Cudzichowi 590 zł → wypłata; częściowo można, więcej niż saldo nie', async () => {
    balanceValue = -590;
    const screen = renderTab();
    await waitFor(() => expect(screen.getByText('Oddajemy Cudzichowi 590.00 zł')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-settle'));
    await screen.findByTestId('cudzich-settle-info');
    expect(screen.getAllByText('Należy zwrócić Cudzichowi').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cudzich-settle-amount').props.value).toBe('590');

    fireEvent.changeText(screen.getByTestId('cudzich-settle-amount'), '700');
    fireEvent.press(screen.getByTestId('cudzich-settle-confirm'));
    expect(appAlert).toHaveBeenCalledWith('Rozlicz saldo', expect.stringContaining('590.00'));
    expect(posts('/cudzich/transactions')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('cudzich-settle-amount'), '200');
    expect(screen.getByText('Rozliczenie częściowe - zostanie 390.00 zł')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cudzich-settle-confirm'));
    await waitFor(() => expect(posts('/cudzich/transactions')).toHaveLength(1));
    expect(posts('/cudzich/transactions')[0]).toMatchObject({ type: 'wyplata', price: 200 });
  });

  test('„Rozlicz saldo” przy zerze: komunikat, bez okienka', async () => {
    balanceValue = 0;
    const screen = renderTab();
    await waitFor(() => expect(screen.getByText('Saldo rozliczone')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cudzich-action-settle'));
    expect(appAlert).toHaveBeenCalledWith('Rozlicz saldo', expect.stringContaining('rozliczone'));
    expect(screen.queryByTestId('cudzich-settle-info')).toBeNull();
  });

  test('inny punkt niż P - brak dostępu', () => {
    const screen = renderTab({ ...context, user: { symbol: 'T' } });
    expect(screen.getByText('Brak dostępu do tej sekcji')).toBeTruthy();
  });
});

describe('Ekran admina Różne → Cudzich', () => {
  test('te same karty: saldo i transakcje z kwotą i uwagami; szukanie po polskiej nazwie typu', async () => {
    tokenService.authenticatedFetch.mockImplementation((url) => {
      const text = String(url);
      if (text.includes('/cudzich/balance')) return response({ balance: 400 });
      if (text.includes('/cudzich/transactions')) return response(TRANSACTIONS); // ekran admina - cała lista (bez stron)
      return response({});
    });
    const screen = render(<GlobalStateContext.Provider value={context}><CudzichList /></GlobalStateContext.Provider>);
    await waitFor(() => expect(screen.getByTestId('cudzich-transaction-t1')).toBeTruthy());
    expect(screen.getByText('+900,00 zł')).toBeTruthy();
    expect(screen.getByText('na próbę')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Szukaj transakcji...'), 'wpłata');
    await waitFor(() => expect(screen.queryByTestId('cudzich-transaction-t1')).toBeNull());
    expect(screen.getByTestId('cudzich-transaction-t2')).toBeTruthy();
  });
});
