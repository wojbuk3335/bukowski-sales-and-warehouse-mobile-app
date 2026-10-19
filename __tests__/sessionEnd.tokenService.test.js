/**
 * Blokada „jedna osoba na punkcie”: koniec sesji zgłaszany serwerowi, gdy token dostępu już wygasł.
 *
 * Błąd sprzed poprawki: auto-wylogowanie po 12 h najpierw kasowało tokeny, a dopiero potem próbowało
 * powiadomić serwer - nie było już czym, więc punkt zostawał zablokowany („Zalogowany … ostatnio 13 godz. temu”).
 *
 * - performAutoLogout: NAJPIERW POST /user/session/end (wygasły token + refreshToken), POTEM czyszczenie tokenów
 * - logout() z wygasłym tokenem -> /user/session/end (bo /user/logout odrzuciłby go 401)
 * - logout() z ważnym tokenem -> /user/logout jak dotąd
 */
jest.unmock('../services/tokenService');

import * as SecureStore from 'expo-secure-store';
import tokenService from '../services/tokenService';

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000/api${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000/api', TIMEOUT: 10000 },
}));

// Token JWT (podpis nieistotny - telefon go nie sprawdza) z zadaną datą ważności
const makeToken = (expOffsetSeconds) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 'u1', sid: 'sesja-1', exp })}.podpis`;
};

const okResponse = () => ({ ok: true, status: 200, json: () => Promise.resolve({ success: true }), clone() { return this; } });

describe('tokenService - koniec sesji punktu wygasłym tokenem', () => {
  beforeEach(async () => {
    global.fetch = jest.fn(() => Promise.resolve(okResponse()));
    tokenService.isLoggingOut = false;
    tokenService.onAutoLogout = null;
    SecureStore.deleteItemAsync.mockClear();
    await SecureStore.setItemAsync('BukowskiRefreshToken', 'refresh-1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('auto-wylogowanie po wygaśnięciu tokenu: najpierw /user/session/end, potem kasowanie tokenów', async () => {
    const expired = makeToken(-60);
    await SecureStore.setItemAsync('BukowskiAccessToken', expired);
    const onAutoLogout = jest.fn();
    tokenService.setAutoLogoutCallback(onAutoLogout);

    await tokenService.performAutoLogout();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/user/session/end');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Bearer ${expired}`);
    expect(JSON.parse(options.body)).toEqual({ refreshToken: 'refresh-1' });

    // serwer powiadomiony ZANIM tokeny zniknęły z telefonu
    const fetchOrder = global.fetch.mock.invocationCallOrder[0];
    const clearOrder = Math.min(...SecureStore.deleteItemAsync.mock.invocationCallOrder);
    expect(fetchOrder).toBeLessThan(clearOrder);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('BukowskiAccessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('BukowskiRefreshToken');
    expect(onAutoLogout).toHaveBeenCalledTimes(1);
  });

  test('błąd sieci przy /user/session/end nie blokuje lokalnego wylogowania', async () => {
    await SecureStore.setItemAsync('BukowskiAccessToken', makeToken(-60));
    global.fetch.mockRejectedValueOnce(new Error('offline'));

    await tokenService.performAutoLogout();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('BukowskiAccessToken');
    expect(tokenService.isLoggingOut).toBe(false);
  });

  test('logout() z wygasłym tokenem idzie przez /user/session/end, a z ważnym przez /user/logout', async () => {
    await SecureStore.setItemAsync('BukowskiAccessToken', makeToken(-60));
    await tokenService.logout();
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:3000/api/user/session/end');

    global.fetch.mockClear();
    await SecureStore.setItemAsync('BukowskiAccessToken', makeToken(60 * 60));
    await SecureStore.setItemAsync('BukowskiRefreshToken', 'refresh-2');
    await tokenService.logout();
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:3000/api/user/logout');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ refreshToken: 'refresh-2' });
  });
});
