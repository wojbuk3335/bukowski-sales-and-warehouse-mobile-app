import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Historia stronami (29.10.2026): ekran pobiera 50 wpisów naraz, dociąga kolejne przy przewijaniu,
// a wyszukiwanie i filtry wysyła do serwera - wcześniej cała kolekcja szła na telefon i zamykała aplikację.

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() { return React.createElement('Ionicons'); };
});
jest.mock('../../services/tokenService', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('../../services/appAlert', () => ({ appAlert: jest.fn() }));

import History from '../../app/history';
import tokenService from '../../services/tokenService';
import { appAlert } from '../../services/appAlert';

const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
const TOTAL = 120;
const PAGE = 50;

const row = (i) => ({
  _id: `h_${i}`,
  collectionName: 'Sales',
  operation: 'Sprzedaż',
  from: 'P',
  to: '-',
  product: `Produkt ${String(i).padStart(3, '0')}`,
  timestamp: new Date(Date.now() - i * 60000).toISOString(),
  userloggedinId: { _id: 'u_p', email: 'p@test.pl', symbol: 'P' },
});
const pageOf = (page, total = TOTAL) => {
  const start = (page - 1) * PAGE;
  const history = Array.from({ length: Math.max(0, Math.min(PAGE, total - start)) }, (_, k) => row(start + k));
  return { history, page, limit: PAGE, total, hasMore: page * PAGE < total };
};
const filters = { collections: ['Sales'], operations: ['Sprzedaż'], from: ['P'], to: [], users: [{ _id: 'u_p', email: 'p@test.pl', symbol: 'P' }] };

const params = (url) => Object.fromEntries(new URL(String(url)).searchParams.entries());
const historyCalls = () => tokenService.authenticatedFetch.mock.calls.map(([url]) => String(url)).filter((u) => u.includes('/history?'));

const mockServer = () => {
  tokenService.authenticatedFetch.mockImplementation((url) => {
    const text = String(url);
    if (text.includes('/history/filters')) return json(filters);
    if (text.includes('/history?')) {
      const q = params(text);
      if (q.q) return json({ ...pageOf(1, 7), history: [{ ...row(0), product: `Znaleziono: ${q.q}` }] });
      return json(pageOf(Number(q.page) || 1));
    }
    return json({});
  });
};

beforeEach(() => {
  appAlert.mockReset();
  tokenService.authenticatedFetch.mockReset();
  mockServer();
});

describe('Historia stronami', () => {
  test('pierwsza strona po 50 wpisów z serwera, licznik i filtry osobnym zapytaniem', async () => {
    const screen = render(<History />);
    await screen.findByText('Produkt 000', {}, { timeout: 5000 });

    expect(params(historyCalls()[0])).toMatchObject({ page: '1', limit: '50' });
    expect(tokenService.authenticatedFetch.mock.calls.some(([url]) => String(url).endsWith('/history/filters'))).toBe(true);
    expect(screen.getByText('120 rekordów (pokazano 50)')).toBeTruthy();
    expect(screen.queryByText('Produkt 050')).toBeNull(); // druga strona jeszcze nie pobrana
    expect(screen.getAllByText('P').length).toBeGreaterThan(0); // użytkownik: symbol punktu (backend nie zwraca username)
    expect(appAlert).not.toHaveBeenCalled();
  });

  // Lista jest wirtualizowana (w teście rysuje tylko pierwsze wiersze), więc dociągnięte strony sprawdzamy
  // po liczniku „pokazano” i po danych przekazanych do listy, nie po tekście 50. wiersza
  const listData = (screen) => screen.getByTestId('history-list').props.data;

  test('koniec listy dociąga kolejną stronę i dokleja wpisy', async () => {
    const screen = render(<History />);
    await screen.findByText('Produkt 000', {}, { timeout: 5000 });

    fireEvent(screen.getByTestId('history-list'), 'onEndReached');
    await screen.findByText('120 rekordów (pokazano 100)', {}, { timeout: 5000 });

    expect(params(historyCalls()[1])).toMatchObject({ page: '2', limit: '50' });
    expect(listData(screen).map((r) => r.product)).toEqual(Array.from({ length: 100 }, (_, i) => row(i).product)); // strona 1 + 2, bez dubli

    // ostatnia strona: potem koniec listy już nic nie pobiera
    fireEvent(screen.getByTestId('history-list'), 'onEndReached');
    await screen.findByText('120 rekordów', {}, { timeout: 5000 });
    fireEvent(screen.getByTestId('history-list'), 'onEndReached');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(historyCalls()).toHaveLength(3);
  });

  test('wyszukiwanie idzie do serwera (po chwili od ostatniej litery) i zaczyna od pierwszej strony', async () => {
    const screen = render(<History />);
    await screen.findByText('Produkt 000', {}, { timeout: 5000 });
    fireEvent(screen.getByTestId('history-list'), 'onEndReached');
    await screen.findByText('120 rekordów (pokazano 100)', {}, { timeout: 5000 });

    const input = screen.getByPlaceholderText('Szukaj w historii...');
    fireEvent.changeText(input, 'Ad');
    fireEvent.changeText(input, 'Ada');
    await screen.findByText('Znaleziono: Ada', {}, { timeout: 5000 });

    const searchCalls = historyCalls().map(params).filter((p) => p.q);
    expect(searchCalls).toEqual([expect.objectContaining({ q: 'Ada', page: '1' })]); // jedno zapytanie, nie po każdej literze
    expect(listData(screen)).toHaveLength(1); // wynik zastąpił poprzednie strony
    expect(screen.getByText('7 rekordów (pokazano 1)')).toBeTruthy();
  });

  test('filtr użytkownika wysyła identyfikator do serwera', async () => {
    const screen = render(<History />);
    await screen.findByText('Produkt 000', {}, { timeout: 5000 });

    fireEvent.press(screen.getByText('Filtry'));
    fireEvent.press(await screen.findByText('P (p@test.pl)'));
    fireEvent.press(screen.getByText('Zastosuj filtry'));

    await waitFor(() => expect(historyCalls().map(params).some((p) => p.user === 'u_p' && p.page === '1')).toBe(true));
    expect(screen.getByText('Filtry aktywne')).toBeTruthy();
  });

  test('błąd serwera: komunikat zamiast zawieszenia', async () => {
    tokenService.authenticatedFetch.mockImplementation((url) => {
      if (String(url).includes('/history?')) return Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('html')) });
      return json(filters);
    });
    render(<History />);
    await waitFor(() => expect(appAlert).toHaveBeenCalledWith('Błąd', 'Serwer chwilowo nie odpowiada (błąd 502) - spróbuj za chwilę.'));
  });
});
