import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// S12 (audyt 21.10.2026): zerwane połączenie przy zapisie sprzedaży - formularz zostaje, „Spróbuj ponownie”
// wysyła TEN SAM numer sprzedaży (clientRequestId), więc serwer nie zapisze jej drugi raz.

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

jest.mock('../services/tokenService', () => ({
  authenticatedFetch: jest.fn(),
}));

jest.mock('../services/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000' },
}));

import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';
import QRScanner from '../app/QRScanner';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });

const props = {
  stateData: [{ barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'PUNKT1' }],
  user: { sellingPoint: 'PUNKT1', symbol: 'PUNKT1', email: 'test@test.com' },
  sizes: [],
  colors: [],
  goods: [{ _id: 'good-1', code: '1234567890', fullName: 'Kurtka', category: 'Kurtki kożuchy futra', price: 850, minimumPrice: 850, discount_price: 0 }],
  stocks: [],
  users: [{ _id: 'u1', symbol: 'PUNKT1', sellingPoint: 'PUNKT1', location: 'Z' }],
  bags: [],
  wallets: [],
  currencyRates: [],
  getFilteredSellingPoints: () => [],
  isActive: true,
};

const saveCalls = () => tokenService.authenticatedFetch.mock.calls.filter(([url]) => url.endsWith('/sales/save-sales'));
const bodyOf = (call) => JSON.parse(call[1].body);

const openSaleForm = async () => {
  const utils = render(<QRScanner {...props} />);
  for (let i = 0; i < 3; i += 1) {
    fireEvent(utils.getByTestId('camera-view'), 'onBarcodeScanned', { data: '1234567890', type: 'code128' });
  }
  await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy());
  return utils;
};

describe('QRScanner - zapis sprzedaży przy zerwanym połączeniu', () => {
  beforeEach(() => {
    appAlert.mockReset();
    tokenService.authenticatedFetch.mockReset();
  });

  test('brak odpowiedzi → formularz zostaje, „Spróbuj ponownie” wysyła ten sam numer; serwer odpowiada „już zapisana”', async () => {
    let attempt = 0;
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/sales/save-sales')) {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('Network request failed')); // zapis doszedł, odpowiedź nie
        return json({ message: 'Ta sprzedaż jest już zapisana.', duplicate: true, sales: { _id: 's1' } });
      }
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });

    const utils = await openSaleForm();
    fireEvent.press(utils.getByTestId('sale-submit-button'));

    await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Brak odpowiedzi serwera', expect.any(String), expect.any(Array)));
    // formularz nadal otwarty (nie wyczyszczony)
    expect(utils.getByTestId('payment-mode')).toBeTruthy();
    expect(saveCalls()).toHaveLength(1);
    const firstId = bodyOf(saveCalls()[0]).clientRequestId;
    expect(firstId).toMatch(/^sale-/);

    // „Spróbuj ponownie” z okienka
    const buttons = appAlert.mock.calls.find(([title]) => title === 'Brak odpowiedzi serwera')[2];
    buttons.find((b) => b.text === 'Spróbuj ponownie').onPress();

    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(bodyOf(saveCalls()[1]).clientRequestId).toBe(firstId);
    await waitFor(() => expect(utils.getByText(/była już zapisana/)).toBeTruthy());
  });

  test('odmowa serwera (np. za niska cena) → nie ma „Spróbuj ponownie”; następna sprzedaż dostaje nowy numer', async () => {
    let attempt = 0;
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/sales/save-sales')) {
        attempt += 1;
        if (attempt === 1) return json({ message: 'Cena poniżej minimum.' }, 400);
        return json({ message: 'ok' }, 201);
      }
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });

    let utils = await openSaleForm();
    fireEvent.press(utils.getByTestId('sale-submit-button'));
    await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Błąd', 'Cena poniżej minimum.'));
    expect(appAlert.mock.calls.some(([title]) => title === 'Brak odpowiedzi serwera')).toBe(false);
    const firstId = bodyOf(saveCalls()[0]).clientRequestId;
    utils.unmount();

    utils = await openSaleForm();
    fireEvent.press(utils.getByTestId('sale-submit-button'));
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(bodyOf(saveCalls()[1]).clientRequestId).not.toBe(firstId);
  });
});
