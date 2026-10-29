// Magazyn w telefonie jak w panelu (25.10.2026): lista tylko MAGAZYN, okienko powodu przy dodaniu i jeden zapis
// POST /warehouse/batch-add na całą ilość, menu ⋮ (Edytuj, Drukuj etykietę, Usuń), usunięcie z powodem i nagłówkami.
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import WarehouseMobile from '../../app/warehouse-mobile';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() { return React.createElement('Ionicons'); };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000', TIMEOUT: 30000 },
}));

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });

const GOODS = [
  { _id: 'g-ada', fullName: 'Ada CZERWONY', code: '0010700000002', category: 'Kurtki kożuchy futra', price: 900, discount_price: 0, priceExceptions: [] },
  { _id: 'g-torba', fullName: 'Torebka X', code: '0000600013219', category: 'Torebki', price: 300, discount_price: 0, priceExceptions: [] },
];
const SIZES = [{ _id: 's-xl', Roz_Kod: '013', Roz_Opis: 'XL' }, { _id: 's-l', Roz_Kod: '012', Roz_Opis: 'L' }];
const STATE = [
  { id: 'm1', fullName: 'Ada CZERWONY', size: 'XL', barcode: '0010701300002', symbol: 'MAGAZYN', price: 900, date: '2026-10-20T10:00:00.000Z' },
  { id: 'p1', fullName: 'Ada CZERWONY', size: 'XL', barcode: '0010701300002', symbol: 'P', price: 900, date: '2026-10-20T10:00:00.000Z' },
  { id: 't1', fullName: 'Marcin CZARNY', size: '62', barcode: '4330606200006', symbol: 'T', price: 700, date: '2026-10-20T10:00:00.000Z' },
];

const calls = (method, urlPart) => tokenService.authenticatedFetch.mock.calls
  .filter(([url, options]) => url.includes(urlPart) && (options?.method || 'GET') === method);

const renderScreen = () => render(
  <GlobalStateContext.Provider value={{ user: { email: 'admin@test.pl', role: 'admin' }, isLoggedIn: true }}>
    <WarehouseMobile />
  </GlobalStateContext.Provider>
);

