import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Pan Kazek (30.10.2026): admin rozlicza stawką za kurtkę - wszystkie oczekujące (niezależnie od filtra)
// minus odliczenia za kurtki zwrócone po rozliczeniu; statusy zwrotów; rozliczonej kurtki nie usuwa się z listy.

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('../../config/api', () => ({ getApiUrl: (endpoint) => `http://mock.api${endpoint}` }));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));

import PanKazek, { settlementTotal } from '../../app/pan-kazek';
import tokenService from '../../services/tokenService';
import { appAlert } from '../../services/appAlert';

const response = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const ITEMS = [
  { _id: 'k1', productId: 's1', fullName: 'Ada CZERWONY', size: 'XL', price: '900 PLN', status: 'pending', createdAt: '2026-10-30T09:00:00Z' },
  { _id: 'k2', productId: 's2', fullName: 'Bella CZARNY', size: 'M', price: '800 PLN', status: 'deduct', paidRate: 15, paidAt: '2026-10-01T09:00:00Z', returnedAt: '2026-10-20T09:00:00Z', returnReason: 'Wymiana', createdAt: '2026-09-30T09:00:00Z' },
];

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    const text = String(url);
    if (text.includes('/pan-kazek/pay-all')) return response({ message: 'Rozliczono' });
    if (text.includes('/pan-kazek/months')) return response({ data: [] });
    if (text.includes('/undo')) return response({ message: 'Cofnięto rozliczenie: 3 kurtek wróciło do rozliczenia.' });
    if (text.includes('/pan-kazek/settlements')) return response({ data: [
      { _id: 'st1', createdAt: '2026-10-31T09:00:00Z', itemsCount: 3, ratePerItem: 150, deductCount: 0, deductAmount: 0, totalAmount: 450, paidBy: 'admin@x.pl', canUndo: true },
      { _id: 'st0', createdAt: '2026-10-01T09:00:00Z', itemsCount: 2, ratePerItem: 10, deductCount: 0, deductAmount: 0, totalAmount: 20, paidBy: 'admin@x.pl' },
    ] });
    return response({ data: ITEMS, allTimeStats: { total: 2, pending: 1, paid: 0 }, filteredStats: { total: 2, pending: 1, paid: 0 }, toSettle: { pendingCount: 200, deductCount: 1, deductAmount: 15 } });
  });
});

test('podgląd: stawka × kurtki − odliczenia (przecinek jak kropka)', () => {
  expect(settlementTotal('15', { pendingCount: 200, deductAmount: 15 })).toEqual({ gross: 3000, total: 2985 });
  expect(settlementTotal('10,5', { pendingCount: 2, deductAmount: 0 })).toEqual({ gross: 21, total: 21 });
  expect(settlementTotal('0', { pendingCount: 2, deductAmount: 0 })).toBeNull();
});

test('rozliczenie wszystkich oczekujących stawką admina; statusy zwrotu; rozliczonej nie da się usunąć', async () => {
  const screen = render(<PanKazek />);
  expect(await screen.findByText('Rozlicz wszystkie oczekujące (200)')).toBeTruthy();
  expect(screen.getByTestId('pan-kazek-status-s2').props.children).toBe('Zwrot - do odliczenia');
  expect(screen.getAllByText('Usuń')).toHaveLength(1); // tylko oczekująca

  fireEvent.press(screen.getByTestId('pan-kazek-settle'));
  fireEvent.changeText(screen.getByTestId('pan-kazek-rate'), '15');
  expect(screen.getByTestId('pan-kazek-preview').props.children).toBe('200 × 15.00 zł = 3000.00 zł − 15.00 zł\nDo wypłaty: 2985.00 zł');
  fireEvent.press(screen.getByTestId('pan-kazek-confirm'));
  await waitFor(() => {
    const call = tokenService.authenticatedFetch.mock.calls.find(([url]) => String(url).includes('/pay-all'));
    expect(JSON.parse(call[1].body)).toEqual({ ratePerItem: 15 });
  });
});

test('cofnięcie ostatniego rozliczenia: „Cofnij” tylko przy nim, potwierdzenie, zapytanie do serwera', async () => {
  const screen = render(<PanKazek />);
  const buttons = await screen.findAllByTestId('pan-kazek-undo');
  expect(buttons).toHaveLength(1);
  fireEvent.press(buttons[0]);
  const [, , confirmButtons] = appAlert.mock.calls.find(([title]) => title === 'Cofnij rozliczenie');
  await confirmButtons.find((button) => button.text === 'Cofnij').onPress();
  const call = tokenService.authenticatedFetch.mock.calls.find(([url]) => String(url).includes('/undo'));
  expect(String(call[0])).toContain('/pan-kazek/settlements/st1/undo');
  expect(call[1]).toEqual({ method: 'POST' });
});
