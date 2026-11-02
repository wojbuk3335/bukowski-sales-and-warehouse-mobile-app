import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import RemanentMagazyn from '../../app/remanent-magazyn';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Remanent MAGAZYNU dla admina (2.11.2026): ten sam ekran co remanent punktu, dla symbolu MAGAZYN (?symbol= w każdym
// zapytaniu), z liczeniem ręcznym: „Z bazy” -> produkt i rozmiar -> „Ile sztuk?” -> PUT /count; dotknięcie ×N poprawia ilość.

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => React.createElement(View, { testID: 'camera-view', ...props }),
    useCameraPermissions: () => [{ granted: true }, jest.fn(() => Promise.resolve({ granted: true }))],
  };
});
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  ImpactFeedbackStyle: { Heavy: 'heavy' },
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ router: { back: (...args) => mockBack(...args), replace: jest.fn(), push: jest.fn() } }));
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));

const response = (data, ok = true, status = 200) => Promise.resolve({
  ok, status, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)),
});

const contextValue = {
  user: { email: 'admin@test.com', symbol: 'WB', role: 'admin' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(),
  fetchColors: jest.fn(),
  fetchStock: jest.fn(),
};
const GOODS = [{ _id: 'g1', fullName: 'Amanda CZARNY', code: '1234500000003', category: 'Kurtki kożuchy futra' }];

let session;
let calls;
const setupApi = () => {
  session = { _id: 's1', sellingPoint: 'MAGAZYN', startedAt: new Date().toISOString(), items: [] };
  calls = [];
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: GOODS });
    if (url.includes('/remanent/current-state')) return response({ data: [] });
    if (url.includes('/remanent/session/current')) return response({ session });
    if (url.includes('/remanent/session/s1/count') && options.method === 'PUT') {
      const { code, name, count } = JSON.parse(options.body);
      session = { ...session, items: Array.from({ length: count }, (_, i) => ({ _id: `${code}-${i}`, code, name, manual: true, scannedAt: new Date().toISOString() })) };
      return response({ code, count, totalItems: session.items.length });
    }
    return response({});
  });
};

const renderMagazyn = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <RemanentMagazyn />
  </GlobalStateContext.Provider>
);

