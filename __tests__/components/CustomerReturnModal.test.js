import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Zwrot kurtki od klienta (31.10.2026): skaner jak przy sprzedaży (+ „Z bazy”), pytanie o Pana Kazka tylko przy jego
// kurtkach, kwota (nie więcej niż w kasie), powód; zapis jednym żądaniem z numerem do ponowienia.

jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));
jest.mock('../../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));
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
  const screen = render(<CustomerReturnModal visible onClose={jest.fn()} onSaved={onSaved} goods={[]} sizes={[]} availableFunds={{ PLN: 1000 }} {...props} />);
  return { screen, onSaved };
};

test('skan → kurtka, kwota, powód → jeden zapis (kod, kwota, waluta, powód, numer); bez pytania o Pana Kazka', async () => {
  const { screen, onSaved } = renderModal();
  fireEvent.press(screen.getByTestId('fake-scan'));
  expect(await screen.findByTestId('customer-return-form')).toBeTruthy();
  expect(screen.getByTestId('customer-return-product').props.children).toBe('Ada CZERWONY XL');
  expect(screen.queryByTestId('customer-return-kazek')).toBeNull();

  fireEvent.changeText(screen.getByTestId('customer-return-amount'), '850');
  fireEvent.press(screen.getByTestId('customer-return-reason-Wada'));
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  fireEvent.press(screen.getByTestId('customer-return-submit')); // podwójne stuknięcie
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ label: 'Ada CZERWONY XL', amount: 850, currency: 'PLN', panKazek: null }));
  expect(posts()).toEqual([{ barcode: CODE, amount: 850, currency: 'PLN', reason: 'Wada', panKazekSaleId: null, clientRequestId: expect.stringMatching(/^cret-/) }]);
});

test('kurtka od Pana Kazka: bez odpowiedzi nie zapisze; „Tak” wysyła jego sprzedaż', async () => {
  checkResponse = () => json({ fullName: 'Ada CZERWONY', size: 'XL', kazekSales: [{ saleId: 's-k', timestamp: '2026-10-20T10:00:00Z', sellingPoint: 'Most', priceLabel: '900 PLN', status: 'paid', paidRate: 15 }] });
  const { screen, onSaved } = renderModal();
  fireEvent.press(screen.getByTestId('fake-scan'));
  expect(await screen.findByTestId('customer-return-kazek')).toBeTruthy();
  expect(screen.getByTestId('customer-return-kazek-s-k-note').props.children).toContain('odliczymy 15.00 zł');
  fireEvent.changeText(screen.getByTestId('customer-return-amount'), '900');
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  expect(appAlert).toHaveBeenCalledWith('Pan Kazek', expect.any(String));
  expect(posts()).toHaveLength(0);

  fireEvent.press(screen.getByTestId('customer-return-kazek-s-k'));
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(posts()[0].panKazekSaleId).toBe('s-k');
});

test('więcej niż w kasie - odmowa; nieznany kod - komunikat i skaner dalej; „Inny” powód wymaga wpisu', async () => {
  checkResponse = () => json({ code: 'CUSTOMER_RETURN_UNKNOWN', message: 'Nie rozpoznano kurtki po tym kodzie - wybierz ją z bazy.' }, 404);
  const { screen } = renderModal();
  fireEvent.press(screen.getByTestId('fake-scan'));
  await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Nie rozpoznano kurtki', 'Nie rozpoznano kurtki po tym kodzie - wybierz ją z bazy.'));
  expect(screen.getByTestId('scan-camera')).toBeTruthy();

  checkResponse = () => json({ fullName: 'Ada CZERWONY', size: 'XL', kazekSales: [] });
  fireEvent.press(screen.getByTestId('fake-scan'));
  await screen.findByTestId('customer-return-form');
  fireEvent.changeText(screen.getByTestId('customer-return-amount'), '1500');
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  expect(appAlert).toHaveBeenCalledWith('Za mało w kasie', expect.stringContaining('1000.00 PLN'));

  fireEvent.changeText(screen.getByTestId('customer-return-amount'), '100');
  fireEvent.press(screen.getByTestId('customer-return-reason-Inny'));
  fireEvent.press(screen.getByTestId('customer-return-submit'));
  expect(appAlert).toHaveBeenCalledWith('Powód', expect.any(String));
  expect(posts()).toHaveLength(0);
});
