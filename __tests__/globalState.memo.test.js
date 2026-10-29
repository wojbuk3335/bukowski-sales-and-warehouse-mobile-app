import React, { useContext, useState } from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { GlobalStateProvider, GlobalStateContext } from '../context/GlobalState';
import tokenService from '../services/tokenService';

// Stan globalny (29.10.2026): każda zmiana w kontekście przerysowuje wszystkie zamontowane ekrany, więc
// (1) słowniki identyczne z poprzednimi nie są zapisywane na nowo, (2) funkcje kontekstu mają stałą tożsamość,
// (3) wartość kontekstu nie zmienia się, gdy dostawca renderuje się bez zmiany danych.

const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });

let renders = 0;
let ctx = null;
// React.memo: dziecko przerysowuje się tylko, gdy zmieni się wartość kontekstu (nie przez render rodzica)
const Consumer = React.memo(function Consumer() {
  ctx = useContext(GlobalStateContext);
  renders += 1;
  return <Text testID="count">{String((ctx.stateData || []).length)}</Text>;
});

let rerenderShell = null;
const Shell = () => {
  const [tick, setTick] = useState(0);
  rerenderShell = () => setTick((t) => t + 1);
  return (
    <GlobalStateProvider key="provider">
      <Consumer />
      <Text>{tick}</Text>
    </GlobalStateProvider>
  );
};

const STATE_A = [{ _id: 's1', barcode: '111', fullName: 'Ada CZERWONY', size: 'XL' }, { _id: 's2', barcode: '222', fullName: 'Bella CZARNY', size: 'M' }];
const STATE_B = [{ _id: 's1', barcode: '111', fullName: 'Ada CZERWONY', size: 'XL' }, { _id: 's2', barcode: '222', fullName: 'Bella CZARNY', size: 'L' }]; // zmieniony rozmiar

const serveState = (data) => tokenService.authenticatedFetch.mockImplementation((url) => (
  String(url).includes('/state') ? response(data) : response({ sizes: [], colors: [], goods: [], stocks: [], users: [] })
));

beforeEach(() => {
  renders = 0;
  ctx = null;
  tokenService.authenticatedFetch.mockReset();
  serveState(STATE_A);
});

describe('Stan globalny: bez zbędnych przerysowań', () => {
  test('identyczne dane z serwera nie przerysowują konsumentów; zmienione - tak', async () => {
    const screen = render(<Shell />);
    const afterMount = renders;

    await act(async () => { await ctx.fetchState(); });
    expect(screen.getByTestId('count').props.children).toBe('2');
    const afterFirst = renders;
    expect(afterFirst).toBe(afterMount + 1);
    const firstRef = ctx.stateData;

    await act(async () => { await ctx.fetchState(); }); // ten sam stan z serwera (nowa tablica, ta sama treść)
    await act(async () => { await ctx.fetchSizes(); await ctx.fetchColors(); await ctx.fetchGoods(); }); // puste słowniki = bez zmian
    expect(renders).toBe(afterFirst);
    expect(ctx.stateData).toBe(firstRef); // ta sama referencja - ekrany z useMemo/useEffect po stateData też nic nie liczą

    serveState(STATE_B);
    await act(async () => { await ctx.fetchState(); });
    expect(renders).toBe(afterFirst + 1);
    expect(ctx.stateData[1].size).toBe('L');
  });

  test('funkcje kontekstu mają stałą tożsamość między renderami', async () => {
    render(<Shell />);
    const before = { fetchState: ctx.fetchState, fetchGoods: ctx.fetchGoods, logout: ctx.logout, setUser: ctx.setUser, bukowski_login: ctx.bukowski_login };

    await act(async () => { await ctx.fetchState(); }); // zmiana danych → nowy render dostawcy
    expect(ctx.fetchState).toBe(before.fetchState);
    expect(ctx.fetchGoods).toBe(before.fetchGoods);
    expect(ctx.logout).toBe(before.logout);
    expect(ctx.setUser).toBe(before.setUser);
    expect(ctx.bukowski_login).toBe(before.bukowski_login);
  });

  test('render rodzica bez zmiany danych nie zmienia wartości kontekstu', async () => {
    render(<Shell />);
    const valueBefore = ctx;
    const rendersBefore = renders;

    await act(async () => { rerenderShell(); });
    await act(async () => { rerenderShell(); });

    expect(ctx).toBe(valueBefore);
    expect(renders).toBe(rendersBefore);
  });
});
