import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Zwrot kurtki od klienta (31.10.2026): skaner jak przy sprzedaży (+ „Z bazy”), formularz jak „Nowa sprzedaż”: kwota
// w walutach (wiersze + „Dodaj walutę”), powód zwrotu; Pan Kazek tylko Tak / Nie; zapis jednym żądaniem z numerem do ponowienia.

jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));
jest.mock('../../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../components/scanner/ScanCamera', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return function ScanCameraMock(props) {
    return React.createElement(View, { testID: 'scan-camera' },
      React.createElement(TouchableOpacity, { testID: 'fake-scan', onPress: () => props.onScanned({ data: global.__scanCode }) }, React.createElement(Text, null, 'scan')),
      ...(props.extraActions || []).map((action) => React.createElement(TouchableOpacity, { key: action.testID, testID: action.testID, onPress: action.onPress }, React.createElement(Text, null, action.label))),
      props.children);
  };
});

import CustomerReturnModal from '../../components/CustomerReturnModal';
import tokenService from '../../services/tokenService';
import { appAlert } from '../../services/appAlert';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const CODE = '0010701300002';
let checkResponse;
const posts = () => tokenService.authenticatedFetch.mock.calls
  .filter(([url, options]) => String(url).endsWith('/transfer/customer-return') && options?.method === 'POST')
  .map(([, options]) => JSON.parse(options.body));

beforeEach(() => {
  global.__scanCode = CODE;
  appAlert.mockReset();
  checkResponse = () => json({ fullName: 'Ada CZERWONY', size: 'XL', kazekSales: [] });
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (String(url).includes('/customer-return/check')) return checkResponse();
    if (options.method === 'POST') return json({ panKazek: null }, 201);
    return json({});
  });
});

const renderModal = (props = {}) => {
  const onSaved = jest.fn();
  const screen = render(<CustomerReturnModal visible onClose={jest.fn()} onSaved={onSaved} goods={[]} sizes={[]} availableFunds={{ PLN: 1000, EUR: 100 }} currencies={[{ code: 'PLN', name: 'Złoty', buyRate: 1 }, { code: 'EUR', name: 'Euro', buyRate: 4.3 }]} {...props} />);
  return { screen, onSaved };
};

test('skan → formularz jak sprzedaż: kwota, druga waluta, powód → jeden zapis z walutami; bez pytania o Pana Kazka', async () => {
  const { screen, onSaved } = renderModal();
  fireEvent.press(screen.getByTestId('fake-scan'));
  expect(await screen.findByTestId('customer-return-form')).toBeTruthy();
  expect(screen.getByTestId('customer-return-product').props.value).toBe('Ada CZERWONY XL');
  expect(screen.queryByTestId('customer-return-kazek')).toBeNull();

  fireEvent.changeText(screen.getByTestId('customer-return-amount-0'), '500');
  fireEvent.press(screen.getByTestId('customer-return-add-currency'));
  fireEvent.changeText(screen.getByTestId('customer-return-amount-1'), '50');
  fireEvent.press(screen.getByTestId('customer-return-currency-1'));
  fireEvent.press(screen.getByTestId('customer-return-currency-option-EUR'));
  fireEvent.changeText(screen.getByTestId('customer-return-reason'), 'nie pasuje rozmiar');
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  fireEvent.press(screen.getByTestId('customer-return-submit')); // podwójne stuknięcie
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ label: 'Ada CZERWONY XL', payments: [{ amount: 500, currency: 'PLN' }, { amount: 50, currency: 'EUR' }] }));
  expect(posts()).toEqual([{ barcode: CODE, payments: [{ amount: 500, currency: 'PLN' }, { amount: 50, currency: 'EUR' }], reason: 'nie pasuje rozmiar', panKazekSaleId: null, clientRequestId: expect.stringMatching(/^cret-/) }]);
});

test('kurtka od Pana Kazka: tylko „Tak” / „Nie - zwykła kurtka” (bez rozliczeń); bez odpowiedzi nie zapisze', async () => {
  checkResponse = () => json({ fullName: 'Ada CZERWONY', size: 'XL', kazekSales: [{ saleId: 's-k', timestamp: '2026-10-20T10:00:00Z', sellingPoint: 'Most', priceLabel: '900 PLN', status: 'paid', paidRate: 15 }] });
  const { screen, onSaved } = renderModal();
  fireEvent.press(screen.getByTestId('fake-scan'));
  expect(await screen.findByTestId('customer-return-kazek')).toBeTruthy();
  expect(screen.getByText('Tak')).toBeTruthy();
  expect(screen.getByText('Nie - zwykła kurtka')).toBeTruthy();
  expect(screen.queryByText(/rozliczona|odliczymy|zapłacimy/)).toBeNull();

  fireEvent.changeText(screen.getByTestId('customer-return-amount-0'), '900');
  fireEvent.changeText(screen.getByTestId('customer-return-reason'), 'wada');
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  expect(appAlert).toHaveBeenCalledWith('Pan Kazek', expect.any(String));
  expect(posts()).toHaveLength(0);

  fireEvent.press(screen.getByTestId('customer-return-kazek-s-k'));
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(posts()[0].panKazekSaleId).toBe('s-k');
});

test('więcej niż w kasie - odmowa; nieznany kod - komunikat i skaner dalej; bez powodu - odmowa', async () => {
  checkResponse = () => json({ code: 'CUSTOMER_RETURN_UNKNOWN', message: 'Nie rozpoznano kurtki po tym kodzie - wybierz ją z bazy.' }, 404);
  const { screen } = renderModal();
  fireEvent.press(screen.getByTestId('fake-scan'));
  await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Nie rozpoznano kurtki', 'Nie rozpoznano kurtki po tym kodzie - wybierz ją z bazy.'));
  expect(screen.getByTestId('scan-camera')).toBeTruthy();

  checkResponse = () => json({ fullName: 'Ada CZERWONY', size: 'XL', kazekSales: [] });
  fireEvent.press(screen.getByTestId('fake-scan'));
  await screen.findByTestId('customer-return-form');
  fireEvent.changeText(screen.getByTestId('customer-return-amount-0'), '1500');
  fireEvent.changeText(screen.getByTestId('customer-return-reason'), 'wada');
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  expect(appAlert).toHaveBeenCalledWith('Za mało w kasie', expect.stringContaining('1000.00 PLN'));

  fireEvent.changeText(screen.getByTestId('customer-return-amount-0'), '100');
  fireEvent.changeText(screen.getByTestId('customer-return-reason'), '  ');
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  expect(appAlert).toHaveBeenCalledWith('Powód zwrotu', expect.any(String));
  expect(posts()).toHaveLength(0);
});
