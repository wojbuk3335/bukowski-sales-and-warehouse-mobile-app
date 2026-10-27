import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Tryb skanera Bluetooth w Remanencie (26.10.2026): czytnik (Zebra DS2278) „wpisuje” kod i Enter w ukryte pole;
// każdy skan = jedna sztuka bez pytania o powtórkę; kilka kodów naraz (pamięć czytnika) po kolei;
// obcy kod odrzucony jak przy kamerze; tryb zapamiętany między otwarciami.

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
const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }],
  stateData: [],
  fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
};
const session = { _id: 's1', startedAt: new Date().toISOString(), items: [] };
const pointState = [
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
];
const posts = () => tokenService.authenticatedFetch.mock.calls.filter(([url, o]) => url.endsWith('/remanent/session/s1/items') && o?.method === 'POST');

const renderRemanent = () => render(
  <GlobalStateContext.Provider value={contextValue}>
    <Remanent />
  </GlobalStateContext.Provider>
);
const openScanner = async (screen) => {
  await waitFor(() => expect(screen.getByText('Remanent rozpoczęty')).toBeTruthy());
  fireEvent.press(screen.getByText('Skanuj'));
  await waitFor(() => expect(screen.getByText('Skanuj kody kurtek')).toBeTruthy());
};

beforeEach(async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).clear();
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
    if (url.endsWith('/remanent/session/current')) return response({ session });
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
    if (url.endsWith('/remanent/session/s1/items') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return response({ added: body.items.map((item, index) => ({ ...item, _id: `i${Date.now()}${index}` })) });
    }
    return response({});
  });
});

test('czytnik: Enter dodaje sztukę; ten sam kod pod rząd = kolejna sztuka bez pytania; obcy kod odrzucony; zapis', async () => {
  const screen = renderRemanent();
  await openScanner(screen);
  fireEvent.press(screen.getByTestId('scan-mode-bluetooth'));
  await waitFor(() => expect(screen.getByTestId('bluetooth-scan-input')).toBeTruthy());
  expect(screen.queryByTestId('camera-view')).toBeNull(); // kamera wyłączona w trybie czytnika
  const input = screen.getByTestId('bluetooth-scan-input');

  fireEvent.changeText(input, CODE_44);
  fireEvent(input, 'submitEditing');
  await waitFor(() => expect(screen.getByText('Zatwierdź (1)')).toBeTruthy());
  expect(screen.getByText('Dodano: Amanda CZARNY 44')).toBeTruthy();

  fireEvent.changeText(input, CODE_44); // druga identyczna kurtka - bez okienka „ta sama metka?”
  fireEvent(input, 'submitEditing');
  await waitFor(() => expect(screen.getByText('Zatwierdź (2)')).toBeTruthy());
  expect(screen.queryByText('Ten kod jest już policzony')).toBeNull();
  expect(screen.getByText('Dodano: Amanda CZARNY 44 (2. sztuka)')).toBeTruthy();

  fireEvent.changeText(input, 'QR-XYZ');
  fireEvent(input, 'submitEditing');
  await waitFor(() => expect(screen.getByText('Nieznany kod: QR-XYZ\nTo nie jest metka z bazy produktów - pominięto.')).toBeTruthy());
  expect(screen.getByTestId('bluetooth-last').props.children.join('')).toBe('Ostatni odczyt: QR-XYZ');
  expect(screen.getByText('Zatwierdź (2)')).toBeTruthy();

  fireEvent.press(screen.getByText('Zatwierdź (2)'));
  await waitFor(() => expect(screen.getByText('Zapisano 2 szt.')).toBeTruthy());
  expect(JSON.parse(posts()[0][1].body).items.map((i) => i.code)).toEqual([CODE_44, CODE_44]);
  screen.unmount();
}, 20000);

test('pamięć czytnika: kilka kodów naraz z nowymi liniami - wszystkie po kolei; tryb zapamiętany po ponownym otwarciu', async () => {
  const screen = renderRemanent();
  await openScanner(screen);
  fireEvent.press(screen.getByTestId('scan-mode-bluetooth'));
  const input = await screen.findByTestId('bluetooth-scan-input');
  await act(async () => { fireEvent.changeText(input, `${CODE_44}\n${CODE_46}\n${CODE_44}\n`); });
  await waitFor(() => expect(screen.getByText('Zatwierdź (3)')).toBeTruthy(), { timeout: 4000 });
  expect(screen.getByText('Zeskanowano: 3 szt. (2 produktów)')).toBeTruthy();

  // zamknięcie z odrzuceniem i ponowne otwarcie - tryb czytnika wraca
  fireEvent.press(screen.getByTestId('scanner-close'));
  fireEvent.press(await screen.findByTestId('scanner-close-discard'));
  await waitFor(() => expect(screen.queryByText('Skanuj kody kurtek')).toBeNull());
  fireEvent.press(screen.getByText('Skanuj'));
  await waitFor(() => expect(screen.getByTestId('bluetooth-scan-input')).toBeTruthy());
  fireEvent.press(screen.getByTestId('scan-mode-camera'));
  await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  screen.unmount();
}, 20000);
