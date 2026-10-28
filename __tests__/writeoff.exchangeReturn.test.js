import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Wymiana, krok 2 (25.10.2026): po zapisaniu wymiany telefon pyta, którą kurtkę klient oddaje.
// Drogi: sprzedaż punktu z 14 dni, kod z metki (wpisany - sprawdzany na bieżąco: 13 cyfr, cyfra kontrolna, produkt z bazy -
// albo zeskanowany), wybór z całej bazy produktów (kurtka + rozmiar). Serwer zapisuje oddaną kurtkę jako przepisanie do MAGAZYNU;
// „Pomiń” = jak dawniej (oddaną kurtkę admin dopisuje ręcznie).

jest.mock('../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() })); // odświeżanie na żywo (28.10.2026)
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: (effect) => {
    const React = require('react');
    React.useEffect(() => effect(), []);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../services/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../config/api', () => ({ getApiUrl: (endpoint) => `http://localhost:3000${endpoint}` }));
// Skaner: zamiast kamery dwa przyciski „odczytu” - poprawna metka i śmieciowy kod
jest.mock('../components/scanner/ScanCamera', () => {
  const React = require('react');
  const { View, TouchableOpacity } = require('react-native');
  const ScanCameraMock = ({ onScanned, children }) => {
    return (
      <View testID="scan-camera">
        <TouchableOpacity testID="fake-scan-good" onPress={() => onScanned({ data: '0010701300002', type: 'code128' })} />
        <TouchableOpacity testID="fake-scan-bad" onPress={() => onScanned({ data: '12345', type: 'code128' })} />
        {children}
      </View>
    );
  };
  return { __esModule: true, default: ScanCameraMock };
});

import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';
import WriteOff from '../app/(tabs)/writeoff';
import { GlobalStateContext } from '../context/GlobalState';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const user = { symbol: 'T', email: 't@test.pl', location: 'Zakopane', sellingPoint: 'Tata' };
const points = [{ _id: 'u-t', symbol: 'T', role: 'user', location: 'Zakopane', sellingPoint: 'Tata' }];
const stateData = [{ id: 't-ada', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'T', barcode: '555' }];
const sizes = [{ _id: 's-xl', Roz_Kod: '013', Roz_Opis: 'XL' }, { _id: 's-l', Roz_Kod: '012', Roz_Opis: 'L' }];
const goods = [
  { _id: 'g-ada', fullName: 'Ada CZERWONY', code: '0010700000002', category: 'Kurtki kożuchy futra' },
  { _id: 'g-bag', fullName: 'Torebka Lena', code: '0000600013219', category: 'Torebki' },
];
const candidates = [
  { _id: 'sale-1', fullName: 'Ada BORDO', size: 'L', barcode: '0010701200005', timestamp: '2026-10-24T10:00:00.000Z', from: 'P', priceLabel: '850 PLN' },
];

const renderWriteOff = () => render(
  <GlobalStateContext.Provider value={{
    user, stateData, users: points, sizes,
    fetchState: jest.fn(() => Promise.resolve()),
    fetchUsers: jest.fn(() => Promise.resolve()),
    getFilteredSellingPoints: () => points,
  }}>
    <WriteOff />
  </GlobalStateContext.Provider>
);

const returnPosts = () => tokenService.authenticatedFetch.mock.calls
  .filter(([url, o]) => url.endsWith('/transfer/exchange-return') && o?.method === 'POST')
  .map(([, o]) => JSON.parse(o.body));

const doExchange = async (screen) => {
  await waitFor(() => expect(screen.getByTestId('writeoff-dots-t-ada')).toBeTruthy());
  fireEvent.press(screen.getByTestId('writeoff-dots-t-ada'));
  fireEvent.press(screen.getByText('Wymiana'));
  await waitFor(() => expect(screen.getAllByText('T').length).toBeGreaterThan(0));
  fireEvent.press(screen.getAllByText('T').pop());
  await waitFor(() => expect(screen.getByText('Którą kurtkę klient oddaje?')).toBeTruthy());
};

describe('Wymiana: oddana kurtka do MAGAZYNU', () => {
  let returnResponse;
  beforeEach(() => {
    appAlert.mockReset();
    returnResponse = () => json({ _id: 'ret-1', fullName: 'Ada CZERWONY', size: 'XL' }, 201);
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      if (url.endsWith('/exchange') && options.method === 'POST') return json({ data: { _id: 'ex-1' } }, 201);
      if (url.endsWith('/transfer') && options.method === 'POST') return json({ _id: 'tr-wymiana' }, 201);
      if (url.endsWith('/transfer/exchange-return/candidates')) return json({ days: 14, sales: candidates });
      if (url.endsWith('/transfer/exchange-return') && options.method === 'POST') return returnResponse();
      if (url.endsWith('/excel/goods/get-all-goods')) return json({ goods });
      if (url.endsWith('/transfer')) return json([]);
      if (url.endsWith('/exchange')) return json([]);
      if (url.endsWith('/sales/get-all-sales')) return json([]);
      return json({});
    });
  });

  test('wybór sprzedaży z listy zapisuje oddaną kurtkę i pokazuje, że jedzie do MAGAZYNU', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    expect(screen.getByText('Wydajesz: Ada CZERWONY XL')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('return-sale-sale-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('return-sale-sale-1'));
    await waitFor(() => expect(returnPosts()).toEqual([{ exchangeTransferId: 'tr-wymiana', saleId: 'sale-1' }]));
    await waitFor(() => expect(screen.getByText(/Oddana kurtka Ada BORDO L pojedzie do MAGAZYNU/)).toBeTruthy());
  });

  test('wpisany kod: za krótki, zła cyfra kontrolna, spoza bazy → czerwony komunikat i „Zapisz” wyłączone', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    const input = screen.getByTestId('return-code-input');
    const cases = [
      ['00107013', 'Kod z metki ma 13 cyfr (jest 8).'],
      ['0010701300009', 'Błędna cyfra kontrolna - sprawdź, czy kod jest dobrze przepisany.'],
      ['9990701300008', 'Nie ma takiego produktu w bazie.'],
    ];
    await waitFor(() => expect(screen.getByTestId('return-sale-sale-1')).toBeTruthy()); // baza produktów też już wczytana
    for (const [code, message] of cases) {
      fireEvent.changeText(input, code);
      await waitFor(() => expect(screen.getByTestId('return-code-check').props.children).toBe(message));
      fireEvent.press(screen.getByTestId('return-code-save'));
    }
    expect(returnPosts()).toEqual([]);
  });

  test('wpisany poprawny kod → nazwa na zielono, zapis po kodzie; błąd serwera zostawia okienko', async () => {
    returnResponse = () => json({ code: 'EXCHANGE_RETURN_UNKNOWN', message: 'Nie rozpoznano kurtki po tym kodzie.' }, 404);
    const screen = renderWriteOff();
    await doExchange(screen);
    await waitFor(() => expect(screen.getByTestId('return-sale-sale-1')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('return-code-input'), '0010701300002');
    await waitFor(() => expect(screen.getByTestId('return-code-check').props.children).toBe('✓ Ada CZERWONY XL'));
    fireEvent.press(screen.getByTestId('return-code-save'));
    await waitFor(() => expect(returnPosts()).toEqual([{ exchangeTransferId: 'tr-wymiana', barcode: '0010701300002' }]));
    await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Nie zapisano oddanej kurtki', 'Nie rozpoznano kurtki po tym kodzie.'));
    expect(screen.getByText('Którą kurtkę klient oddaje?')).toBeTruthy();
  });

  test('skan metki: błędny kod → komunikat, skaner dalej; poprawna metka → zapis po kodzie', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    await waitFor(() => expect(screen.getByTestId('return-sale-sale-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('return-open-scan'));
    await waitFor(() => expect(screen.getByTestId('scan-camera')).toBeTruthy());
    fireEvent.press(screen.getByTestId('fake-scan-bad'));
    expect(appAlert).toHaveBeenCalledWith('Nieprawidłowa metka', 'Kod z metki ma 13 cyfr (jest 5).');
    expect(returnPosts()).toEqual([]);
    fireEvent.press(screen.getByTestId('fake-scan-good'));
    await waitFor(() => expect(returnPosts()).toEqual([{ exchangeTransferId: 'tr-wymiana', barcode: '0010701300002' }]));
    await waitFor(() => expect(screen.getByText(/Oddana kurtka Ada CZERWONY XL pojedzie do MAGAZYNU/)).toBeTruthy());
  });

  test('z bazy produktów: wyszukiwarka, kurtka → rozmiar → kod kurtki w tym rozmiarze; torebka → od razu kod torebki', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    fireEvent.press(screen.getByTestId('return-open-picker'));
    await waitFor(() => expect(screen.getByTestId('return-good-0010700000002')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('return-picker-search'), 'ada czerw');
    expect(screen.queryByTestId('return-good-0000600013219')).toBeNull();
    fireEvent.press(screen.getByTestId('return-good-0010700000002'));
    await waitFor(() => expect(screen.getByText('Rozmiar oddanej kurtki')).toBeTruthy());
    fireEvent.press(screen.getByTestId('return-size-XL'));
    await waitFor(() => expect(returnPosts()).toEqual([{ exchangeTransferId: 'tr-wymiana', barcode: '0010701300002' }]));
  });

  test('z bazy produktów: torebka bez rozmiaru → kod torebki', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    fireEvent.press(screen.getByTestId('return-open-picker'));
    await waitFor(() => expect(screen.getByTestId('return-good-0000600013219')).toBeTruthy());
    fireEvent.press(screen.getByTestId('return-good-0000600013219'));
    await waitFor(() => expect(returnPosts()).toEqual([{ exchangeTransferId: 'tr-wymiana', barcode: '0000600013219' }]));
  });

  test('wpisywanie kodu: lista sprzedaży i przyciski schowane (okienko mieści się nad klawiaturą), komunikat nad polem', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    await waitFor(() => expect(screen.getByTestId('return-sale-sale-1')).toBeTruthy());
    const input = screen.getByTestId('return-code-input');
    fireEvent(input, 'focus');
    expect(screen.queryByTestId('return-sale-sale-1')).toBeNull();
    expect(screen.queryByTestId('return-open-scan')).toBeNull();
    fireEvent.changeText(input, '001');
    await waitFor(() => expect(screen.getByTestId('return-code-check')).toBeTruthy());
    // komunikat jest w drzewie PRZED polem kodu (nad nim na ekranie)
    const order = [];
    const walk = (node) => {
      if (!node || typeof node === 'string') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node.props?.testID) order.push(node.props.testID);
      (node.children || []).forEach(walk);
    };
    walk(screen.toJSON());
    expect(order.indexOf('return-code-check')).toBeGreaterThan(-1);
    expect(order.indexOf('return-code-check')).toBeLessThan(order.indexOf('return-code-input'));
    fireEvent(input, 'blur');
    expect(screen.getByTestId('return-sale-sale-1')).toBeTruthy();
  });

  test('„Pomiń” → wymiana zapisana jak dawniej, bez zapisu oddanej kurtki', async () => {
    const screen = renderWriteOff();
    await doExchange(screen);
    fireEvent.press(screen.getByTestId('return-skip'));
    await waitFor(() => expect(screen.getByText(/trzeba ją dopisać do magazynu ręcznie/)).toBeTruthy());
    expect(returnPosts()).toEqual([]);
  });
});
