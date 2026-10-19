/**
 * Dziennik aktywności w adminie (19.10.2026): lista zdarzeń z serwera z filtrami dnia, rodzaju, telefonu i punktu,
 * szczegóły po dotknięciu wpisu, dociąganie kolejnych stron.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ActivityLogScreen, { buildQuery, formatTime } from '../../app/activity-log';
import tokenService from '../../services/tokenService';

jest.mock('../../services/useLiveRefresh', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() { return React.createElement('Ionicons'); };
});

const FILTERS = { points: ['Nowy Targ'], employees: [{ employeeId: 'emp1', name: 'Helena Brylak', workLocation: 'Nowy Targ' }], devices: [{ deviceId: 'phone-1', name: 'Telefon 1 - Nowy Targ', label: 'Telefon 1 - Nowy Targ', model: 'Android', lastSymbol: 'A', sellingPoint: 'Nowy Targ' }] };
const ITEMS = [
  { _id: 'e1', at: '2026-10-19T09:15:00Z', kind: 'request', action: 'sales.create', label: 'Edycja sprzedaży: Marcin CZARNY 62, cena z 620 zł na 621 zł', symbol: 'A', sellingPoint: 'Nowy Targ', source: 'mobile', deviceLabel: 'Telefon 1 - Nowy Targ', email: 'ania@bukowski.pl', method: 'PATCH', path: '/sales/update-sales/1', status: 200, details: { changes: ['cena z 620 zł na 621 zł'], fields: [{ label: 'gotówka', value: '621 zł' }] } },
  { _id: 'e2', at: '2026-10-19T09:16:00Z', kind: 'screenshot', action: 'screenshot', label: 'Próba zrzutu ekranu', symbol: 'A', sellingPoint: 'Nowy Targ', source: 'mobile', deviceLabel: 'Telefon 1 - Nowy Targ' },
];

const respond = (data, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) });
const logCalls = () => tokenService.authenticatedFetch.mock.calls.map(([url]) => url).filter((url) => url.includes('/activity?'));

beforeEach(() => {
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => {
    if (url.includes('/activity/filters')) return respond(FILTERS);
    return respond({ items: ITEMS, total: 2, page: 1, limit: 60 });
  });
});

test('buildQuery: dzień, rodzaj, telefon, punkt, szukaj, strona', () => {
  const query = buildQuery({ day: 'today', kind: 'screenshot', deviceId: 'phone-1', sellingPoint: 'Nowy Targ', q: ' zrzut ', page: 2 });
  const params = new URLSearchParams(query);
  expect(params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(params.get('from')).toBe(params.get('to'));
  expect(params.get('kind')).toBe('screenshot');
  expect(params.get('deviceId')).toBe('phone-1');
  expect(params.get('sellingPoint')).toBe('Nowy Targ');
  expect(params.get('q')).toBe('zrzut');
  expect(params.get('page')).toBe('2');
  expect(new URLSearchParams(buildQuery({ day: 'all', page: 1 })).has('from')).toBe(false);
  expect(formatTime(null)).toBe('-');
});

test('lista z serwera: wpisy, plakietki, szczegóły po dotknięciu; filtr rodzaju i telefonu zmienia zapytanie', async () => {
  const screen = render(<ActivityLogScreen />);
  await waitFor(() => expect(screen.getByText(/Edycja sprzedaży: Marcin CZARNY 62/)).toBeTruthy());
  expect(screen.getByText('Próba zrzutu ekranu')).toBeTruthy();
  expect(screen.getByText('2 zdarzeń')).toBeTruthy();
  expect(screen.getAllByText('Telefon 1 - Nowy Targ').length).toBeGreaterThan(0);
  expect(logCalls()[0]).toContain('page=1');

  fireEvent.press(screen.getByTestId('activity-e1'));
  expect(screen.getByText('• cena z 620 zł na 621 zł')).toBeTruthy();
  expect(screen.getByText('gotówka')).toBeTruthy();
  expect(screen.getByText('621 zł')).toBeTruthy();
  expect(screen.getByText('A · ania@bukowski.pl')).toBeTruthy();
  expect(screen.getByText('PATCH /sales/update-sales/1')).toBeTruthy();
  expect(screen.getByText('200 (ok)')).toBeTruthy();

  fireEvent.press(screen.getByTestId('pick-kind'));
  fireEvent.press(await screen.findByTestId('option-screenshot'));
  await waitFor(() => expect(logCalls().slice(-1)[0]).toContain('kind=screenshot'));

  fireEvent.press(screen.getByTestId('pick-device'));
  fireEvent.press(await screen.findByTestId('option-phone-1'));
  await waitFor(() => expect(logCalls().slice(-1)[0]).toContain('deviceId=phone-1'));

  fireEvent.press(screen.getByTestId('pick-day'));
  fireEvent.press(await screen.findByTestId('option-week'));
  await waitFor(() => {
    const params = new URLSearchParams(logCalls().slice(-1)[0].split('?')[1]);
    expect(params.get('from')).not.toBe(params.get('to'));
  });
  // wybrane wartości widać w polach; „Wyczyść filtry” wraca do dzisiaj i wszystkiego
  expect(screen.getByText('7 dni')).toBeTruthy();
  expect(screen.getByText('Zrzuty')).toBeTruthy();
  fireEvent.press(screen.getByTestId('reset-filters'));
  await waitFor(() => expect(logCalls().slice(-1)[0]).not.toContain('kind='));
});

test('pusta lista: komunikat; błąd serwera nie wywraca ekranu', async () => {
  tokenService.authenticatedFetch.mockImplementation((url) => (url.includes('/activity/filters') ? respond(FILTERS) : respond({ items: [], total: 0 })));
  const screen = render(<ActivityLogScreen />);
  await waitFor(() => expect(screen.getByText('Brak zdarzeń dla wybranych filtrów')).toBeTruthy());
});

test('Wyczyść dziennik: przycisk aktywny dopiero po wpisaniu WYCZYŚĆ, DELETE z potwierdzeniem', async () => {
  const screen = render(<ActivityLogScreen />);
  await waitFor(() => expect(screen.getByText('2 zdarzeń')).toBeTruthy());
  fireEvent.press(screen.getByTestId('clear-log'));
  fireEvent.press(screen.getByTestId('clear-confirm')); // bez słowa - nic
  expect(tokenService.authenticatedFetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  fireEvent.changeText(screen.getByTestId('clear-word'), 'wyczyść');
  fireEvent.press(screen.getByTestId('clear-confirm'));
  await waitFor(() => {
    const call = tokenService.authenticatedFetch.mock.calls.find(([, options]) => options?.method === 'DELETE');
    expect(call[0]).toContain('/activity');
    expect(JSON.parse(call[1].body)).toEqual({ confirm: 'WYCZYŚĆ' });
  });
});

test('Urządzenia: zmiana nazwy i przypisanie pracownika (PUT)', async () => {
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (options.method === 'PUT') return respond({ device: { ...FILTERS.devices[0], ...JSON.parse(options.body), employeeName: 'Helena Brylak' } });
    if (url.includes('/activity/filters')) return respond(FILTERS);
    return respond({ items: ITEMS, total: 2, page: 1, limit: 60 });
  });
  const screen = render(<ActivityLogScreen />);
  await waitFor(() => expect(screen.getByText('2 zdarzeń')).toBeTruthy());
  fireEvent.press(screen.getByTestId('tab-devices'));
  await waitFor(() => expect(screen.getByTestId('device-phone-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('rename-phone-1'));
  fireEvent.changeText(screen.getByTestId('device-name-input'), 'Kasa 1');
  fireEvent.press(screen.getByTestId('device-name-save'));
  await waitFor(() => expect(tokenService.authenticatedFetch.mock.calls.some(([url, options]) => options?.method === 'PUT' && url.endsWith('/activity/devices/phone-1') && JSON.parse(options.body).name === 'Kasa 1')).toBe(true));
  fireEvent.press(screen.getByTestId('assign-phone-1'));
  fireEvent.press(await screen.findByTestId('option-emp1'));
  await waitFor(() => expect(tokenService.authenticatedFetch.mock.calls.some(([, options]) => options?.method === 'PUT' && JSON.parse(options.body).employeeId === 'emp1')).toBe(true));
  await waitFor(() => expect(screen.getByText('Helena Brylak')).toBeTruthy());
});
