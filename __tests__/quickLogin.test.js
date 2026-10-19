/**
 * Szybkie logowanie (19.10.2026): wzór / PIN / odcisk zamiast hasła. Bez blokady ekranu - niedostępne;
 * bez modułu natywnego (stara wersja po OTA) - po cichu wyłączone; odcięty telefon - klucz usunięty.
 */
/* global jest, describe, test, expect, beforeEach */

const store = new Map();
const mockSecureStore = () => jest.doMock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  setItemAsync: jest.fn(async (key, value) => { store.set(key, value); }),
  deleteItemAsync: jest.fn(async (key) => { store.delete(key); }),
}));
const auth = {
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(async () => 1),
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
};
const authenticatedFetch = jest.fn();

const load = ({ native = true } = {}) => {
  jest.resetModules();
  mockSecureStore();
  jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => (native ? {} : null) }));
  jest.doMock('expo-local-authentication', () => auth);
  jest.doMock('../config/api', () => ({ getApiUrl: (path) => `http://api${path}`, API_CONFIG: { TIMEOUT: 1000 } }));
  jest.doMock('../services/tokenService', () => ({ __esModule: true, default: { authenticatedFetch } }));
  jest.doMock('../services/deviceId', () => ({ getDeviceId: async () => 'phone-1', getDeviceName: () => 'Android Samsung' }));
  return require('../services/quickLogin').default;
};

const respond = (status, data) => ({ ok: status < 400, status, json: async () => data });

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  auth.getEnrolledLevelAsync.mockResolvedValue(1);
  auth.authenticateAsync.mockResolvedValue({ success: true });
  global.fetch = jest.fn();
});

describe('dostępność', () => {
  test('blokada ekranu ustawiona -> ok; bez blokady -> no-lock; bez modułu natywnego -> unsupported', async () => {
    expect(await load().availability()).toBe('ok');
    auth.getEnrolledLevelAsync.mockResolvedValue(0);
    expect(await load().availability()).toBe('no-lock');
    expect(await load({ native: false }).availability()).toBe('unsupported');
    expect(await load({ native: false }).unlock()).toBe(false);
  });
});

describe('włączenie i logowanie', () => {
  test('enable: klucz z serwera trafia do SecureStore; login: odblokowanie -> quick-login z kluczem', async () => {
    const quick = load();
    authenticatedFetch.mockResolvedValue(respond(201, { secret: 's'.repeat(43), userId: 'u1', email: 'parzygnat@wp.pl', symbol: 'P', role: 'user', sellingPoint: 'Parzygnat' }));
    await quick.enable({ userId: 'u1' });
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body)).toEqual({ deviceId: 'phone-1', deviceName: 'Android Samsung' });
    expect(await quick.getSaved()).toMatchObject({ userId: 'u1', symbol: 'P', sellingPoint: 'Parzygnat' });
    expect(await quick.shouldOffer({ userId: 'u1' })).toBe(false); // już włączone dla tego konta

    global.fetch.mockResolvedValue(respond(200, { success: true, accessToken: 'a', refreshToken: 'r', role: 'user' }));
    const data = await quick.login();
    expect(data.accessToken).toBe('a');
    expect(auth.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false, promptMessage: 'Zaloguj jako P' }));
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://api/user/quick-login');
    expect(JSON.parse(options.body)).toEqual({ userId: 'u1', deviceId: 'phone-1', secret: 's'.repeat(43), deviceName: 'Android Samsung' });
  });

  test('anulowane odblokowanie: CANCELLED bez zapytania; odcięty telefon: klucz usunięty; punkt zajęty: SESSION_ACTIVE', async () => {
    const quick = load();
    store.set('BukowskiQuickLogin', JSON.stringify({ userId: 'u1', secret: 'x'.repeat(43), symbol: 'P' }));
    auth.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await expect(quick.login()).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch.mockResolvedValueOnce(respond(403, { error: 'SESSION_ACTIVE', message: 'zajęte', session: { deviceName: 'iPhone' } }));
    await expect(quick.login()).rejects.toMatchObject({ code: 'SESSION_ACTIVE', session: { deviceName: 'iPhone' } });
    expect(await quick.getSaved()).not.toBeNull();

    global.fetch.mockResolvedValueOnce(respond(401, { code: 'TRUSTED_DEVICE_REJECTED', message: 'odcięty' }));
    await expect(quick.login()).rejects.toMatchObject({ code: 'TRUSTED_DEVICE_REJECTED' });
    expect(await quick.getSaved()).toBeNull();
    await expect(quick.login()).rejects.toMatchObject({ code: 'NOT_ENABLED' });
  });

  test('forget: wyłączenie na serwerze kluczem i usunięcie z telefonu; „Nie teraz” zapamiętane', async () => {
    const quick = load();
    store.set('BukowskiQuickLogin', JSON.stringify({ userId: 'u1', secret: 'x'.repeat(43) }));
    global.fetch.mockResolvedValue(respond(200, { success: true }));
    await quick.forget();
    expect(global.fetch.mock.calls[0][0]).toBe('http://api/user/trusted-device/forget');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ userId: 'u1', deviceId: 'phone-1', secret: 'x'.repeat(43) });
    expect(await quick.getSaved()).toBeNull();

    expect(await quick.shouldOffer({ userId: 'u2' })).toBe(true);
    await quick.rememberDeclined({ userId: 'u2' });
    expect(await quick.shouldOffer({ userId: 'u2' })).toBe(false);
  });
});
