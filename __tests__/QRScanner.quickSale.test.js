import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Sprzedaż ciągła (8.11.2026): skan = sprzedaż zapisana od razu, ZAWSZE gotówką, także sztuka spoza stanu; pasek
// z „Cofnij”. Czego serwer nie przyjmie (nieznany kod, brak ceny) - czerwony pasek, bez formularza, skaner działa dalej.

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
    { barcode: '5555555555', fullName: 'Inna', size: 'L', symbol: 'PUNKT2', price: 300, category: 'Kurtki kożuchy futra' }, // tylko w innym punkcie
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

  test('sztuka tylko na stanie innego punktu: zapis od razu, ZAWSZE z punktu zalogowanego (nazwa i cena ze stanu tamtego)', async () => {
    const utils = await renderQuick();
    await scan(utils, '5555555555');
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(bodyOf(saveCalls()[0])).toMatchObject({ fullName: 'Inna', size: 'L', from: 'PUNKT1', symbol: 'PUNKT1', card: [] });
    expect(bodyOf(saveCalls()[0]).cash).toEqual([{ price: '300.00', currency: 'PLN' }]);
    expect(bodyOf(saveCalls()[0]).cash[0].currency).toBe('PLN');
    expect(utils.queryByText('Nowa sprzedaż')).toBeNull(); // bez formularza
  });

  test('sztuki nie ma na żadnym stanie, ale kod ma kartę produktu: zapis od razu z własnego punktu', async () => {
    const utils = render(<QRScanner {...props} stateData={[]} />);
    await AsyncStorage.setItem('quick-sale-mode', '1');
    fireEvent(utils.getByTestId('quick-sale-switch'), 'valueChange', true);
    await scan(utils, '1234567890');
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const body = bodyOf(saveCalls()[0]);
    expect(body).toMatchObject({ fullName: 'Kurtka', size: '-', from: 'PUNKT1', symbol: 'PUNKT1' });
    expect(body.cash).toEqual([{ price: '850.00', currency: 'PLN' }]);
  });

  test('nieznany kod: nic nie zapisuje, czerwony pasek, bez formularza; skaner gotowy na następny', async () => {
    const utils = await renderQuick();
    await scan(utils, '9999999999');
    await waitFor(() => expect(utils.getByTestId('quick-sale-error')).toBeTruthy());
    expect(utils.getByText(/NIE ZAPISANO: Nieznany kod 9999999999/)).toBeTruthy();
    expect(saveCalls()).toHaveLength(0);
    expect(utils.queryByText('Nowa sprzedaż')).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); }); // kamera przezbraja się sama po 0,6 s
    await scan(utils, '1234567890'); // następna kurtka idzie normalnie
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    await waitFor(() => expect(utils.queryByTestId('quick-sale-error')).toBeNull());
  });

  test('bez wyboru płatności: nie ma przycisków Gotówka / Karta / Następna: formularz', async () => {
    const utils = await renderQuick();
    expect(utils.queryByTestId('quick-pay-card')).toBeNull();
    expect(utils.queryByTestId('quick-pay-cash')).toBeNull();
    expect(utils.queryByTestId('quick-next-form')).toBeNull();
  });

  test('odmowa serwera: czerwony pasek z powodem zamiast okienka', async () => {
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/sales/save-sales')) return json({ message: 'Minimalna cena tego produktu to 900 zł.' }, 400);
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });
    const utils = await renderQuick();
    await scan(utils, '1234567890');
    await waitFor(() => expect(utils.getByText(/NIE ZAPISANO Kurtka M: Minimalna cena/)).toBeTruthy());
    expect(appAlert).not.toHaveBeenCalled();
  });

  test('czytnik: dwa skany szybko po sobie (pierwszy jeszcze się zapisuje) - oba zapisane po kolei, czytnik nie gaśnie', async () => {
    let releaseFirst;
    let calls = 0;
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/sales/save-sales')) {
        calls += 1;
        if (calls === 1) return new Promise((resolve) => { releaseFirst = () => resolve({ ok: true, status: 201, json: () => Promise.resolve({ sales: { _id: 'a' } }) }); });
        return json({ sales: { _id: 'b' } }, 201);
      }
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      return json({});
    });
    const utils = await renderQuick();
    const toCard = utils.queryByTestId('scan-mode-bluetooth');
    if (toCard) fireEvent.press(toCard);
    const input = await utils.findByTestId('bluetooth-scan-input');
    await act(async () => { fireEvent.changeText(input, '1234567890'); });
    await act(async () => { fireEvent(input, 'submitEditing'); });
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(utils.getByTestId('bluetooth-scan-input').props.editable).not.toBe(false); // w trakcie zapisu pole czytnika działa
    await act(async () => { fireEvent.changeText(utils.getByTestId('bluetooth-scan-input'), '1234567890'); });
    await act(async () => { fireEvent(utils.getByTestId('bluetooth-scan-input'), 'submitEditing'); });
    expect(saveCalls()).toHaveLength(1); // drugi czeka w kolejce
    await act(async () => { releaseFirst(); });
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(bodyOf(saveCalls()[0]).clientRequestId).not.toBe(bodyOf(saveCalls()[1]).clientRequestId);
    await act(async () => { await AsyncStorage.setItem('scanner-input-mode', 'camera'); });
  });

  test('wyłączony przełącznik: jak dotąd - skan otwiera formularz', async () => {
    const utils = render(<QRScanner {...props} />);
    await waitFor(() => expect(utils.getByTestId('quick-sale-switch').props.value).toBe(false));
    await scan(utils, '1234567890');
    await waitFor(() => expect(utils.getByTestId('payment-mode')).toBeTruthy());
    expect(saveCalls()).toHaveLength(0);
  });

  test('brak odpowiedzi serwera: „Ponów” na pasku wysyła ten sam numer sprzedaży', async () => {
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
    await waitFor(() => expect(utils.getByTestId('quick-sale-retry')).toBeTruthy());
    expect(appAlert).not.toHaveBeenCalled(); // bez okienka - kasa nie stoi
    const firstId = bodyOf(saveCalls()[0]).clientRequestId;
    await act(async () => { fireEvent.press(utils.getByTestId('quick-sale-retry')); });
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(bodyOf(saveCalls()[1]).clientRequestId).toBe(firstId);
    await waitFor(() => expect(utils.getByText(/Już zapisana: Kurtka M/)).toBeTruthy());
  });
});

describe('buildQuickSale', () => {
  const base = { stateData: props.stateData, goods: [GOOD], sizes: [], priceList: [], user: props.user };
  test('brak ceny = nie zapisuje; nieznany kod = nie zapisuje; spoza stanu z nazwą z kodu = zapis z własnego punktu', () => {
    expect(buildQuickSale({ ...base, code: '1234567890', goods: [{ ...GOOD, price: 0 }] })).toEqual({ ok: false, reason: expect.stringMatching(/brak ceny/) });
    expect(buildQuickSale({ ...base, code: 'nieznany' })).toEqual({ ok: false, reason: expect.stringMatching(/Nieznany kod/) });
    const unstocked = buildQuickSale({ ...base, stateData: [], code: '1234567890', unstocked: { fullName: 'Kurtka', size: 'XL' } });
    expect(unstocked.ok).toBe(true);
    expect(unstocked.sale).toMatchObject({ fullName: 'Kurtka', size: 'XL', symbol: 'PUNKT1', payment: 'cash', card: [] });
  });
});
