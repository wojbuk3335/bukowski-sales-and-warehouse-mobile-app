import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock expo-camera
const mockScanFromURLAsync = jest.fn();
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    scanFromURLAsync: (...args) => mockScanFromURLAsync(...args),
  };
});

// „Odczytaj ze zdjęcia”: galeria zwraca jedno zdjęcie
const mockLaunchImageLibraryAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchImageLibraryAsync: (...args) => mockLaunchImageLibraryAsync(...args),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

// Mock tokenService
jest.mock('../services/tokenService', () => ({
  authenticatedFetch: jest.fn()
}));

jest.mock('../services/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}));

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000' }
}));

import tokenService from '../services/tokenService';
import QRScanner from '../app/QRScanner';

// Wydanie zamówienia z punktu: lista zamówień dopiero po zaznaczeniu „Odbiór”, wybór ustawia cenę = dopłata,
// zapis wysyła numer zamówienia (backend oznacza je jako zrealizowane)

const order = {
  _id: '507f1f77bcf86cd799439011',
  orderId: 'ORD-1',
  product: { name: 'Kurtka', color: 'Czarna', size: 'M' },
  customer: { name: 'Jan Kowalski', deliveryOption: 'pickup' },
  payment: { totalPrice: 1500, deposit: 500, depositCurrency: 'PLN', cashOnDelivery: 1000 },
  realizationDate: '2026-10-20',
  remainingPln: 1000,
};

const json = (data, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(data) });

describe('QRScanner - wydanie zamówienia z punktu', () => {
  const props = {
    stateData: [{ _id: '1', barcode: '1234567890', fullName: 'Kurtka Czarna', size: 'M', symbol: 'PUNKT1', price: 1500 }],
    user: { sellingPoint: 'PUNKT1', symbol: 'PUNKT1', email: 'test@test.com' },
    sizes: [], colors: [], goods: [], stocks: [], users: [{ _id: 'u1', symbol: 'PUNKT1', sellingPoint: 'PUNKT1', location: 'Z' }],
    bags: [], wallets: [], currencyRates: [],
    getFilteredSellingPoints: () => [],
    isActive: true,
  };

  beforeEach(() => {
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/orders/for-pickup')) return json({ success: true, data: [order] });
      if (url.endsWith('/sales/save-sales')) return json({ message: 'ok' });
      return json({});
    });
  });

  test('po skanie bez listy; „Odbiór” otwiera listę, wybór: cena = dopłata, zapis z numerem zamówienia', async () => {
    const utils = render(<QRScanner {...props} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent(utils.getByTestId('camera-view'), 'onBarcodeScanned', { data: '1234567890', type: 'code128' });
    }
    await waitFor(() => utils.getByPlaceholderText('Wpisz lub zeskanuj kod kreskowy'));
    expect(utils.queryByTestId('pickup-order-ORD-1')).toBeNull(); // samo zeskanowanie nie otwiera listy

    fireEvent.press(utils.getByText('Odbiór (dopłata do zaliczki)'));
    fireEvent.press(await waitFor(() => utils.getByTestId('pickup-order-ORD-1')));

    await waitFor(() => expect(utils.getByTestId('selected-pickup-order')).toHaveTextContent(/Do dopłaty: 1000.00 zł/));
    expect(utils.getByTestId('sale-price-input').props.value).toBe('1000');

    // gotówka: dopłata wpisuje się sama z pola „Do dopłaty” (1000 zł)
    fireEvent.press(utils.getByText('Dodaj'));

    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      const body = JSON.parse(saveCall[1].body);
      expect(body.orderMongoId).toBe(order._id);
      expect(body.isPickup).toBe(true);
      expect(body.cash).toEqual([{ price: '1000.00', currency: 'PLN' }]);
    });
  });

  test('✕ zamyka listę bez wyboru - odbiór odznaczony, zwykła sprzedaż', async () => {
    const utils = render(<QRScanner {...props} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent(utils.getByTestId('camera-view'), 'onBarcodeScanned', { data: '1234567890', type: 'code128' });
    }
    await waitFor(() => utils.getByPlaceholderText('Wpisz lub zeskanuj kod kreskowy'));
    fireEvent.press(utils.getByText('Odbiór (dopłata do zaliczki)'));
    fireEvent.press(await waitFor(() => utils.getByTestId('pickup-orders-close')));
    expect(utils.queryByTestId('selected-pickup-order')).toBeNull();
    expect(utils.queryByTestId('pickup-order-ORD-1')).toBeNull();
    expect(utils.getByTestId('sale-price-input')).toBeTruthy(); // odbiór odznaczony - zwykłe pole Cena
  });
});
