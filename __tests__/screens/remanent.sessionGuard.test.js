import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Audyt Remanentu 26.10.2026 - sesja punktu:
//  R8: remanent zakończony na innym telefonie - „Zatwierdź” pokazuje kto i kiedy zakończył, skany zostają w skanerze
//      i NIE zakłada po cichu nowego remanentu,
//  R9: „Wyczyść” mówi wprost, że kasuje skany wszystkich telefonów punktu i ile ich usunięto,
//  stary, wciąż otwarty remanent (ponad 20 h) ma ostrzeżenie.

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
const response = (data, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
};
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const pointState = [{ barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 }];
const threeScans = () => [1, 2, 3].map((n) => ({ _id: `i${n}`, code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: hoursAgo(1) }));

let currentSession;
let postHandler;
let clearHandler;
const calls = (suffix, method) => tokenService.authenticatedFetch.mock.calls.filter(([url, o]) => url.endsWith(suffix) && (!method || o?.method === method));
const setupFetch = () => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
    if (url.endsWith('/remanent/session/current')) return response({ session: currentSession });
    if (url.endsWith('/remanent/session/start')) return response({ session: { _id: 's2', startedAt: new Date().toISOString(), items: [] } }, true, 201);
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
    if (url.endsWith('/remanent/session/s1/items') && options.method === 'POST') return postHandler(options);
    if (url.endsWith('/remanent/session/s1/items') && options.method === 'DELETE') return clearHandler();
    return response({});
  });
};
const renderRemanent = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Remanent />
  </GlobalStateContext.Provider>
);
const scanCode = async (screen, data) => {
  await waitFor(() => expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeDefined(), { timeout: 3000 });
  for (let frame = 0; frame < 3; frame += 1) {
    await act(async () => { await screen.getByTestId('camera-view').props.onBarcodeScanned?.({ data }); });
  }
};

beforeEach(async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).clear();
  currentSession = { _id: 's1', startedAt: hoursAgo(1), items: [] };
  postHandler = () => response({ added: [] });
  clearHandler = () => response({ totalItems: 0, removed: 3 });
  setupFetch();
});

test('R8: zakończony na innym telefonie - okno „kto i kiedy”, skany zostają, bez nowego remanentu po cichu', async () => {
  const closedAt = new Date(2026, 9, 26, 17, 5).toISOString();
  postHandler = () => response({ message: 'Remanent nie jest otwarty (zakończony albo inny punkt). Odśwież ekran.', closed: { closedAt, closedBy: 'kasia@test.pl' } }, false, 409);
  const screen = renderRemanent();
  await waitFor(() => expect(screen.getByText('Remanent rozpoczęty')).toBeTruthy());
  fireEvent.press(screen.getByText('Skanuj'));
  await waitFor(() => expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy());
  await scanCode(screen, CODE_44);
  await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());

  currentSession = null; // odświeżenie w tle: serwer już nie ma otwartej sesji
  fireEvent.press(screen.getByText('Zatwierdź (1)'));
  await waitFor(() => expect(screen.getAllByText(/Remanent został zakończony przez kasia@test\.pl o 26\.10 17:05\./).length).toBeGreaterThan(0));
  expect(screen.getAllByText(/Niezatwierdzone skany zostają w skanerze/).length).toBeGreaterThan(0);
  expect(screen.getByText('Zatwierdź (1)')).toBeTruthy(); // skan nadal w skanerze
  await waitFor(() => expect(calls('/remanent/session/current').length).toBeGreaterThan(1));

  // sesja zniknęła: ponowne „Zatwierdź” NIE zakłada nowego remanentu
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  fireEvent.press(screen.getByText('Zatwierdź (1)'));
  await waitFor(() => expect(screen.getByText('Remanent nie jest rozpoczęty - kliknij „Rozpocznij remanent”, skany zostają w skanerze.')).toBeTruthy());
  expect(calls('/remanent/session/start')).toHaveLength(0);
  expect(calls('/remanent/session/s1/items', 'POST')).toHaveLength(1);
  screen.unmount();
}, 20000);

test('R9: „Wyczyść” ostrzega o skanach wszystkich telefonów i podaje, ile usunięto', async () => {
  currentSession = { _id: 's1', startedAt: hoursAgo(1), items: threeScans() };
  const screen = renderRemanent();
  await waitFor(() => expect(screen.getByText(/3 szt\./)).toBeTruthy());
  fireEvent.press(screen.getByText('Wyczyść'));
  await waitFor(() => expect(screen.getByText('Wyczyścić cały remanent?')).toBeTruthy());
  expect(screen.getByText(/ze wszystkich telefonów punktu \(3 szt\. wg ostatniego odświeżenia\)/)).toBeTruthy();
  expect(calls('/remanent/session/current').length).toBeGreaterThan(1); // odświeżone przed pytaniem
  fireEvent.press(screen.getByText('Tak, wyczyść wszystko'));
  await waitFor(() => expect(screen.getByText('Usunięto 3 skanów (ze wszystkich telefonów punktu). Możesz liczyć od nowa.')).toBeTruthy());
  expect(calls('/remanent/session/s1/items', 'DELETE')).toHaveLength(1);
  screen.unmount();
}, 20000);

test('stary otwarty remanent (ponad 20 h) ma ostrzeżenie; świeży nie', async () => {
  currentSession = { _id: 's1', startedAt: hoursAgo(30), items: [] };
  const old = renderRemanent();
  await waitFor(() => expect(old.getByTestId('remanent-old-session')).toBeTruthy());
  expect(old.getByText(/Ten remanent trwa od \d\d\.\d\d \d\d:\d\d \(30 godz\.\)\. Jeśli to stare liczenie, zakończ je albo wyczyść i zacznij od nowa\./)).toBeTruthy();
  old.unmount();

  currentSession = { _id: 's1', startedAt: hoursAgo(1), items: [] };
  const fresh = renderRemanent();
  await waitFor(() => expect(fresh.getByText('Remanent rozpoczęty')).toBeTruthy());
  expect(fresh.queryByTestId('remanent-old-session')).toBeNull();
  fresh.unmount();
}, 20000);
