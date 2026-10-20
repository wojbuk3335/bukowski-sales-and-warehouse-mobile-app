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

describe('QRScanner - płatność gotówką', () => {
  beforeEach(() => {
    tokenService.authenticatedFetch.mockReset();
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (url.endsWith('/pricelists/my')) return json({ priceList: [] });
      if (url.endsWith('/sales/save-sales')) return json({ message: 'ok' });
      return json({});
    });
  });

  test('płatność gotówką: bez domyślnego wiersza wpłaty, wiersze tylko z „Dodaj walutę”, zapis z Dopłaty', async () => {
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

    await waitFor(() => expect(utils.queryByTestId('cash-payment-amount-0')).toBeNull());
    expect(utils.getByText('Klient wpłaca')).toBeTruthy();

    fireEvent.press(utils.getByText('Dodaj walutę'));
    expect(utils.getByTestId('cash-payment-amount-0')).toBeTruthy(); // dodany pusty wiersz nie znika
    fireEvent.press(utils.getByLabelText('Usuń'));
    await waitFor(() => expect(utils.queryByTestId('cash-payment-amount-0')).toBeNull());

    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      const body = JSON.parse(saveCall[1].body);
      expect(body.cash).toEqual([{ price: '850.00', currency: 'PLN' }]);
      expect(body.card).toEqual([]);
    });
  });

  test('klient dopłaca więcej niż trzeba: puste pole reszty z podpowiedzią, po wpisaniu reszty do obrotu kwota po odjęciu', async () => {
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
    await waitFor(() => expect(utils.getByTestId('remaining-amount')).toBeTruthy());

    fireEvent.press(utils.getByTestId('remaining-currency'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));
    await waitFor(() => expect(utils.getByTestId('remaining-amount').props.value).toBe('199.54')); // 199.5305 w górę
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.04 zł'); // 199.54 × 4.26 = 850.0404 w dół
    expect(utils.queryByTestId('minimum-price')).toBeNull();
    expect(utils.queryByTestId('extra-change')).toBeNull();

    fireEvent.changeText(utils.getByTestId('remaining-amount'), '200');
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    expect(utils.getByTestId('change-amount-0').props.value).toBe(''); // puste, podpowiedź tylko w placeholderze
    expect(utils.getByTestId('change-amount-0').props.placeholder).toBe('0.46'); // (200 - 199.54) EUR - reszta względem prośby, nie ceny
    expect(utils.getByTestId('change-currency-0')).toHaveTextContent('EUR');

    // reszta w dwóch walutach: drugi wiersz w zł podpowiada resztę pomniejszoną o pierwszy
    fireEvent.press(utils.getByTestId('change-add-currency'));
    expect(utils.getByTestId('change-currency-1')).toHaveTextContent('PLN');
    // podpowiedzi sumują się do reszty: cała reszta w pierwszym pustym wierszu, kolejny pusty 0.00
    expect(utils.getByTestId('change-amount-0').props.placeholder).toBe('0.46');
    expect(utils.getByTestId('change-amount-1').props.placeholder).toBe('0.00');
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '0.2');
    await waitFor(() => expect(utils.getByTestId('change-amount-1').props.placeholder).toBe('1.10')); // 1.9596 - 0.852 = 1.1076 zł w dół
    fireEvent.changeText(utils.getByTestId('change-amount-1'), '1.10');
    await waitFor(() => expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.04 zł')); // 852 - 0.852 - 1.10 = 850.048 w dół

    // za mało: krótka informacja o minimalnej cenie
    fireEvent.changeText(utils.getByTestId('remaining-amount'), '150');
    await waitFor(() => expect(utils.getByTestId('minimum-price')).toHaveTextContent('Minimalna cena: 850.00 zł'));
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 639.00 zł');
    expect(utils.getByTestId('minimum-top-up-cash')).toHaveTextContent('Klient musi dopłacić: 199.54 EUR'); // 850 zł / 4.26 w górę, brak wpłat
    fireEvent.changeText(utils.getByTestId('remaining-amount'), '200');
    await waitFor(() => expect(utils.queryByTestId('minimum-price')).toBeNull());
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '0.2');
    fireEvent.changeText(utils.getByTestId('change-amount-1'), '1.10');

    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      expect(JSON.parse(saveCall[1].body).cash).toEqual([{ price: '199.5418', currency: 'EUR' }]); // 200 - 0.2 - 1.10 zł, dokładnie
    });
  });

  test('cena poniżej minimum: „Klient musi dopłacić” zmienia się razem z „Klient wpłaca”', async () => {
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
    await waitFor(() => expect(utils.getByTestId('remaining-amount')).toBeTruthy());
    fireEvent.press(utils.getByTestId('remaining-currency'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));
    fireEvent.changeText(utils.getByTestId('sale-price-input'), '600');
    await waitFor(() => expect(utils.getByTestId('minimum-top-up-cash')).toHaveTextContent('Klient musi dopłacić: 199.54 EUR'));

    fireEvent.press(utils.getAllByText('Dodaj walutę')[0]); // „Klient wpłaca”
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '100');
    await waitFor(() => expect(utils.getByTestId('minimum-top-up-cash')).toHaveTextContent('Klient musi dopłacić: 176.06 EUR')); // (850 - 100) / 4.26
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '300');
    await waitFor(() => expect(utils.getByTestId('minimum-top-up-cash')).toHaveTextContent('Klient musi dopłacić: 129.11 EUR')); // (850 - 300) / 4.26
  });

  test('nadpłata poniżej grosza to nie reszta; reszta pojawia się, gdy naprawdę jest co wydać', async () => {
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
    await waitFor(() => expect(utils.getByTestId('remaining-amount')).toBeTruthy());
    fireEvent.press(utils.getAllByText('Dodaj walutę')[0]);
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '199.531');
    fireEvent.press(utils.getByTestId('cash-payment-currency-0'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));

    // 199.531 EUR = 850.002 zł: nadwyżka poniżej grosza zostaje u sprzedawcy, bez „Reszta do wydania: 0.00”
    await waitFor(() => expect(utils.getByTestId('remaining-amount').props.value).toBe('0.00'));
    expect(utils.queryByText(/Reszta do wydania/)).toBeNull();
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.00 zł');

    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '200');
    // nadpłata z „Klient wpłaca”: ta sama sekcja reszty co przy dopłacie, pole „Klient dopłaca” znika
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    expect(utils.queryByTestId('remaining-amount')).toBeNull();
    expect(utils.getByTestId('change-amount-0').props.placeholder).toBe('2.00'); // 852 - 850, waluta dopłaty PLN
    fireEvent.press(utils.getByTestId('change-add-currency'));
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '1.5');
    await waitFor(() => expect(utils.getByTestId('change-amount-1').props.placeholder).toBe('0.50'));
    fireEvent.changeText(utils.getByTestId('change-amount-1'), '0.5');
    await waitFor(() => expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.00 zł'));
    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      expect(JSON.parse(saveCall[1].body).cash).toEqual([{ price: '199.5305', currency: 'EUR' }]); // 200 - 2 zł / 4.26
    });
  });

  test('gotówka i karta: reszta nie większa niż gotówka od klienta (z karty reszty nie ma) - blokada zapisu', async () => {
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
    fireEvent.press(utils.getAllByText('Dodaj walutę')[0]);
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '20');
    await waitFor(() => expect(utils.getByTestId('card-payment-amount-0').props.value).toBe('830.00'));
    fireEvent.changeText(utils.getByTestId('card-payment-amount-0'), '900'); // nadpłata 70 zł, a gotówki tylko 20
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    expect(utils.getByTestId('change-amount-0').props.placeholder).toBe('20.00'); // podpowiedź nie przekracza gotówki
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '70');
    await waitFor(() => expect(utils.getByTestId('change-over-cash')).toHaveTextContent(/^Reszta \(70\.00 zł\) większa niż gotówka od klienta \(20\.00 zł\)/));
    fireEvent.press(utils.getByText('Dodaj'));
    expect(await utils.findByText(/Reszta 70.00 zł jest większa niż gotówka od klienta/)).toBeTruthy();
    expect(tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'))).toBeUndefined();
  });

  test('gotówka i karta: bez gotówki karta = cała cena; nadpłata gotówką = ta sama sekcja reszty, karta 0', async () => {
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
    await waitFor(() => expect(utils.getByTestId('card-payment-amount-0').props.value).toBe('850.00')); // bez gotówki - karta płaci całość
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.00 zł');

    fireEvent.press(utils.getAllByText('Dodaj walutę')[0]);
    fireEvent.changeText(utils.getByTestId('cash-payment-amount-0'), '1000');
    await waitFor(() => expect(utils.getByTestId('card-payment-amount-0').props.value).toBe('0.00')); // gotówka pokryła cenę
    expect(utils.getByTestId('extra-change')).toBeTruthy();
    expect(utils.getByTestId('change-amount-0').props.placeholder).toBe('150.00');
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '150');
    await waitFor(() => expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.00 zł'));

    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      const body = JSON.parse(saveCall[1].body);
      expect(body.cash).toEqual([{ price: '850.00', currency: 'PLN' }]);
      expect(body.card).toEqual([]);
    });
  });

  test('za duża reszta: komunikat o maksymalnej reszcie zamiast „Klient musi dopłacić”', async () => {
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
    await waitFor(() => expect(utils.getByTestId('remaining-amount')).toBeTruthy());
    fireEvent.press(utils.getByTestId('remaining-currency'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));
    fireEvent.changeText(utils.getByTestId('remaining-amount'), '200'); // 852 zł przy prośbie o 199.54 EUR (850 zł)
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    fireEvent.press(utils.getByTestId('change-add-currency'));
    fireEvent.changeText(utils.getByTestId('change-amount-1'), '3'); // 3 zł reszty, a wolno tylko 2 zł

    await waitFor(() => expect(utils.getByTestId('minimum-price')).toHaveTextContent('Minimalna cena: 850.00 zł'));
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 849.00 zł');
    expect(utils.getByTestId('change-too-much')).toHaveTextContent('Reszta za duża o 1.00 zł - maksymalna reszta: 2.00 zł (0.46 EUR)');
    expect(utils.queryByTestId('minimum-top-up-cash')).toBeNull();

    fireEvent.changeText(utils.getByTestId('change-amount-1'), '2');
    await waitFor(() => expect(utils.queryByTestId('minimum-price')).toBeNull());
    expect(utils.queryByTestId('change-too-much')).toBeNull();
  });

  test('po Anuluj następna sprzedaż zaczyna od czystej dopłaty i bez wierszy reszty', async () => {
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
    const scan = async () => {
      for (let i = 0; i < 3; i += 1) {
        fireEvent(utils.getByTestId('camera-view'), 'onBarcodeScanned', { data: '1234567890', type: 'code128' });
      }
      await waitFor(() => expect(utils.getByTestId('remaining-amount')).toBeTruthy());
    };
    await scan();
    fireEvent.press(utils.getByTestId('remaining-currency'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));
    fireEvent.changeText(utils.getByTestId('remaining-amount'), '200');
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    fireEvent.press(utils.getByTestId('change-add-currency'));
    fireEvent.changeText(utils.getByTestId('change-amount-1'), '1.10');

    fireEvent.press(utils.getByText('Anuluj'));
    await waitFor(() => expect(utils.queryByTestId('remaining-amount')).toBeNull());
    await scan();
    // ta sama kurtka, ta sama cena: podpowiedź z cennika, nie stare 200 EUR; bez sekcji reszty
    await waitFor(() => expect(utils.getByTestId('remaining-amount').props.value).toBe('199.54'));
    expect(utils.queryByTestId('extra-change')).toBeNull();
    fireEvent.changeText(utils.getByTestId('remaining-amount'), '200');
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    expect(utils.queryByTestId('change-amount-1')).toBeNull(); // stary drugi wiersz reszty nie wrócił
    expect(utils.getByTestId('change-amount-0').props.value).toBe('');
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 852.00 zł'); // nic nie odjęte po cichu
  });

  test('krzyżyk w „Reszta do wydania”: reszty nie wydajemy, do obrotu cała kwota; link przywraca sekcję', async () => {
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
    await waitFor(() => expect(utils.getByTestId('remaining-amount')).toBeTruthy());
    fireEvent.press(utils.getByTestId('remaining-currency'));
    fireEvent.press(await waitFor(() => utils.getByText('EUR')));
    fireEvent.changeText(utils.getByTestId('remaining-amount'), '200');
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    fireEvent.changeText(utils.getByTestId('change-amount-0'), '0.46');
    await waitFor(() => expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 850.04 zł')); // 852 - 0.46 × 4.26

    fireEvent.press(utils.getByTestId('change-dismiss'));
    await waitFor(() => expect(utils.queryByTestId('extra-change')).toBeNull());
    expect(utils.getByTestId('final-price')).toHaveTextContent('Finalna cena: 852.00 zł'); // nic nie odjęte
    expect(utils.getByTestId('change-reopen')).toBeTruthy();

    fireEvent.press(utils.getByTestId('change-reopen'));
    await waitFor(() => expect(utils.getByTestId('extra-change')).toBeTruthy());
    expect(utils.getByTestId('change-amount-0').props.value).toBe('0.46'); // wpisana reszta wraca
    fireEvent.press(utils.getByTestId('change-dismiss'));

    fireEvent.press(utils.getByText('Dodaj'));
    await waitFor(() => {
      const saveCall = tokenService.authenticatedFetch.mock.calls.find(([url]) => url.endsWith('/sales/save-sales'));
      expect(saveCall).toBeTruthy();
      expect(JSON.parse(saveCall[1].body).cash).toEqual([{ price: '200.00', currency: 'EUR' }]);
    });
  });
});
