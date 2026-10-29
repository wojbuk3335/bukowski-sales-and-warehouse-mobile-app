import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';

// Stan: dzisiejsze przepisanie odpisane już w Dobieraniu zostaje na liście wyszarzone z napisem „Przetworzone”;
// nieprzetworzone pokazuje jak dotąd „Przepisano do: …” (25.10.2026).

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
import useLiveRefresh from '../services/useLiveRefresh';
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
  // czeka na uzupełnienie - sztuka dalej na stanie
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
    if (url.split('?')[0].endsWith('/transfer')) return json(transfers);
    if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
    if (url.endsWith('/exchange')) return json([]);
    return json({});
  });
});

test('przetworzone przepisanie: wyszarzony wiersz z „Przepisano do: Tata” i „Przetworzone”; nieprzetworzone z „czeka na uzupełnienie”', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-processed-tr-done')).toBeTruthy());
  const row = screen.getByTestId('writeoff-processed-tr-done');
  expect(row.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })]));
  expect(screen.getByText(/Zuza GRANAT/)).toBeTruthy();
  expect(screen.getByText('Przepisano do: Tata')).toBeTruthy(); // przetworzone
  expect(screen.getByText('Przepisano do: Tata - czeka na uzupełnienie')).toBeTruthy(); // jeszcze na stanie
  expect(screen.getAllByText('Przetworzone')).toHaveLength(1);
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy(); // nieprzetworzona dalej jako zwykła sztuka
  expect(screen.queryByTestId('writeoff-dots-gone-1')).toBeNull(); // bez akcji
});

// Kurtka oddana przez klienta przy wymianie (26.10.2026): serwer od razu oznacza ją jako odpisaną z punktu, ale do MAGAZYNU
// trafia dopiero po przyjęciu w Dobieraniu - do tego czasu „czeka na dopisanie” (nie „Przetworzone”), potem znika z listy
test('zwrot z wymiany: „czeka na dopisanie” do przyjęcia w MAGAZYNIE, potem znika z listy punktu', async () => {
  const exchangeReturn = (yellowProcessed) => ({
    _id: 'tr-return', productId: 'EXCHANGE_RETURN_tr-x', exchangeReturnFor: 'tr-x', fullName: 'Alan SZARY', size: '3XL', barcode: '402',
    transfer_from: 'P', transfer_to: 'MAGAZYN', reason: 'Zwrot z wymiany', blueProcessed: true, yellowProcessed, date: `${today}T10:00:00.000Z`, dateString: today,
  });
  const withTransfers = (list) => tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.split('?')[0].endsWith('/transfer')) return json(list);
    if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
    if (url.endsWith('/exchange')) return json([]);
    return json({});
  });

  withTransfers([exchangeReturn(false)]);
  const waiting = renderWriteOff();
  await waitFor(() => expect(waiting.getByTestId('writeoff-processed-tr-return')).toBeTruthy());
  expect(waiting.getByText('Zwrot od klienta do MAGAZYNU - czeka na dopisanie')).toBeTruthy();
  expect(waiting.queryByText('Przetworzone')).toBeNull();
  waiting.unmount();

  withTransfers([exchangeReturn(true)]);
  const accepted = renderWriteOff();
  await waitFor(() => expect(tokenService.authenticatedFetch).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(accepted.queryByTestId('writeoff-processed-tr-return')).toBeNull();
  expect(accepted.queryByText(/Alan SZARY/)).toBeNull();
});

// Na żywo (28.10.2026): przepisanie zrobione gdzie indziej (inny telefon, panel) - serwer zgłasza „transfers”
// i lista odświeża się sama, bez przeciągania i bez pełnoekranowego spinnera
test('zdarzenie z serwera odświeża listę w tle: nowe przepisanie pojawia się bez przeciągania', async () => {
  let list = [];
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.split('?')[0].endsWith('/transfer')) return json(list);
    if (url.split('?')[0].endsWith('/sales/get-all-sales')) return json([]);
    if (url.endsWith('/exchange')) return json([]);
    return json({});
  });
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy());
  expect(screen.queryByText('Przepisano do: Tata - czeka na uzupełnienie')).toBeNull();
  expect(useLiveRefresh).toHaveBeenCalledWith(['states', 'sales', 'transfers'], expect.any(Function), { enabled: true });

  list = transfers.filter((transfer) => transfer._id === 'tr-wait');
  const onLive = useLiveRefresh.mock.calls[useLiveRefresh.mock.calls.length - 1][1];
  await act(async () => { await onLive(); });
  await waitFor(() => expect(screen.getByText('Przepisano do: Tata - czeka na uzupełnienie')).toBeTruthy());
  screen.unmount();
});

// Wyszukiwarka na górze Stanu (28.10.2026): nazwa / rozmiar / kod, bez polskich znaków; licznik „Znaleziono N z M”
test('wyszukiwarka zawęża listę po nazwie, rozmiarze i kodzie; X czyści', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy());
  expect(screen.getByText(/Zuza GRANAT/)).toBeTruthy(); // przetworzone dziś też na liście
  expect(screen.queryByTestId('writeoff-search-count')).toBeNull();

  fireEvent.changeText(screen.getByTestId('writeoff-search-input'), 'ZUZA granat');
  expect(screen.getByTestId('writeoff-search-count').props.children.join('')).toBe('Znaleziono 1 z 2');
  expect(screen.queryByTestId('writeoff-item-p-ada')).toBeNull();
  expect(screen.getByText(/Zuza GRANAT/)).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('writeoff-search-input'), '555'); // kod z metki
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy();
  expect(screen.queryByText(/Zuza GRANAT/)).toBeNull();

  fireEvent.changeText(screen.getByTestId('writeoff-search-input'), 'xl czerwony');
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('writeoff-search-input'), 'nie ma takiej');
  expect(screen.getByText('Nic nie znaleziono')).toBeTruthy();

  fireEvent.press(screen.getByTestId('writeoff-search-clear'));
  expect(screen.queryByTestId('writeoff-search-count')).toBeNull();
  expect(screen.getByTestId('writeoff-item-p-ada')).toBeTruthy();
  screen.unmount();
});
