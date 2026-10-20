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
    await waitFor(() => expect(utils.queryByTestId('cash-payment-amount-0')).toBeNull()); // bez domyślnego wiersza - jak w gotówce
    fireEvent.press(utils.getAllByText('Dodaj walutę')[0]);
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '100');
    fireEvent.press(utils.getByTestId('cash-payment-currency-0'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));

    // karta podpowiada to, czego brakuje po gotówce (w górę); kwotę można podnieść, obniżyć poniżej ceny nie (bez rabatu)
    await waitFor(() => expect(utils.getByTestId('card-payment-amount-0').props.value).toBe('424.00')); // 850 - 100 × 4.26
    expect(utils.getByTestId('card-payment-amount-0').props.editable).toBe(true);
    expect(utils.getByTestId('card-payment-currency-0').props.accessibilityState.disabled).toBe(true);
    expect(utils.getByTestId('card-payment-currency-0')).toHaveTextContent('PLN');
    expect(utils.getByTestId('sale-price-input').props.editable).toBe(false);
    expect(utils.getByText('Klient wpłaca gotówką')).toBeTruthy();
    expect(utils.getByText('Klient dopłaca kartą')).toBeTruthy();
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.00 zł');
    expect(utils.queryByTestId('minimum-price')).toBeNull();
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '420'); // mniej niż brakuje = rabat - blokada
    await waitFor(() => expect(utils.getByTestId('minimum-price')).toHaveTextContent('Minimalna cena: 850.00 zł'));
    expect(utils.getByTestId('minimum-top-up-cash')).toHaveTextContent('Kartą trzeba dopłacić jeszcze: 4.00 zł'); // 424 - 420
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '');
    await waitFor(() => expect(utils.getByTestId('minimum-top-up-cash')).toHaveTextContent('Kartą trzeba dopłacić co najmniej: 424.00 zł'));
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '430'); // nadpłata 6 zł - reszta z gotówki w kasie
    await waitFor(() => expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 856.00 zł'));
    expect(utils.queryByTestId('minimum-price')).toBeNull();
    expect(utils.getByTestId('extra-change')).toBeTruthy();
    expect(utils.getByTestId('change-amount-0').props.placeholder).toBe('6.00');
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '6');
    await waitFor(() => expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.00 zł'));
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '424.00');
    await waitFor(() => expect(utils.queryByTestId('extra-change')).toBeNull());
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
    fireEvent.press(utils.getAllByText('Dodaj walutę')[0]);
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '100');
    fireEvent.press(utils.getByTestId('cash-payment-currency-0'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));

    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      const body = JSON.parse(saveCall[1].body);
      expect(body.cash).toEqual([{ price: '100', currency: 'EUR' }]);
      expect(body.card).toEqual([{ price: '424.00', currency: 'PLN' }]);
    });
  });
});
