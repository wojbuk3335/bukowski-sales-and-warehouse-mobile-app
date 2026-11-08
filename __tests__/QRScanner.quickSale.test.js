import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Sprzedaż ciągła (8.11.2026): skan = sprzedaż zapisana od razu (cena z cennika, gotówka albo karta), pasek
// z „Cofnij”; czego nie da się ustalić bez sprzedawcy - zwykły formularz z powodem.

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import tokenService from '../services/tokenService';
import { appAlert } from '../services/appAlert';
import QRScanner from '../app/QRScanner';
import { buildQuickSale } from '../utils/quickSale';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });

const GOOD = { _id: 'good-1', code: '1234567890', fullName: 'Kurtka', category: 'Kurtki kożuchy futra', price: 850, minimumPrice: 850, discount_price: 0 };
const props = {
  stateData: [
    { barcode: '1234567890', fullName: 'Kurtka', size: 'M', symbol: 'PUNKT1' },
    { barcode: '5555555555', fullName: 'Inna', size: 'L', symbol: 'PUNKT2' }, // tylko w innym punkcie
  ],
  user: { sellingPoint: 'PUNKT1', symbol: 'PUNKT1', email: 'test@test.com' },
  sizes: [],
  colors: [],
  goods: [GOOD],
  stocks: [],
  users: [{ _id: 'u1', symbol: 'PUNKT1', sellingPoint: 'PUNKT1', location: 'Z' }, { _id: 'u2', symbol: 'PUNKT2', sellingPoint: 'PUNKT2', location: 'Z' }],
  bags: [],
  wallets: [],
  currencyRates: [],
  getFilteredSellingPoints: () => [],
  isActive: true,
};

const saveCalls = () => tokenService.authenticatedFetch.mock.calls.filter(([url]) => url.endsWith('/sales/save-sales'));
const deleteCalls = () => tokenService.authenticatedFetch.mock.calls.filter(([url]) => url.includes('/sales/delete-sale/'));
const bodyOf = (call) => JSON.parse(call[1].body);

const scan = async (utils, data) => {
  for (let i = 0; i < 3; i += 1) {
    const camera = utils.queryByTestId('camera-view');
    if (!camera) break; // formularz otwarty - kamera schowana
    await act(async () => { fireEvent(camera, 'onBarcodeScanned', { data, type: 'code128' }); });
  }
};

const renderQuick = async () => {
  await AsyncStorage.setItem('quick-sale-mode', '1');
  const utils = render(<QRScanner {...props} />);
  await waitFor(() => expect(utils.getByTestId('quick-sale-switch').props.value).toBe(true));
  return utils;
};

describe('QRScanner - sprzedaż ciągła', () => {
  beforeEach(async () => {
    appAlert.mockReset();
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/sales/save-sales')) return json({ message: 'ok', sales: { _id: 'sale-db-1' } }, 201);
      if (url.includes('/sales/delete-sale/')) return json({ message: 'deleted' });
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });
    await AsyncStorage.clear();
  });

  test('skan = sprzedaż zapisana od razu (gotówka, cena z karty), bez formularza; „Cofnij” usuwa ją na serwerze', async () => {
    const utils = await renderQuick();
    await scan(utils, '1234567890');

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const body = bodyOf(saveCalls()[0]);
    expect(body).toMatchObject({ fullName: 'Kurtka', size: 'M', from: 'PUNKT1', symbol: 'PUNKT1', sellingPoint: 'PUNKT1', isPickup: false, card: [] });
    expect(body.cash).toEqual([{ price: '850.00', currency: 'PLN' }]);
    expect(body.clientRequestId).toMatch(/^sale-/);
    expect(utils.queryByTestId('payment-mode')).toBeNull(); // formularz się nie otworzył

    await waitFor(() => expect(utils.getByTestId('quick-sale-banner')).toBeTruthy());
    expect(utils.getByText(/Sprzedano: Kurtka M · 850/)).toBeTruthy();
    expect(utils.getByTestId('quick-sale-series')).toBeTruthy();

    await act(async () => { fireEvent.press(utils.getByTestId('quick-sale-undo')); });
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(deleteCalls()[0][0]).toMatch(/\/sales\/delete-sale\/sale-db-1$/);
    expect(deleteCalls()[0][1]).toMatchObject({ method: 'DELETE' });
    await waitFor(() => expect(utils.getByText(/Cofnięto: Kurtka M/)).toBeTruthy());
  });

  test('płatność „Karta”: pełna cena z cennika kartą', async () => {
    const utils = await renderQuick();
    fireEvent.press(utils.getByTestId('quick-pay-card'));
    await scan(utils, '1234567890');
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const body = bodyOf(saveCalls()[0]);
    expect(body.card).toEqual([{ price: '850', currency: 'PLN' }]);
    expect(body.cash).toEqual([{ price: '0', currency: 'PLN' }]);
  });

  test('sztuka spoza stanu tego punktu: nic się nie zapisuje, otwiera się formularz z powodem', async () => {
    const utils = await renderQuick();
    await scan(utils, '5555555555');
    await waitFor(() => expect(utils.getByText('Nowa sprzedaż')).toBeTruthy());
    expect(utils.getByTestId('quick-sale-form-reason').props.children.join('')).toMatch(/nie ma na stanie Twojego punktu/);
    expect(saveCalls()).toHaveLength(0);
  });

  test('„Następna: formularz” - jednorazowo pełny formularz zamiast zapisu', async () => {
    const utils = await renderQuick();
    fireEvent.press(utils.getByTestId('quick-next-form'));
    await scan(utils, '1234567890');
    await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy());
    expect(saveCalls()).toHaveLength(0);
  });

  test('wyłączony przełącznik: jak dotąd - skan otwiera formularz', async () => {
    const utils = render(<QRScanner {...props} />);
    await waitFor(() => expect(utils.getByTestId('quick-sale-switch').props.value).toBe(false));
    await scan(utils, '1234567890');
    await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy());
    expect(saveCalls()).toHaveLength(0);
  });

  test('brak odpowiedzi serwera: „Spróbuj ponownie” wysyła ten sam numer sprzedaży', async () => {
    let attempt = 0;
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/sales/save-sales')) {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('Network request failed'));
        return json({ message: 'Ta sprzedaż jest już zapisana.', duplicate: true, sales: { _id: 'sale-db-1' } });
      }
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });
    const utils = await renderQuick();
    await scan(utils, '1234567890');
    await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Brak odpowiedzi serwera', expect.any(String), expect.any(Array)));
    const firstId = bodyOf(saveCalls()[0]).clientRequestId;
    const buttons = appAlert.mock.calls.find(([title]) => title === 'Brak odpowiedzi serwera')[2];
    await act(async () => { buttons.find((b) => b.text === 'Spróbuj ponownie').onPress(); });
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(bodyOf(saveCalls()[1]).clientRequestId).toBe(firstId);
    await waitFor(() => expect(utils.getByText(/Już zapisana: Kurtka M/)).toBeTruthy());
  });
});

describe('buildQuickSale', () => {
  const base = { stateData: props.stateData, goods: [GOOD], sizes: [], priceList: [], user: props.user };
  test('cena poniżej minimum albo brak ceny = formularz', () => {
    const cheap = { ...GOOD, price: 0 };
    expect(buildQuickSale({ ...base, code: '1234567890', goods: [cheap] }).ok).toBe(false);
    expect(buildQuickSale({ ...base, code: 'nieznany' })).toEqual({ ok: false, reason: expect.stringMatching(/nie ma na stanie/) });
  });
});
