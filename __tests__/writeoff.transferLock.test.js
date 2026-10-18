import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect) => {
    const React = require('react');
    React.useEffect(() => effect(), []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../services/tokenService', () => ({
  authenticatedFetch: jest.fn(),
}));

jest.mock('../services/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`,
}));

import tokenService from '../services/tokenService';
import WriteOff from '../app/(tabs)/writeoff';
import { GlobalStateContext } from '../context/GlobalState';

// Zakładka Stan: dzisiejsze przepisanie/wymiana wyszarza produkt i blokuje ponowne przepisanie,
// a w kropkach zostaje tylko anulowanie; sprzedaż odsyła do zakładki Sprzedaż.

const today = new Date().toISOString().split('T')[0];
const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

const user = { symbol: 'P', email: 'p@test.pl', location: 'Zakopane', sellingPoint: 'Parzygnat' };
const stateData = [
  { id: 'item-1', fullName: 'Ada CZARNY', size: 'M', symbol: 'P', barcode: '111' },
  { id: 'item-2', fullName: 'Ewa BRĄZ', size: 'L', symbol: 'P', barcode: '222' },
  { id: 'item-3', fullName: 'Ola SZARY', size: 'S', symbol: 'P', barcode: '333' },
  { id: 'item-4', fullName: 'Iga RUDY', size: 'XL', symbol: 'P', barcode: '444' },
];
const transfers = [
  { _id: 't1', productId: 'item-1', transfer_from: 'P', transfer_to: 'T', date: `${today}T08:00:00.000Z`, dateString: today },
  { _id: 't2', productId: 'item-2', transfer_from: 'P', transfer_to: 'Wymiana', reason: 'Wymiana - T', date: `${today}T08:00:00.000Z`, dateString: today },
  { _id: 't3', productId: 'item-3', barcode: '333', transfer_from: 'P', transfer_to: 'SOLD', date: `${today}T08:00:00.000Z`, dateString: today },
  { _id: 't4', productId: 'item-4', transfer_from: 'P', transfer_to: 'T', date: '2020-01-01T08:00:00.000Z', dateString: '2020-01-01' },
];

const renderWriteOff = () => render(
  <GlobalStateContext.Provider value={{
    user,
    stateData,
    users: [],
    fetchState: jest.fn(() => Promise.resolve()),
    fetchUsers: jest.fn(() => Promise.resolve()),
    getFilteredSellingPoints: () => [],
  }}>
    <WriteOff />
  </GlobalStateContext.Provider>
);

describe('Stan - blokada i anulowanie dzisiejszych przepisań', () => {
  beforeEach(() => {
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      if (url.endsWith('/transfer') && !options.method) return json(transfers);
      if (url.endsWith('/sales/get-all-sales')) return json([]);
      if (url.endsWith('/transfer/t1/cancel')) return json({ message: 'Transfer cancelled' });
      return json({});
    });
  });

  test('dzisiejsze przepisanie jest wyszarzone, wczorajsze nie', async () => {
    const screen = renderWriteOff();
    await waitFor(() => expect(screen.getByTestId('writeoff-item-item-1')).toBeTruthy());

    expect(screen.getByTestId('writeoff-item-item-1')).toHaveStyle({ opacity: 0.45 });
    expect(screen.getByText('Przepisano do: T')).toBeTruthy();
    expect(screen.getByText('Wymiana - T')).toBeTruthy();
    expect(screen.getByText('Sprzedano')).toBeTruthy();
    expect(screen.getByTestId('writeoff-item-item-4')).not.toHaveStyle({ opacity: 0.45 });
  });

  test('kropki przepisanego produktu dają tylko anulowanie, które usuwa transfer', async () => {
    const screen = renderWriteOff();
    await waitFor(() => expect(screen.getByTestId('writeoff-dots-item-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('writeoff-dots-item-1'));
    expect(screen.queryByText('Przepisz do')).toBeNull();
    fireEvent.press(screen.getByText('Anuluj przepisanie'));

    await waitFor(() => expect(tokenService.authenticatedFetch).toHaveBeenCalledWith(
      'http://localhost:3000/transfer/t1/cancel',
      { method: 'PATCH' }
    ));
    await waitFor(() => expect(screen.getByText('Przepisanie zostało anulowane.')).toBeTruthy());
  });

  test('wymiana ma „Anuluj wymianę”, sprzedaż odsyła do zakładki Sprzedaż, zwykły produkt ma „Przepisz do”', async () => {
    const screen = renderWriteOff();
    await waitFor(() => expect(screen.getByTestId('writeoff-dots-item-2')).toBeTruthy());

    fireEvent.press(screen.getByTestId('writeoff-dots-item-2'));
    expect(screen.getByText('Anuluj wymianę')).toBeTruthy();
    fireEvent.press(screen.getByText('Anuluj'));

    fireEvent.press(screen.getByTestId('writeoff-dots-item-3'));
    expect(screen.getByText('Ten produkt został dziś sprzedany. Anulowanie sprzedaży odbywa się w zakładce Sprzedaż.')).toBeTruthy();
    expect(screen.queryByText('Przepisz do')).toBeNull();
    fireEvent.press(screen.getByText('Anuluj'));

    fireEvent.press(screen.getByTestId('writeoff-dots-item-4'));
    expect(screen.getByText('Przepisz do')).toBeTruthy();
  });
});
