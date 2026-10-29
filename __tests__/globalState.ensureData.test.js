import React, { useContext } from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { GlobalStateProvider, GlobalStateContext, DICTIONARY_MAX_AGE_MS, STATE_MAX_AGE_MS } from '../context/GlobalState';
import tokenService from '../services/tokenService';

// ensureData (29.10.2026): zakładki przy wejściu proszą o zbiory z kontekstu zamiast strzelać salwą fetchX().
// Świeży zbiór nie idzie do serwera, równoległe prośby dzielą jedno zapytanie, nieudane pobranie nie liczy się
// jako świeże, a wylogowanie kasuje wszystko.

const response = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
const BODY = {
  '/state': [{ _id: 's1', barcode: '111' }],
  '/excel/size/get-all-sizes': { sizes: [{ Roz_Kod: '001', Roz_Opis: 'S' }] },
  '/excel/color/get-all-colors': { colors: [{ Kol_Kod: '01', Kol_Opis: 'CZARNY' }] },
  '/excel/goods/get-all-goods': { goods: [{ _id: 'g1', fullName: 'Ada CZARNY' }] },
  '/excel/stock/get-all-stocks': { stocks: [{ Tow_Kod: '001', Tow_Opis: 'Ada' }] },
  '/user': [{ _id: 'u1', symbol: 'P', role: 'user', location: 'Zakopane', sellingPoint: 'Parzygnat' }],
  '/excel/bags/get-all-bags': { bags: [] },
  '/excel/wallets/get-all-wallets': { wallets: [] },
};
const endpointOf = (url) => Object.keys(BODY).find((endpoint) => String(url).endsWith(endpoint));
const calls = (endpoint) => tokenService.authenticatedFetch.mock.calls.filter(([url]) => String(url).endsWith(endpoint)).length;

let ctx = null;
const Consumer = () => { ctx = useContext(GlobalStateContext); return <Text>{ctx.sizes.length}</Text>; };
const renderProvider = () => render(<GlobalStateProvider><Consumer /></GlobalStateProvider>);

beforeEach(() => {
  ctx = null;
  tokenService.authenticatedFetch.mockReset();
  tokenService.authenticatedFetch.mockImplementation((url) => response(BODY[endpointOf(url)] ?? {}));
});

describe('ensureData: pobieraj tylko to, czego brakuje', () => {
  test('pierwsze wejście pobiera, drugie (dane świeże) nie wysyła nic; limity: słowniki 5 min, stan 30 s', async () => {
    renderProvider();
    const keys = ['sizes', 'colors', 'goods', 'stocks', 'state', 'users'];

    let requested;
    await act(async () => { requested = await ctx.ensureData(keys); });
    expect(requested.sort()).toEqual([...keys].sort());
    expect(calls('/state')).toBe(1);
    expect(calls('/excel/goods/get-all-goods')).toBe(1);
    expect(ctx.sizes).toHaveLength(1);
    expect(ctx.isDataFresh(keys)).toBe(true);

    await act(async () => { requested = await ctx.ensureData(keys); });
    expect(requested).toEqual([]);
    expect(tokenService.authenticatedFetch).toHaveBeenCalledTimes(keys.length); // nic nowego

    // po upływie limitu stan jest nieświeży, słowniki nadal świeże
    const realNow = Date.now;
    Date.now = () => realNow() + STATE_MAX_AGE_MS + 1000;
    try {
      expect(ctx.isDataFresh(['state'])).toBe(false);
      expect(ctx.isDataFresh(['sizes', 'goods'])).toBe(true);
      await act(async () => { requested = await ctx.ensureData(keys); });
      expect(requested).toEqual(['state']);
      Date.now = () => realNow() + DICTIONARY_MAX_AGE_MS + 1000;
      expect(ctx.isDataFresh(['sizes'])).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test('równoległe prośby o ten sam zbiór dzielą jedno zapytanie; fetchX() „na siłę” nadal pobiera', async () => {
    renderProvider();
    await act(async () => {
      await Promise.all([ctx.ensureData(['goods', 'sizes']), ctx.ensureData(['goods']), ctx.ensureData(['sizes', 'goods'])]);
    });
    expect(calls('/excel/goods/get-all-goods')).toBe(1);
    expect(calls('/excel/size/get-all-sizes')).toBe(1);

    await act(async () => { await ctx.fetchGoods(); }); // np. pull-to-refresh
    expect(calls('/excel/goods/get-all-goods')).toBe(2);
  });

  test('nieudane pobranie nie liczy się jako świeże - następne wejście próbuje ponownie', async () => {
    renderProvider();
    tokenService.authenticatedFetch.mockImplementation((url) => (
      String(url).endsWith('/excel/size/get-all-sizes')
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
        : response(BODY[endpointOf(url)] ?? {})
    ));
    await act(async () => { await ctx.ensureData(['sizes', 'colors']); });
    expect(ctx.isDataFresh(['colors'])).toBe(true);
    expect(ctx.isDataFresh(['sizes'])).toBe(false);

    tokenService.authenticatedFetch.mockImplementation((url) => response(BODY[endpointOf(url)] ?? {}));
    let requested;
    await act(async () => { requested = await ctx.ensureData(['sizes', 'colors']); });
    expect(requested).toEqual(['sizes']);
    expect(ctx.sizes).toHaveLength(1);
  });

  test('wylogowanie kasuje świeżość - po ponownym logowaniu wszystko pobierane od nowa', async () => {
    renderProvider();
    await act(async () => { await ctx.ensureData(['goods']); });
    expect(ctx.isDataFresh(['goods'])).toBe(true);

    await act(async () => { await ctx.logout(); });
    expect(ctx.isDataFresh(['goods'])).toBe(false);
  });
});
