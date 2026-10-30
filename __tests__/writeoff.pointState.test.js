import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Stan (29.10.2026): stan tylko tego punktu prosto z serwera (GET /state?symbol=), bez pobierania stanu wszystkich
// punktów przez kontekst; lista porcjami po 50 jak Historia - kolejne wiersze dociągane przy przewijaniu;
// wyszukiwanie zaczyna porcje od nowa.

jest.mock('../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
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

import tokenService from '../services/tokenService';
import WriteOff from '../app/(tabs)/writeoff';
import { GlobalStateContext } from '../context/GlobalState';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const user = { symbol: 'P', email: 'p@test.pl', location: 'Zakopane', sellingPoint: 'Parzygnat' };
const TOTAL = 120;
const pointState = Array.from({ length: TOTAL }, (_, i) => ({
  id: `it-${i}`, fullName: i === 7 ? 'Zofia ZIELONY' : `Ada CZERWONY ${String(i).padStart(3, '0')}`, size: 'XL', symbol: 'P', barcode: `${1000 + i}`,
}));
const contextValue = {
  user, users: [],
  stateData: [{ id: 'cudzy', fullName: 'Nie moja', size: 'M', symbol: 'T', barcode: '1' }], // stan z kontekstu ma być nieużywany po pobraniu
  fetchUsers: jest.fn(() => Promise.resolve()),
  ensureData: jest.fn(() => Promise.resolve([])),
  getFilteredSellingPoints: () => [],
};
const renderWriteOff = () => render(<GlobalStateContext.Provider value={contextValue}><WriteOff /></GlobalStateContext.Provider>);
const urls = () => tokenService.authenticatedFetch.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.split('?')[0].endsWith('/state')) return json(pointState);
    if (url.split('?')[0].endsWith('/transfer')) return json([]);
    if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
    return json({});
  });
});

test('pobiera tylko stan swojego punktu (?symbol=P) i pokazuje pierwsze 50 wierszy', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByText(`Produktów: ${TOTAL} · p@test.pl`)).toBeTruthy());

  const stateUrl = urls().find((url) => url.split('?')[0].endsWith('/state'));
  expect(new URL(stateUrl).searchParams.get('symbol')).toBe('P');
  expect(contextValue.ensureData).not.toHaveBeenCalledWith(['state']); // stan wszystkich punktów nie jest potrzebny do listy

  expect(screen.getByTestId('writeoff-flatlist').props.data).toHaveLength(50);
  expect(screen.getByTestId('writeoff-shown-count').props.children.join('')).toBe(`Pokazano 50 z ${TOTAL} - przewiń, aby zobaczyć więcej`);
});

test('koniec listy dociąga kolejne 50; na końcu napis znika', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-shown-count')).toBeTruthy());

  fireEvent(screen.getByTestId('writeoff-flatlist'), 'onEndReached');
  await waitFor(() => expect(screen.getByTestId('writeoff-flatlist').props.data).toHaveLength(100));
  fireEvent(screen.getByTestId('writeoff-flatlist'), 'onEndReached');
  await waitFor(() => expect(screen.getByTestId('writeoff-flatlist').props.data).toHaveLength(TOTAL));
  expect(screen.queryByTestId('writeoff-shown-count')).toBeNull();
});

test('wyszukiwanie filtruje całą listę (nie tylko pokazaną porcję) i zaczyna porcje od nowa', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-shown-count')).toBeTruthy());

  fireEvent.changeText(screen.getByTestId('writeoff-search-input'), 'zofia');
  await waitFor(() => expect(screen.getByTestId('writeoff-search-count').props.children.join('')).toBe(`Znaleziono 1 z ${TOTAL}`));
  expect(screen.getByTestId('writeoff-flatlist').props.data.map((row) => row.fullName)).toEqual(['Zofia ZIELONY']);

  fireEvent.changeText(screen.getByTestId('writeoff-search-input'), '');
  await waitFor(() => expect(screen.getByTestId('writeoff-flatlist').props.data).toHaveLength(50));
});

test('otwarcie opcji sztuki dociąga stan wszystkich punktów (podpowiedź „Na stanie” w punkcie docelowym)', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-dots-it-0')).toBeTruthy());
  fireEvent.press(screen.getByTestId('writeoff-dots-it-0'));
  expect(contextValue.ensureData).toHaveBeenCalledWith(['state']);
});

test('zwrot od Cudzicha w drodze do MAGAZYNU: wiersz „czeka na dopisanie”, nie „Przetworzone” (30.10.2026)', async () => {
  const today = require('../utils/warsawDay').warsawToday();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.split('?')[0].endsWith('/state')) return json(pointState.slice(0, 3));
    if (url.split('?')[0].endsWith('/transfer')) return json([{
      _id: 'tr-cz', productId: 'CUDZICH_RETURN_tx1', cudzichReturnFor: 'tx1', fullName: 'Ada CZERWONY', size: 'XL', barcode: '0010701300002',
      transfer_from: 'P', transfer_to: 'MAGAZYN', blueProcessed: true, yellowProcessed: false, date: `${today}T10:00:00.000Z`, dateString: today,
    }]);
    if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
    return json({});
  });
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByText('Zwrot od Cudzicha do MAGAZYNU - czeka na dopisanie')).toBeTruthy());
  expect(screen.queryByText('Przetworzone')).toBeNull();
});