describe('Remanent magazynu (admin)', () => {
  beforeEach(setupApi);

  test('ekran dla MAGAZYNU: nagłówek z powrotem, każde zapytanie z ?symbol=MAGAZYN, przycisk „Z bazy”', async () => {
    const screen = renderMagazyn();
    await waitFor(() => expect(screen.getByText('Remanent magazynu')).toBeTruthy());
    await waitFor(() => expect(calls.some((call) => call.url.includes('/remanent/session/current'))).toBe(true));
    const remanentCalls = calls.filter((call) => call.url.includes('/remanent/'));
    expect(remanentCalls.length).toBeGreaterThan(0);
    expect(remanentCalls.every((call) => call.url.includes('symbol=MAGAZYN'))).toBe(true);
    expect(screen.getByTestId('remanent-from-base')).toBeTruthy();
    expect(screen.getByText(/Kliknij „Z bazy”, wybierz produkt i rozmiar/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('page-header-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  test('„Z bazy”: produkt -> rozmiar -> „Ile sztuk?” -> PUT /count z łączną ilością; lista pokazuje ×N, dotknięcie poprawia ilość', async () => {
    const screen = renderMagazyn();
    await waitFor(() => expect(screen.getByTestId('remanent-from-base')).toBeTruthy());
    await waitFor(() => expect(calls.some((call) => call.url.includes('get-all-goods'))).toBe(true));

    fireEvent.press(screen.getByTestId('remanent-from-base'));
    await waitFor(() => expect(screen.getByTestId('product-base-picker')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('product-base-good-g1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('product-base-good-g1'));
    await waitFor(() => expect(screen.getByTestId('product-base-size-44')).toBeTruthy());
    fireEvent.press(screen.getByTestId('product-base-size-44'));

    await waitFor(() => expect(screen.getByTestId('remanent-quantity-dialog')).toBeTruthy());
    expect(screen.getByText('Amanda CZARNY 44')).toBeTruthy();
    expect(screen.getByText('Łączna liczba sztuk tego produktu w magazynie.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('remanent-quantity-input'), '14');
    await act(async () => { fireEvent.press(screen.getByTestId('remanent-quantity-save')); });

    const put = calls.find((call) => call.method === 'PUT');
    expect(put.url).toBe('http://mock.api/remanent/session/s1/count?symbol=MAGAZYN');
    expect(put.body).toMatchObject({ name: 'Amanda CZARNY 44', count: 14 });
    expect(put.body.code).toMatch(/^12345044\d{5}$/); // kod kurtki Amanda CZARNY w rozmiarze 44

    // lista z serwera: jedna pozycja ×14; dotknięcie licznika otwiera okienko z wpisaną obecną ilością
    await waitFor(() => expect(screen.queryByTestId('remanent-quantity-dialog')).toBeNull());
    const code = put.body.code;
    await waitFor(() => expect(screen.getByTestId(`remanent-row-count-${code}`)).toBeTruthy());
    expect(screen.getByText('×14 ✎')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`remanent-row-count-${code}`));
    await waitFor(() => expect(screen.getByTestId('remanent-quantity-dialog')).toBeTruthy());
    expect(screen.getByTestId('remanent-quantity-input').props.value).toBe('14');
    expect(screen.getByText(/Policzono już 14 szt\./)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('remanent-quantity-input'), '12');
    await act(async () => { fireEvent.press(screen.getByTestId('remanent-quantity-save')); });
    const puts = calls.filter((call) => call.method === 'PUT');
    expect(puts[1].body).toMatchObject({ code, count: 12 });
    await waitFor(() => expect(screen.getByText('×12 ✎')).toBeTruthy());
  });

  test('ilość poza zakresem nie wychodzi do serwera; zakończony remanent (409) pokazuje kto i kiedy', async () => {
    const screen = renderMagazyn();
    await waitFor(() => expect(screen.getByTestId('remanent-from-base')).toBeTruthy());
    await waitFor(() => expect(calls.some((call) => call.url.includes('get-all-goods'))).toBe(true));
    fireEvent.press(screen.getByTestId('remanent-from-base'));
    await waitFor(() => expect(screen.getByTestId('product-base-good-g1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('product-base-good-g1'));
    await waitFor(() => expect(screen.getByTestId('product-base-size-46')).toBeTruthy());
    fireEvent.press(screen.getByTestId('product-base-size-46'));
    await waitFor(() => expect(screen.getByTestId('remanent-quantity-dialog')).toBeTruthy());

    // pole przepuszcza tylko cyfry (max 3) - pusta wartość to błąd
    fireEvent.changeText(screen.getByTestId('remanent-quantity-input'), 'abc');
    expect(screen.getByTestId('remanent-quantity-input').props.value).toBe('');
    await act(async () => { fireEvent.press(screen.getByTestId('remanent-quantity-save')); });
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
    await waitFor(() => expect(screen.getByText('Podaj liczbę sztuk od 0 do 999.')).toBeTruthy());
    fireEvent.press(screen.getByText('OK'));

    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      if (url.includes('/count') && options.method === 'PUT') return response({ message: 'zamknięty', closed: { closedBy: 'panel', closedAt: new Date().toISOString() } }, false, 409);
      if (url.includes('/remanent/session/current')) return response({ session: null });
      return response({});
    });
    fireEvent.changeText(screen.getByTestId('remanent-quantity-input'), '3');
    await act(async () => { fireEvent.press(screen.getByTestId('remanent-quantity-save')); });
    await waitFor(() => expect(screen.getByText(/Remanent został zakończony przez panel/)).toBeTruthy());
  });

  test('zakładka sprzedawcy bez symbolu: bez „Z bazy” w stopce i bez przycisku wstecz (jak dotąd)', async () => {
    const screen = render(
      <GlobalStateContext.Provider value={{ ...contextValue, user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' } }}>
        <Remanent />
      </GlobalStateContext.Provider>
    );
    await waitFor(() => expect(screen.getByText('Remanent rozpoczęty')).toBeTruthy());
    expect(screen.queryByTestId('remanent-from-base')).toBeNull();
    expect(screen.queryByTestId('page-header-back')).toBeNull();
    expect(calls.filter((call) => call.url.includes('/remanent/')).every((call) => !call.url.includes('symbol='))).toBe(true);
  });
});
