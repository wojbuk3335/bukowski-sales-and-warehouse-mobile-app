import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// „Sprzedano od”: przy każdym punkcie stan tej kurtki; punkt bez niej - czerwony napis, że powstanie korekta,
// pytanie przed wyborem i ostrzeżenie pod polem, gdy taki punkt jest wybrany (25.10.2026).

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../services/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000' },
}));

import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';
import QRScanner from '../app/QRScanner';

const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

const props = {
  stateData: [
    { barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'P' },
    { barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'P' },
  ],
  user: { sellingPoint: 'Parzygnat', symbol: 'P', email: 'p@test.pl', location: 'Zakopane' },
  sizes: [],
  colors: [],
  goods: [{ _id: 'good-1', code: '1234567890', fullName: 'Kurtka', category: 'Kurtki kożuchy futra', price: 850, minimumPrice: 850, discount_price: 0 }],
  stocks: [],
  users: [
    { _id: 'u-p', symbol: 'P', sellingPoint: 'Parzygnat', location: 'Zakopane', role: 'user' },
    { _id: 'u-t', symbol: 'T', sellingPoint: 'Tata', location: 'Zakopane', role: 'user' },
  ],
  bags: [],
  wallets: [],
  currencyRates: [],
  getFilteredSellingPoints: () => [],
  isActive: true,
};

const openSaleForm = async () => {
  const utils = render(<QRScanner {...props} />);
  for (let i = 0; i < 3; i += 1) {
    fireEvent(utils.getByTestId('camera-view'), 'onBarcodeScanned', { data: '1234567890', type: 'code128' });
  }
  await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy());
  return utils;
};

describe('Sprzedano od - stan kurtki w punkcie', () => {
  beforeEach(() => {
    appAlert.mockReset();
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });
  });

  test('lista punktów: P „Na stanie: 2 szt.”, T czerwone „Brak na stanie - po przetworzeniu powstanie korekta”', async () => {
    const utils = await openSaleForm();
    expect(utils.queryByTestId('sale-point-missing-warning')).toBeNull(); // domyślnie P - kurtka jest
    fireEvent.press(utils.getByText('Parzygnat')); // pole pokazuje pełną nazwę punktu
    await waitFor(() => expect(utils.getByTestId('sale-point-T')).toBeTruthy());
    expect(utils.getByTestId('sale-point-P-note').props.children).toBe('Na stanie: 2 szt.');
    const missing = utils.getByTestId('sale-point-T-note');
    expect(missing.props.children).toBe('Brak na stanie - po przetworzeniu powstanie korekta');
    expect(missing.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#EF4444' })]));
  });

  test('wybór T (brak kurtki) → pytanie; „Wybierz” ustawia T i pokazuje ostrzeżenie pod polem', async () => {
    const utils = await openSaleForm();
    fireEvent.press(utils.getByText('Parzygnat')); // pole pokazuje pełną nazwę punktu
    await waitFor(() => expect(utils.getByTestId('sale-point-T')).toBeTruthy());
    fireEvent.press(utils.getByTestId('sale-point-T'));

    const call = appAlert.mock.calls.find(([title]) => title === 'Brak na stanie w punkcie T');
    expect(call).toBeTruthy();
    expect(call[1]).toContain('powstanie korekta');
    await act(async () => { call[2].find((b) => b.text === 'Wybierz').onPress(); });

    await waitFor(() => expect(utils.getByTestId('sale-point-missing-warning')).toBeTruthy());
    expect(utils.getByTestId('sale-point-missing-warning').props.children).toBe('W punkcie T nie ma tej kurtki na stanie - po przetworzeniu powstanie korekta.');
  });

  test('wybór punktu z kurtką → bez pytania', async () => {
    const utils = await openSaleForm();
    fireEvent.press(utils.getByText('Parzygnat')); // pole pokazuje pełną nazwę punktu
    await waitFor(() => expect(utils.getByTestId('sale-point-P')).toBeTruthy());
    fireEvent.press(utils.getByTestId('sale-point-P'));
    expect(appAlert.mock.calls.some(([title]) => String(title).startsWith('Brak na stanie'))).toBe(false);
  });
});
