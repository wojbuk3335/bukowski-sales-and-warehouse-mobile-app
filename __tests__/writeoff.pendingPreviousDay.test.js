import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Stan (26.10.2026): przepisanie z wcześniejszego dnia, jeszcze nieodpisane w Dobieraniu, dalej wyszarza kurtkę
// (z datą w napisie, bez „Anuluj” - to tylko administrator w panelu); dzień liczony po czasie polskim, więc
// przepisanie z 00:30 w nocy jest dzisiejsze (można anulować).

jest.mock('../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() })); // odświeżanie na żywo (28.10.2026)
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: (effect) => {
    const React = require('react');
    React.useEffect(() => effect(), []);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../services/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../services/appAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../config/api', () => ({ getApiUrl: (endpoint) => `http://localhost:3000${endpoint}` }));

import tokenService from '../services/tokenService';
import WriteOff from '../app/(tabs)/writeoff';
import { GlobalStateContext } from '../context/GlobalState';
import { warsawDay, warsawToday, warsawOffsetHours } from '../utils/warsawDay';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const today = warsawToday();
// wczoraj (dzień polski) o 15:00 oraz dziś o 00:30 czasu polskiego zapisane w UTC
const yesterdayNoonUtc = new Date(`${today}T12:00:00.000Z`); yesterdayNoonUtc.setUTCDate(yesterdayNoonUtc.getUTCDate() - 1);
const yesterdayDay = warsawDay(yesterdayNoonUtc);
const todayMidnightUtc = new Date(`${today}T00:30:00.000Z`);
todayMidnightUtc.setUTCHours(todayMidnightUtc.getUTCHours() - warsawOffsetHours(todayMidnightUtc)); // 00:30 PL -> 22:30/23:30 UTC dnia poprzedniego
if (warsawDay(todayMidnightUtc) !== today) todayMidnightUtc.setUTCHours(todayMidnightUtc.getUTCHours() + 1);

const user = { symbol: 'P', email: 'p@test.pl', location: 'Zakopane', sellingPoint: 'Parzygnat' };
const points = [{ _id: 'u-t', symbol: 'T', role: 'user', location: 'Zakopane', sellingPoint: 'Tata' }];
const stateData = [
  { id: 'old-1', fullName: 'Ada CZERWONY', size: 'XL', symbol: 'P', barcode: '555' },
  { id: 'night-1', fullName: 'Ewa BRĄZ', size: 'L', symbol: 'P', barcode: '777' },
];
const transfers = [
  { _id: 'tr-old', productId: 'old-1', fullName: 'Ada CZERWONY', size: 'XL', barcode: '555', transfer_from: 'P', transfer_to: 'T', blueProcessed: false, date: yesterdayNoonUtc.toISOString(), dateString: yesterdayDay },
  { _id: 'tr-night', productId: 'night-1', fullName: 'Ewa BRĄZ', size: 'L', barcode: '777', transfer_from: 'P', transfer_to: 'T', blueProcessed: false, date: todayMidnightUtc.toISOString(), dateString: today },
];

const renderWriteOff = () => render(
  <GlobalStateContext.Provider value={{
    user, stateData, users: points,
    fetchState: jest.fn(() => Promise.resolve()),
    fetchUsers: jest.fn(() => Promise.resolve()),
    getFilteredSellingPoints: () => points,
  }}>
    <WriteOff />
  </GlobalStateContext.Provider>
);

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.endsWith('/transfer')) return json(transfers);
    if (url.endsWith('/sales/get-all-sales')) return json([]);
    if (url.endsWith('/exchange')) return json([]);
    return json({});
  });
});

test('wczorajsze nieprzetworzone przepisanie: kurtka wyszarzona z datą, w opcjach bez „Anuluj”', async () => {
  const screen = renderWriteOff();
  const [d, m, y] = [yesterdayDay.slice(8, 10), yesterdayDay.slice(5, 7), yesterdayDay.slice(0, 4)];
  await waitFor(() => expect(screen.getByText(`Przepisano do: Tata (${d}.${m}.${y}) - czeka na uzupełnienie`)).toBeTruthy());
  expect(screen.getByTestId('writeoff-item-old-1').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })]));
  fireEvent.press(screen.getByTestId('writeoff-dots-old-1'));
  await waitFor(() => expect(screen.getByTestId('transfer-previous-day')).toBeTruthy());
  expect(screen.queryByTestId('cancel-transfer')).toBeNull();
});

test('przepisanie z 00:30 w nocy (UTC jeszcze wczoraj) jest dzisiejsze: bez daty w napisie, z „Anuluj przepisanie”', async () => {
  const screen = renderWriteOff();
  await waitFor(() => expect(screen.getByText('Przepisano do: Tata - czeka na uzupełnienie')).toBeTruthy());
  fireEvent.press(screen.getByTestId('writeoff-dots-night-1'));
  await waitFor(() => expect(screen.getByTestId('cancel-transfer')).toBeTruthy());
});
