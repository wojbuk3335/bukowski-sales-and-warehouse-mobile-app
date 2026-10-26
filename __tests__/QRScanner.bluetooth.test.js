import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// „Nowa sprzedaż” z czytnikiem Bluetooth (26.10.2026): przycisk „Czytnik” pod ramką wyłącza kamerę, kod z czytnika
// (Enter) otwiera formularz sprzedaży jak skan kamerą; tryb zapamiętany; „Nie gaś ekranu” zapamiętane;
// przy otwartym formularzu kody z czytnika nie otwierają drugiego formularza.

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../services/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../config/api', () => ({ getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`, API_CONFIG: { BASE_URL: 'http://localhost:3000' } }));

import tokenService from '../services/tokenService';
import QRScanner from '../app/QRScanner';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const props = {
  stateData: [{ barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'PUNKT1' }],
  user: { sellingPoint: 'PUNKT1', symbol: 'PUNKT1', email: 'test@test.com' },
  sizes: [], colors: [],
  goods: [{ _id: 'good-1', code: '1234567890', fullName: 'Kurtka', category: 'Kurtki kożuchy futra', price: 850, minimumPrice: 850, discount_price: 0 }],
  stocks: [],
  users: [{ _id: 'u1', symbol: 'PUNKT1', sellingPoint: 'PUNKT1', location: 'Z' }],
  bags: [], wallets: [], currencyRates: [],
  getFilteredSellingPoints: () => [],
  isActive: true,
};

beforeEach(async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).clear();
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => (url.endsWith('/pricelists/my') ? json({ priceList: [] }) : json({})));
});

test('czytnik: kod z Enterem otwiera formularz sprzedaży; kamera wyłączona; tryb i „nie gaś ekranu” zapamiętane', async () => {
  const utils = render(<QRScanner {...props} />);
  await waitFor(() => expect(utils.getByTestId('scan-mode-bluetooth')).toBeTruthy());
  fireEvent.press(utils.getByTestId('scan-mode-bluetooth'));
  const input = await utils.findByTestId('bluetooth-scan-input');
  expect(utils.queryByTestId('camera-view')).toBeNull();

  fireEvent(utils.getByTestId('scanner-keep-awake'), 'valueChange', true);
  const storage = require('@react-native-async-storage/async-storage');
  await waitFor(async () => expect(await (storage.default || storage).getItem('scanner-keep-awake')).toBe('1'));
  expect(await (storage.default || storage).getItem('scanner-input-mode')).toBe('bluetooth');

  fireEvent.changeText(input, '1234567890');
  fireEvent(input, 'submitEditing');
  await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy()); // formularz sprzedaży otwarty
  utils.unmount();
});

test('przy ponownym otwarciu skaner od razu w trybie czytnika; „Kamera” wraca do aparatu', async () => {
  const storage = require('@react-native-async-storage/async-storage');
  await (storage.default || storage).setItem('scanner-input-mode', 'bluetooth');
  const utils = render(<QRScanner {...props} />);
  await waitFor(() => expect(utils.getByTestId('bluetooth-scan-input')).toBeTruthy());
  fireEvent.press(utils.getByTestId('scan-mode-camera'));
  await waitFor(() => expect(utils.getByTestId('camera-view')).toBeTruthy());
  expect(await (storage.default || storage).getItem('scanner-input-mode')).toBe('camera');
  utils.unmount();
});
