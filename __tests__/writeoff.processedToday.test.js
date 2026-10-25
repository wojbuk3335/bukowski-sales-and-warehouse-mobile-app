import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// Stan: dzisiejsze przepisanie odpisane już w Dobieraniu zostaje na liście wyszarzone z napisem „Przetworzone”;
// nieprzetworzone pokazuje jak dotąd „Przepisano do: …” (25.10.2026).

jest.mock('@react-navigation/native', () => ({
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
import { warsawToday } from '../utils/warsawDay';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const today = warsawToday();
const user = { symbol: 'P', email: 'p@test.pl', location: 'Zakopane', sellingPoint: 'Parzygnat' };
const points = [{ _id: 'u-t', symbol: 'T', role: 'user', location: 'Zakopane', sellingPoint: 'Tata' }];
const stateData = [{ id: 'p-ada', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'P', barcode: '555' }];
const transfers = [
  // odpisana w Dobieraniu - sztuki nie ma już na stanie
  { _id: 'tr-done', productId: 'gone-1', fullName: 'Zuza GRANAT', size: 'M', barcode: '999', transfer_from: 'P', transfer_to: 'T', blueProcessed: true, date: `${today}T08:00:00.000Z`, dateString: today },
  // czeka na Dobieranie - sztuka dalej na stanie
  { _id: 'tr-wait', productId: 'p-ada', fullName: 'Ada CZERWONY', size: 'XL', barcode: '555', transfer_from: 'P', transfer_to: 'T', blueProcessed: false, date: `${today}T09:00:00.000Z`, dateString: today },
];

const renderWriteOff = () => render(
  <GlobalStateContext.Provider value={{
    user, stateData, users: points,
    fetchState: jest.fn(() => Promise.resolve()),
    fetchUsers: jest.fn(() => Promise.resolve()),
    getFilteredSellingPoints: () => points,
  }}>
    <WriteOff />
  </GlobalStateContext.Provider>
);

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.endsWith('/transfer')) return json(transfers);
    if (url.endsWith('/sales/get-all-sales')) return json([]);
    if (url.endsWith('/exchange')) return json([]);
    return json({});
  });
});

test('przetworzone przepisanie: wyszarzony wiersz z „Przepisano do: T” i „Przetworzone”; nieprzetworzone bez „Przetworzone”', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-processed-tr-done')).toBeTruthy());
  const row = screen.getByTestId('writeoff-processed-tr-done');
  expect(row.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })]));
  expect(screen.getByText(/Zuza GRANAT/)).toBeTruthy();
  expect(screen.getAllByText('Przepisano do: T')).toHaveLength(2);
  expect(screen.getAllByText('Przetworzone')).toHaveLength(1);
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy(); // nieprzetworzona dalej jako zwykła sztuka
  expect(screen.queryByTestId('writeoff-dots-gone-1')).toBeNull(); // bez akcji
});