describe('Magazyn (telefon) - jak w panelu', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      const method = options.method || 'GET';
      if (url.endsWith('/user')) return json({ users: [{ _id: 'u-mag', symbol: 'MAGAZYN' }, { _id: 'u-p', symbol: 'P' }] });
      if (url.includes('/pricelists/')) return json({ priceList: [{ fullName: 'Ada CZERWONY', originalGoodId: 'g-ada', price: 950, discountPrice: 0, priceExceptions: [{ size: { Roz_Opis: 'XL' }, value: 990 }] }] });
      if (url.endsWith('/excel/goods/get-all-goods')) return json({ goods: GOODS });
      if (url.endsWith('/excel/size/get-all-sizes')) return json({ sizes: SIZES });
      if (url.endsWith('/state') && method === 'GET') return json(STATE);
      if (url.endsWith('/warehouse/batch-add')) return json({ success: true, count: 2 }, 201);
      if (url.includes('/state/') && method === 'DELETE') return json({ message: 'ok' });
      if (url.endsWith('/contractors') && method === 'GET') return json({ contractors: [{ _id: 'c1', name: 'Hurtownia Kowalski', active: true }] });
      if (url.endsWith('/contractors') && method === 'POST') return json({ contractor: { _id: 'c2', name: JSON.parse(options.body).name } }, 201);
      if (url.endsWith('/warehouse/sales') && method === 'POST') return json({ message: 'Wydano 1 szt. do kontrahenta Hurtownia Kowalski', sale: { _id: 'ws1' } }, 201);
      return json({});
    });
  });

  afterEach(() => jest.useRealTimers());

  // Sprzedaż z magazynu do kontrahenta (29.10.2026): sztuka opuszcza obieg MAGAZYN - punkty (jak w panelu)
  test('menu ⋮ → „Sprzedaj kontrahentowi”: wybór kontrahenta z listy, zapis POST /warehouse/sales z dniem wydania', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('warehouse-actions-m1'));
    fireEvent.press(screen.getByTestId('warehouse-action-sell'));
    act(() => { jest.advanceTimersByTime(300); });

    expect(screen.getByText('Sprzedaj kontrahentowi')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('sell-contractor-c1')).toBeTruthy());
    expect(screen.getByTestId('sell-confirm').props.accessibilityState?.disabled ?? true).toBe(true); // bez kontrahenta nie ma wydania

    fireEvent.press(screen.getByTestId('sell-contractor-c1'));
    fireEvent.changeText(screen.getByTestId('sell-note'), 'gotówka');
    fireEvent.press(screen.getByTestId('sell-confirm'));

    await waitFor(() => expect(calls('POST', '/warehouse/sales')).toHaveLength(1));
    const body = JSON.parse(calls('POST', '/warehouse/sales')[0][1].body);
    expect(body).toEqual({ stateIds: ['m1'], contractorId: 'c1', eventDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), note: 'gotówka' });
    await waitFor(() => expect(calls('GET', '/state').length).toBeGreaterThan(1)); // lista odświeżona po wydaniu
  });

  test('nowy kontrahent z okienka: POST /contractors, trafia na listę i jest od razu wybrany', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('warehouse-actions-m1'));
    fireEvent.press(screen.getByTestId('warehouse-action-sell'));
    act(() => { jest.advanceTimersByTime(300); });
    await waitFor(() => expect(screen.getByTestId('sell-contractor-c1')).toBeTruthy());

    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      const method = options.method || 'GET';
      if (url.endsWith('/contractors') && method === 'POST') return json({ contractor: { _id: 'c2', name: 'Sklep Zosia' } }, 201);
      if (url.endsWith('/contractors')) return json({ contractors: [{ _id: 'c1', name: 'Hurtownia Kowalski' }, { _id: 'c2', name: 'Sklep Zosia' }] });
      if (url.endsWith('/warehouse/sales') && method === 'POST') return json({ message: 'ok', sale: {} }, 201);
      if (url.endsWith('/state')) return json(STATE);
      return json({});
    });
    fireEvent.changeText(screen.getByTestId('sell-new-contractor'), 'Sklep Zosia');
    fireEvent.press(screen.getByTestId('sell-add-contractor'));
    await waitFor(() => expect(screen.getByTestId('sell-contractor-c2')).toBeTruthy());
    expect(JSON.parse(calls('POST', '/contractors')[0][1].body)).toEqual({ name: 'Sklep Zosia' });

    fireEvent.press(screen.getByTestId('sell-confirm')); // nowy kontrahent już wybrany
    await waitFor(() => expect(calls('POST', '/warehouse/sales')).toHaveLength(1));
    expect(JSON.parse(calls('POST', '/warehouse/sales')[0][1].body).contractorId).toBe('c2');
  });

  test('lista pokazuje tylko MAGAZYN; licznik = 1; brak starego pola „Tryb korekty”', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());
    expect(screen.queryByTestId('warehouse-actions-p1')).toBeNull();
    expect(screen.queryByTestId('warehouse-actions-t1')).toBeNull();
    expect(screen.queryByText('Tryb korekty')).toBeNull();
    expect(screen.getByTestId('warehouse-counter').props.children).toBe(1);
  });

  test('produkt + rozmiar → okienko powodu → jeden zapis batch-add z całą ilością i ceną z cennika (wyjątek rozmiaru)', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('1'), '2');
    fireEvent.changeText(screen.getByPlaceholderText('Wpisz nazwę produktu'), 'Ada');
    fireEvent.press(screen.getByTestId('product-suggestion-g-ada'));
    act(() => { jest.advanceTimersByTime(150); });
    fireEvent.changeText(screen.getByPlaceholderText('Wpisz rozmiar'), 'XL');
    fireEvent.press(screen.getByTestId('size-suggestion-s-xl'));

    expect(screen.getByText('Dodaj produkt do magazynu')).toBeTruthy();
    expect(screen.getByText('Dodawany produkt: Ada CZERWONY (XL) × 2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('add-reason-return-to-warehouse'));
    fireEvent.press(screen.getByTestId('add-reason-confirm'));

    await waitFor(() => expect(calls('POST', '/warehouse/batch-add')).toHaveLength(1));
    const body = JSON.parse(calls('POST', '/warehouse/batch-add')[0][1].body);
    expect(body.additionReason).toBe('return-to-warehouse');
    expect(body.idempotencyKey).toMatch(/^wh-/);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ goodsId: 'g-ada', sizeId: 's-xl', price: 990, discount_price: 0, isCorrection: false });
    expect(calls('POST', '/state')).toHaveLength(0); // nie N osobnych zapisów
  });

  test('torebka: bez rozmiaru, od razu okienko powodu; „Korekta inwentaryzacyjna” → isCorrection true', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('Wpisz nazwę produktu'), 'Torebka');
    fireEvent.press(screen.getByTestId('product-suggestion-g-torba'));
    expect(screen.getByText('Dodawany produkt: Torebka X')).toBeTruthy();
    fireEvent.press(screen.getByTestId('add-reason-inventory-correction'));
    fireEvent.press(screen.getByTestId('add-reason-confirm'));
    await waitFor(() => expect(calls('POST', '/warehouse/batch-add')).toHaveLength(1));
    const body = JSON.parse(calls('POST', '/warehouse/batch-add')[0][1].body);
    expect(body.items[0]).toMatchObject({ goodsId: 'g-torba', sizeId: null, price: 300, isCorrection: true });
  });

  test('menu ⋮: Edytuj, Drukuj etykietę, Usuń; Usuń wymaga powodu i wysyła nagłówki jak panel', async () => {
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('warehouse-actions-m1'));
    expect(screen.getByText('Edytuj')).toBeTruthy();
    expect(screen.getByText('Drukuj etykietę')).toBeTruthy();
    fireEvent.press(screen.getByTestId('warehouse-action-delete'));
    act(() => { jest.advanceTimersByTime(300); });

    expect(screen.getByText('Usuń produkt z magazynu')).toBeTruthy();
    expect(screen.getByTestId('delete-reason-confirm').props.accessibilityState?.disabled ?? true).toBe(true);
    fireEvent.press(screen.getByTestId('delete-reason-return-to-production'));
    fireEvent.press(screen.getByTestId('delete-reason-confirm'));

    await waitFor(() => expect(calls('DELETE', '/state/m1')).toHaveLength(1));
    const headers = calls('DELETE', '/state/m1')[0][1].headers;
    expect(headers['removal-reason']).toBe('return-to-production');
    expect(headers['is-correction']).toBe('false');
    expect(headers['event-date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('odmowa serwera przy usuwaniu (409, dzień przed przyjęciem) → komunikat serwera', async () => {
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      const method = options.method || 'GET';
      if (url.includes('/state/') && method === 'DELETE') return json({ message: 'Sztuka trafiła do magazynu później niż wybrany dzień.' }, 409);
      if (url.endsWith('/user')) return json({ users: [{ _id: 'u-mag', symbol: 'MAGAZYN' }] });
      if (url.includes('/pricelists/')) return json({ priceList: [] });
      if (url.endsWith('/excel/goods/get-all-goods')) return json({ goods: GOODS });
      if (url.endsWith('/excel/size/get-all-sizes')) return json({ sizes: SIZES });
      if (url.endsWith('/state')) return json(STATE);
      return json({});
    });
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByTestId('warehouse-actions-m1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('warehouse-actions-m1'));
    fireEvent.press(screen.getByTestId('warehouse-action-delete'));
    act(() => { jest.advanceTimersByTime(300); });
    fireEvent.press(screen.getByTestId('delete-reason-other'));
    fireEvent.press(screen.getByTestId('delete-reason-confirm'));
    await waitFor(() => expect(screen.getByText('Sztuka trafiła do magazynu później niż wybrany dzień.')).toBeTruthy());
  });
});
