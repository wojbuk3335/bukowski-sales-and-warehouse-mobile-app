import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// „Gdzie jest kurtka” (25.10.2026): czekająca korekta pokazuje, w których punktach sztuka jest na stanie,
// „Wskaż produkt” jest głównym przyciskiem, a „Rozwiązano” / „Zignoruj” ostrzega, gdy kurtka gdzieś jest.

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

import CorrectionsList from '../../app/corrections-list';
import { GlobalStateContext } from '../../context/GlobalState';
import tokenService from '../../services/tokenService';
import { appAlert } from '../../services/appAlert';

const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
const pending = (extra) => ({
  _id: 'cor_1', status: 'PENDING', attemptedOperation: 'SALE', errorType: 'MISSING_IN_STATE', fullName: 'Ada CZERWONY', size: 'XL',
  sellingPoint: 'Tata', symbol: 'T', barcode: '0010701300002', createdAt: new Date().toISOString(), transactionId: 'tx_1', ...extra,
});

const renderList = (corrections) => {
  tokenService.authenticatedFetch.mockImplementation((url, options = {}) => {
    if (url.includes('/corrections') && !options.method) return json(corrections);
    if (url.includes('/state')) return json([]);
    return json({});
  });
  return render(
    <GlobalStateContext.Provider value={{ user: { email: 'admin@test.com' } }}>
      <CorrectionsList />
    </GlobalStateContext.Provider>
  );
};
const stateCalls = () => tokenService.authenticatedFetch.mock.calls.filter(([url]) => String(url).includes('/state'));
const putCalls = () => tokenService.authenticatedFetch.mock.calls.filter(([, o]) => o?.method === 'PUT');

beforeEach(() => {
  appAlert.mockReset();
  tokenService.authenticatedFetch.mockReset();
});

describe('Korekty w telefonie: gdzie jest kurtka', () => {
  test('„Jest na stanie: P (2 szt.), T (1 szt.)” zielone, „Nie ma na żadnym stanie” czerwone; przycisk „Wskaż produkt”', async () => {
    const screen = renderList([
      pending({ stockLocations: [{ symbol: 'P', count: 2 }, { symbol: 'T', count: 1 }] }),
      pending({ _id: 'cor_2', fullName: 'Ewa BRĄZ', stockLocations: [] }),
    ]);
    const hint = await screen.findByTestId('stock-hint-cor_1', {}, { timeout: 5000 });
    expect(hint.props.children).toBe('Jest na stanie: P (2 szt.), T (1 szt.)');
    expect(hint.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#16A34A' })]));
    const nowhere = screen.getByTestId('stock-hint-cor_2');
    expect(nowhere.props.children).toBe('Nie ma na żadnym stanie');
    expect(nowhere.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#EF4444' })]));
    expect(screen.getAllByText('Wskaż produkt')).toHaveLength(2);
  });

  test('„Rozwiązano”, gdy kurtka jest na stanie → pytanie; „Wskaż produkt” szuka sztuki, nic nie zapisuje', async () => {
    const screen = renderList([pending({ stockLocations: [{ symbol: 'P', count: 1 }] })]);
    await screen.findByTestId('stock-hint-cor_1', {}, { timeout: 5000 });
    fireEvent.press(screen.getByText('Rozwiązano'));

    const call = appAlert.mock.calls.find(([title]) => title === 'Kurtka jest na stanie');
    expect(call).toBeTruthy();
    expect(call[1]).toBe('Ta kurtka jest na stanie: P (1 szt.). Wskazać ją zamiast zamykać korektę?');
    expect(call[2].map((b) => b.text)).toEqual(['Anuluj', 'Zamknij mimo to', 'Wskaż produkt']);
    expect(screen.queryByText(/Dlaczego/)).toBeNull(); // okienko powodu jeszcze nie otwarte

    await act(async () => { call[2].find((b) => b.text === 'Wskaż produkt').onPress(); });
    await waitFor(() => expect(stateCalls().length).toBeGreaterThan(0));
    expect(putCalls()).toHaveLength(0);
  });

  test('„Zamknij mimo to” → okienko powodu; bez kurtki na stanie od razu okienko powodu', async () => {
    const screen = renderList([pending({ stockLocations: [{ symbol: 'P', count: 1 }] }), pending({ _id: 'cor_2', fullName: 'Ewa BRĄZ', stockLocations: [] })]);
    await screen.findByTestId('stock-hint-cor_1', {}, { timeout: 5000 });
    fireEvent.press(screen.getAllByText('Zignoruj')[0]);
    const call = appAlert.mock.calls.find(([title]) => title === 'Kurtka jest na stanie');
    await act(async () => { call[2].find((b) => b.text === 'Zamknij mimo to').onPress(); });
    await waitFor(() => expect(screen.getByText(/Dlaczego/)).toBeTruthy());

    appAlert.mockReset();
    fireEvent.press(screen.getAllByText('Rozwiązano')[1]);
    expect(appAlert.mock.calls.some(([title]) => title === 'Kurtka jest na stanie')).toBe(false);
  });
});
