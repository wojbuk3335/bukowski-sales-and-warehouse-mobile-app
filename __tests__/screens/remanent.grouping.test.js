import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';
import useLiveRefresh from '../../services/useLiveRefresh';

// Remanent PUNKTU (decyzja użytkownika 20.11.2026): każdy skan osobnym wierszem - druga taka sama kurtka = nowy wiersz,
// bez licznika ×N (ten został tylko w remanencie MAGAZYNU); X usuwa ten jeden skan; pasek sesji liczy skany.

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
jest.mock('../../components/LogoutButton', () => () => null);
jest.mock('../../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));

const CODE_44 = '1234504400007';
const CODE_46 = '1234504600001';
const response = (data, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
};
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
let items;
const session = () => ({ _id: 's1', startedAt: at(60), items });
const pointState = [
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
];
const deletes = () => tokenService.authenticatedFetch.mock.calls.filter(([url, o]) => url.includes('/remanent/session/s1/items/') && o?.method === 'DELETE');

beforeEach(() => {
  items = [
    { _id: 'a1', code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: at(30) },
    { _id: 'b1', code: CODE_46, name: 'Amanda CZARNY 46', scannedAt: at(20), manual: true },
    { _id: 'a2', code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: at(10) },
  ];
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
    if (url.endsWith('/remanent/session/current')) return response({ session: session() });
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
    if (url.includes('/remanent/session/s1/items/') && options.method === 'DELETE') {
      const id = url.split('/').pop();
      items = items.filter((item) => item._id !== id);
      return response({ ok: true });
    }
    return response({});
  });
});

const renderRemanent = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Remanent />
  </GlobalStateContext.Provider>
);

test('dwie sztuki tego samego kodu = DWA wiersze bez „×2”; X usuwa ten jeden skan; ręczne liczone osobno (20.11.2026)', async () => {
  const screen = renderRemanent();
  await waitFor(() => expect(screen.getAllByText(CODE_44)).toHaveLength(2)); // dwa wiersze dla 44
  expect(screen.queryByTestId('remanent-row-count')).toBeNull(); // bez licznika ×N
  expect(screen.getByText('wpisane ręcznie: 1')).toBeTruthy(); // 46 wpisana ręcznie
  expect(screen.getByText(/3 szt\./)).toBeTruthy(); // pasek sesji liczy skany

  // od ostatnio skanowanego: 44 (a2 sprzed 10 min), 46 (sprzed 20 min), 44 (a1 sprzed 30 min)
  const codes = screen.getAllByText(/^\d{13}$/).map((node) => node.props.children);
  expect(codes).toEqual([CODE_44, CODE_46, CODE_44]);

  fireEvent.press(screen.getByTestId('remanent-remove-a2'));
  await waitFor(() => expect(deletes()).toHaveLength(1));
  expect(deletes()[0][0]).toMatch(/\/items\/a2$/); // dokładnie ten skan
  await waitFor(() => expect(screen.getAllByText(CODE_44)).toHaveLength(1), { timeout: 10000 }); // została jedna 44 (CI bywa wolne)
  expect(screen.getByText(/2 szt\./)).toBeTruthy();
  screen.unmount();
}, 20000);

// Remanent we dwie osoby (27.10.2026): ekran nasłuchuje zdarzeń 'remanent' (skany drugiego telefonu dochodzą same),
// a przy pozycji widać nazwę telefonu - tylko gdy skanuje więcej niż jeden telefon
test('skany z dwóch telefonów: nazwa telefonu przy pozycji; odświeżanie na żywo podpięte pod zdarzenia „remanent”', async () => {
  items = [
    { _id: 'a1', code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: at(30), device: 'Samsung A' },
    { _id: 'a2', code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: at(10), device: 'iPhone B' },
    { _id: 'b1', code: CODE_46, name: 'Amanda CZARNY 46', scannedAt: at(20), device: 'iPhone B' },
  ];
  const screen = renderRemanent();
  // każdy skan osobno (20.11.2026): a2 (iPhone), b1 (iPhone), a1 (Samsung) - od ostatnio skanowanego
  await waitFor(() => expect(screen.getAllByTestId('remanent-row-device')).toHaveLength(3));
  const labels = screen.getAllByTestId('remanent-row-device').map((node) => node.props.children);
  expect(labels).toEqual(['iPhone B', 'iPhone B', 'Samsung A']);

  expect(useLiveRefresh).toHaveBeenCalledWith(['remanent'], expect.any(Function));
  // sygnał z serwera -> lista pobierana ponownie w tle (bez pełnoekranowego spinnera)
  const callsBefore = tokenService.authenticatedFetch.mock.calls.filter(([url]) => url.endsWith('/remanent/session/current')).length;
  const onLive = useLiveRefresh.mock.calls[useLiveRefresh.mock.calls.length - 1][1];
  await onLive();
  await waitFor(() => expect(tokenService.authenticatedFetch.mock.calls.filter(([url]) => url.endsWith('/remanent/session/current')).length).toBe(callsBefore + 1));
  expect(screen.queryByText('Ładowanie remanentów...')).toBeNull();
  screen.unmount();
}, 20000);

test('jeden telefon: bez nazwy telefonu przy pozycjach', async () => {
  items = [
    { _id: 'a1', code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: at(30), device: 'Samsung A' },
    { _id: 'b1', code: CODE_46, name: 'Amanda CZARNY 46', scannedAt: at(20), device: 'Samsung A' },
  ];
  const screen = renderRemanent();
  await waitFor(() => expect(screen.getAllByText(/^\d{13}$/)).toHaveLength(2));
  expect(screen.queryAllByTestId('remanent-row-device')).toHaveLength(0);
  screen.unmount();
}, 20000);
