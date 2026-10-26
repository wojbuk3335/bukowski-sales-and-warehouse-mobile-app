import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Remanent from '../../app/(tabs)/remanent';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';

// Wyszukiwarka zeskanowanych sztuk (26.10.2026): nazwa, rozmiar, kod; kilka słów = wszystkie muszą pasować;
// bez polskich znaków; licznik „Znaleziono N z M”; pusty wynik z komunikatem; postęp liczony z całej listy

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
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));

const CODE_44 = '1234504400007';
const CODE_46 = '1234504600001';
const CODE_BELLA = '5554504400009'; // Bella CZARNY 44 (Tow_Kod 555)
const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const contextValue = {
  user: { email: 'p01@test.com', symbol: 'P01', sellingPoint: 'P01' },
  sizes: [{ Roz_Kod: '044', Roz_Opis: '44' }, { Roz_Kod: '046', Roz_Opis: '46' }],
  colors: [{ Kol_Kod: '45', Kol_Opis: 'CZARNY' }],
  stocks: [{ Tow_Kod: '123', Tow_Opis: 'Amanda' }, { Tow_Kod: '555', Tow_Opis: 'Bella' }],
  stateData: [],
  fetchSizes: jest.fn(), fetchColors: jest.fn(), fetchStock: jest.fn(),
};
const session = {
  _id: 's1', startedAt: new Date().toISOString(),
  items: [
    { _id: 'i1', code: CODE_44, name: 'Amanda CZARNY 44', scannedAt: new Date().toISOString() },
    { _id: 'i2', code: CODE_46, name: 'Amanda CZARNY 46', scannedAt: new Date().toISOString() },
    { _id: 'i3', code: CODE_BELLA, name: 'Bella CZARNY 44', scannedAt: new Date().toISOString() },
  ],
};
const pointState = [
  { barcode: CODE_44, fullName: 'Amanda CZARNY', size: '44', price: 1000 },
  { barcode: CODE_46, fullName: 'Amanda CZARNY', size: '46', price: 1000 },
  { barcode: CODE_BELLA, fullName: 'Bella CZARNY', size: '44', price: 900 },
];

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.endsWith('/remanent/current-state')) return response({ data: pointState });
    if (url.endsWith('/remanent/session/current')) return response({ session });
    if (url.includes('/excel/goods/get-all-goods')) return response({ goods: [] });
    return response({});
  });
});

test('szukanie po rozmiarze, nazwie i kodzie; licznik; pusty wynik; wyczyszczenie przywraca listę', async () => {
  const screen = render(
    <GlobalStateContext.Provider value={contextValue}>
      <Remanent />
    </GlobalStateContext.Provider>
  );
  await waitFor(() => expect(screen.getByText('Amanda CZARNY 46')).toBeTruthy());
  expect(screen.getByText('Bella CZARNY 44')).toBeTruthy();
  const input = screen.getByTestId('remanent-search-input');

  fireEvent.changeText(input, '46');
  await waitFor(() => expect(screen.queryByText('Amanda CZARNY 44')).toBeNull());
  expect(screen.getByText('Amanda CZARNY 46')).toBeTruthy();
  expect(screen.queryByText('Bella CZARNY 44')).toBeNull();
  await waitFor(() => expect(screen.getByTestId('remanent-search-count').props.children.join('')).toBe('Znaleziono 1 z 3 szt.'));

  fireEvent.changeText(input, 'czarny 44'); // dwa słowa: oba muszą pasować
  await waitFor(() => expect(screen.getByText('Amanda CZARNY 44')).toBeTruthy());
  expect(screen.getByText('Bella CZARNY 44')).toBeTruthy();
  expect(screen.queryByText('Amanda CZARNY 46')).toBeNull();

  fireEvent.changeText(input, '55545'); // początek kodu
  await waitFor(() => expect(screen.queryByText('Amanda CZARNY 44')).toBeNull());
  expect(screen.getByText('Bella CZARNY 44')).toBeTruthy();

  fireEvent.changeText(input, 'kożuch'); // polskie znaki vs nazwa kategorii nie w nazwie - nic
  await waitFor(() => expect(screen.getByText('Nic nie znaleziono')).toBeTruthy());

  fireEvent.press(screen.getByTestId('remanent-search-clear'));
  await waitFor(() => expect(screen.getByText('Amanda CZARNY 44')).toBeTruthy());
  expect(screen.getByText('Amanda CZARNY 46')).toBeTruthy();
  expect(screen.queryByTestId('remanent-search-count')).toBeNull();
  // postęp liczony z całej listy, nie z wyniku szukania
  await waitFor(() => expect(screen.getByText('3/3 (100%)')).toBeTruthy());
  screen.unmount();
}, 20000);
