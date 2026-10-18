import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

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

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000' },
}));

import tokenService from '../services/tokenService';
import QRScanner from '../app/QRScanner';

const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

describe('QRScanner - płatność mieszana', () => {
  beforeEach(() => {
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      if (url.endsWith('/sales/save-sales')) return json({ message: 'ok' });
      return json({});
    });
  });

  test('wylicza dopłatę kartą w PLN z wpłaty gotówką w obcej walucie i blokuje wybór waluty karty', async () => {
    const props = {
      stateData: [{ barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'PUNKT1' }],
      user: { sellingPoint: 'PUNKT1', symbol: 'PUNKT1', email: 'test@test.com' },
      sizes: [],
      colors: [],
      goods: [{
        _id: 'good-1',
        code: '1234567890',
        fullName: 'Kurtka',
        category: 'Kurtki kożuchy futra',
        price: 850,
        minimumPrice: 850,
        discount_price: 0,
      }],
      stocks: [],
      users: [{ _id: 'u1', symbol: 'PUNKT1', sellingPoint: 'PUNKT1', location: 'Z' }],
      bags: [],
      wallets: [],
      currencyRates: [{ currency: { code: 'EUR', name: 'Euro' }, buyRate: 4.26 }],
      getFilteredSellingPoints: () => [],
      isActive: true,
    };
    const utils = render(<QRScanner {...props} />);

    for (let i = 0; i < 3; i += 1) {
      fireEvent(utils.getByTestId('camera-view'), 'onBarcodeScanned', { data: '1234567890', type: 'code128' });
    }
    await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy());

    fireEvent.press(utils.getByText('Gotówka i karta'));
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '100');
    fireEvent.press(utils.getByTestId('cash-payment-currency-0'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));

    expect(utils.getByTestId('card-payment-amount-0').props.editable).toBe(true);
    expect(utils.getByTestId('card-payment-currency-0').props.accessibilityState.disabled).toBe(true);
    expect(utils.getByTestId('card-payment-currency-0')).toHaveTextContent('PLN');
    expect(utils.getByTestId('sale-price-input').props.editable).toBe(false);
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '100');
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '100');
    await waitFor(() => expect(utils.getByTestId('mixed-payment-summary')).toHaveTextContent('Zapłacono: 526.00 zł · Do dopłaty kartą: 324.00 zł'));
    expect(utils.getByTestId('minimum-top-up')).toHaveTextContent('Dopłać jeszcze 324.00 zł, aby osiągnąć minimum.');
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '424');
    await waitFor(() => expect(utils.getByTestId('mixed-payment-summary')).toHaveTextContent('Zapłacono: 850.00 zł · Do dopłaty kartą: 0.00 zł'));
    expect(utils.getByTestId('cash-payment-section')).toBeTruthy();
    expect(utils.getByTestId('card-payment-section')).toBeTruthy();

    fireEvent.press(utils.getByTestId('payment-mode-cash'));
    expect(utils.getByTestId('cash-payment-section')).toBeTruthy();
    expect(utils.queryByTestId('card-payment-section')).toBeNull();

    fireEvent.press(utils.getByTestId('payment-mode-card'));
    await waitFor(() => expect(utils.queryByTestId('cash-payment-section')).toBeNull());
    expect(utils.getByTestId('card-payment-section')).toBeTruthy();
    const cardAmount = utils.getByTestId('card-payment-amount-0');
    expect(cardAmount.props.editable).toBe(false);
    expect(cardAmount.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })]));

    fireEvent.press(utils.getByTestId('payment-mode-mixed'));
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '100');
    fireEvent.press(utils.getByTestId('cash-payment-currency-0'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '424');

    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      const body = JSON.parse(saveCall[1].body);
      expect(body.cash).toEqual([{ price: '100', currency: 'EUR' }]);
      expect(body.card).toEqual([{ price: '424', currency: 'PLN' }]);
    });
  });
});