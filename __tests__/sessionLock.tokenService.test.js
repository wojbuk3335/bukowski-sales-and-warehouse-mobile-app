/**
 * Blokada „jedna osoba na punkcie”: obsługa 401 { code: 'SESSION_REVOKED' } w tokenService.
 *
 * - NIE odświeża tokenu (brak wywołania /user/refresh-token), czyści tokeny, woła callback GlobalState
 *   i przekierowuje na /(auth)/sign-in z params { reason: 'SESSION_REVOKED' }
 * - wiele równoległych zapytań -> wylogowanie i przekierowanie wykonane raz
 * - SESSION_REVOKED z /user/refresh-token też kończy sesję
 * - zwykłe 401 bez kodu nie jest traktowane jak zakończona sesja
 */
jest.unmock('../services/tokenService');

import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import tokenService from '../services/tokenService';
import AuthErrorHandler from '../utils/authErrorHandler';

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000/api${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000/api', TIMEOUT: 10000 },
}));

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 401 ? 'Unauthorized' : 'OK',
  json: () => Promise.resolve(body),
  clone() { return this; },
});

const revokedResponse = () => jsonResponse(401, { code: 'SESSION_REVOKED', message: 'Sesja została zakończona.' });

describe('tokenService - SESSION_REVOKED', () => {
  let onSessionRevoked;

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
    onSessionRevoked = jest.fn(() => Promise.resolve());
    tokenService.setSessionRevokedCallback(onSessionRevoked);
    // Stan jak po świeżym logowaniu
    tokenService.sessionRevokedHandled = false;
    tokenService.isLoggingOut = false;
    tokenService.isInitializing = false;
    AuthErrorHandler.isRedirecting = false;
    AuthErrorHandler.lastRedirectTime = 0;
    jest.spyOn(tokenService, 'getAuthHeaders').mockResolvedValue({
      Authorization: 'Bearer stary-token',
      'Content-Type': 'application/json',
    });
    SecureStore.deleteItemAsync.mockClear();
    router.replace.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('401 SESSION_REVOKED: bez odświeżania tokenu, czyści tokeny i przekierowuje z powodem', async () => {
    global.fetch.mockResolvedValueOnce(revokedResponse());

    await expect(tokenService.authenticatedFetch('http://localhost:3000/api/state'))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED', isAuthError: true });

    // Jedno zapytanie - żadnego /user/refresh-token
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:3000/api/state');

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('BukowskiAccessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('BukowskiRefreshToken');
    expect(onSessionRevoked).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/(auth)/sign-in',
      params: { reason: 'SESSION_REVOKED' },
    });
  });

  test('wiele równoległych zapytań z 401 SESSION_REVOKED -> wylogowanie i przekierowanie tylko raz', async () => {
    global.fetch.mockImplementation(() => Promise.resolve(revokedResponse()));

    const results = await Promise.allSettled([
      tokenService.authenticatedFetch('http://localhost:3000/api/state'),
      tokenService.authenticatedFetch('http://localhost:3000/api/user'),
      tokenService.authenticatedFetch('http://localhost:3000/api/excel/goods/get-all-goods'),
    ]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(onSessionRevoked).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/user/refresh-token'))).toBe(false);
  });

  test('po zakończeniu obsługi flaga isLoggingOut wraca do false, a nowe tokeny pozwalają obsłużyć kolejne SESSION_REVOKED', async () => {
    global.fetch.mockResolvedValueOnce(revokedResponse());
    await tokenService.authenticatedFetch('http://localhost:3000/api/state').catch(() => {});
    expect(tokenService.isLoggingOut).toBe(true);

    jest.advanceTimersByTime(600);
    expect(tokenService.isLoggingOut).toBe(false);
    expect(tokenService.sessionRevokedHandled).toBe(true);

    await tokenService.setTokens('nowy-token', 'nowy-refresh'); // nowe logowanie
    expect(tokenService.sessionRevokedHandled).toBe(false);
  });

  test('SESSION_REVOKED z /user/refresh-token też kończy sesję lokalnie', async () => {
    await SecureStore.setItemAsync('BukowskiRefreshToken', 'refresh-1');
    global.fetch
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Token expired' })) // zwykłe 401 -> próba odświeżenia
      .mockResolvedValueOnce(revokedResponse()); // odpowiedź /user/refresh-token

    await expect(tokenService.authenticatedFetch('http://localhost:3000/api/state'))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toBe('http://localhost:3000/api/user/refresh-token');
    expect(onSessionRevoked).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/(auth)/sign-in',
      params: { reason: 'SESSION_REVOKED' },
    });
  });

  test('isSessionRevokedResponse rozpoznaje tylko 401 z code=SESSION_REVOKED', async () => {
    expect(await tokenService.isSessionRevokedResponse(revokedResponse())).toBe(true);
    expect(await tokenService.isSessionRevokedResponse(jsonResponse(401, { message: 'Token expired' }))).toBe(false);
    expect(await tokenService.isSessionRevokedResponse(jsonResponse(403, { code: 'SESSION_REVOKED' }))).toBe(false);
    expect(await tokenService.isSessionRevokedResponse({ status: 401, json: () => Promise.reject(new Error('no body')) })).toBe(false);
    expect(await tokenService.isSessionRevokedResponse(null)).toBe(false);
  });
});
