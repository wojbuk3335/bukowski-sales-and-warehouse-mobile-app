import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// „Przepisz do”: przy punkcie, który ma już tę kurtkę - „Na stanie: N szt.” (zgłoszenie 25.10.2026).
// Brak kurtki w punkcie docelowym nie ma znaczenia przy przepisaniu - bez czerwonego napisu i bez pytania
// (decyzja 26.10.2026; ostrzeżenie o braku na stanie zostaje tylko przy sprzedaży).

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

import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';
import WriteOff from '../app/(tabs)/writeoff';
import { GlobalStateContext } from '../context/GlobalState';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const user = { symbol: 'P', email: 'p@test.pl', location: 'Zakopane', sellingPoint: 'Parzygnat' };
const points = [
  { _id: 'u-t', symbol: 'T', role: 'user', location: 'Zakopane', sellingPoint: 'Tata' },
  { _id: 'u-m', symbol: 'M', role: 'user', location: 'Zakopane', sellingPoint: 'Most' },
];
const stateData = [
  { id: 'p-ada', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'P', barcode: '555' },
  { id: 't-ada', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'T', barcode: '555' },
  { id: 't-ada2', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'T', barcode: '555' },
  { id: 'm-inna', fullName: 'Ewa BRĄZ', size: 'L', symbol: 'M', barcode: '777' },
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

const transferPosts = () => tokenService.authenticatedFetch.mock.calls.filter(([url, o]) => url.split('?')[0].endsWith('/transfer') && o?.method === 'POST');

const openTransferPicker = async (screen) => {
  await waitFor(() => expect(screen.getByTestId('writeoff-dots-p-ada')).toBeTruthy());
  fireEvent.press(screen.getByTestId('writeoff-dots-p-ada'));
  fireEvent.press(screen.getByText('Przepisz do'));
  await waitFor(() => expect(screen.getByTestId('transfer-target-T')).toBeTruthy());
};

describe('Przepisz do - stan w punkcie docelowym', () => {
  beforeEach(() => {
    appAlert.mockReset();
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
      if (url.split('?')[0].endsWith('/transfer') && options.method === 'POST') return json({ _id: 'tr-1' }, 201);
      if (url.split('?')[0].endsWith('/transfer')) return json([]);
      if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
      return json({});
    });
  });

  test('przy punktach: „Na stanie: 2 szt.”; punkt bez tej kurtki bez żadnego napisu', async () => {
    const screen = renderWriteOff();
    await openTransferPicker(screen);
    expect(screen.getByTestId('transfer-target-T-note').props.children).toBe('Na stanie: 2 szt.');
    expect(screen.queryByTestId('transfer-target-M-note')).toBeNull();
    expect(screen.queryByTestId('transfer-target-MAGAZYN-note')).toBeNull();
    expect(screen.queryByText('Brak tego produktu na stanie')).toBeNull();
  });

  test('punkt z tą kurtką → przepisanie bez pytania', async () => {
    const screen = renderWriteOff();
    await openTransferPicker(screen);
    fireEvent.press(screen.getByTestId('transfer-target-T'));
    await waitFor(() => expect(transferPosts()).toHaveLength(1));
    expect(JSON.parse(transferPosts()[0][1].body).transfer_to).toBe('T');
    expect(appAlert.mock.calls.some(([title]) => String(title).startsWith('Brak na stanie'))).toBe(false);
  });

  test('punkt bez tej kurtki → przepisanie od razu, bez pytania', async () => {
    const screen = renderWriteOff();
    await openTransferPicker(screen);
    fireEvent.press(screen.getByTestId('transfer-target-M'));
    await waitFor(() => expect(transferPosts()).toHaveLength(1));
    expect(JSON.parse(transferPosts()[0][1].body).transfer_to).toBe('M');
    expect(appAlert.mock.calls.some(([title]) => String(title).startsWith('Brak na stanie'))).toBe(false);
  });
});
