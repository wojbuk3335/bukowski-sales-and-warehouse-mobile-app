/**
 * Dziennik aktywności po stronie telefonu (19.10.2026): zdarzenia (ekran, zrzut, tło) zbierane w kolejce
 * i wysyłane paczką; bez tokenu / bez internetu zostają w kolejce; po wylogowaniu kolejka czyszczona.
 * Każde zapytanie do API niesie nagłówki X-Device-* (po nich panel rozpoznaje telefon).
 */
/* global jest, describe, test, expect, beforeEach, afterEach */

jest.mock('../services/tokenService', () => ({
  __esModule: true,
  default: {
    isLoggingOut: false,
    getTokens: jest.fn(async () => ({ accessToken: 'tok', refreshToken: 'ref' })),
    authenticatedFetch: jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ saved: 1 }) })),
  },
}));
jest.mock('../config/api', () => ({ getApiUrl: (path) => `http://api${path}`, API_CONFIG: { TIMEOUT: 1000 } }));

const tokenService = require('../services/tokenService').default;
const activity = require('../services/activityLog');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  tokenService.isLoggingOut = false;
  activity.reset();
});
afterEach(() => jest.useRealTimers());

const sentEvents = () => JSON.parse(tokenService.authenticatedFetch.mock.calls[0][1].body).events;

describe('nazwy ekranów', () => {
  test('znane ścieżki po polsku, wyszukiwarka z frazą, nieznane czytelnie', () => {
    expect(activity.screenLabel('/home')).toBe('Sprzedaż');
    expect(activity.screenLabel('/profile')).toBe('Zamówienia');
    expect(activity.screenLabel('/search/kurtka%20ada')).toBe('Wyszukiwarka: kurtka ada');
    expect(activity.screenLabel('/bags-subcategory-list')).toBe('Podkategorie');
    expect(activity.screenLabel('/nowy-ekran')).toBe('Nowy ekran');
    expect(activity.screenLabel('/')).toBe('Start');
  });
});

describe('kolejka i wysyłka', () => {
  test('ekran + zrzut wysłane jedną paczką po 4 s; ten sam ekran pod rząd raz', async () => {
    activity.logScreen('/home');
    activity.logScreen('/home');
    activity.logEvent('screenshot', 'screenshot', 'Próba zrzutu ekranu', { screen: '/home' });
    expect(activity.pendingCount()).toBe(2);
    expect(tokenService.authenticatedFetch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(4000);
    expect(tokenService.authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(tokenService.authenticatedFetch.mock.calls[0][0]).toBe('http://api/activity/events');
    expect(sentEvents().map((event) => [event.kind, event.action, event.label])).toEqual([
      ['screen', '/home', 'Ekran: Sprzedaż'],
      ['screenshot', 'screenshot', 'Próba zrzutu ekranu'],
    ]);
    expect(sentEvents()[1].details).toEqual({ screen: '/home' });
    expect(activity.pendingCount()).toBe(0);
  });

  test('20 zdarzeń wysyła od razu', async () => {
    for (let i = 0; i < 20; i += 1) activity.logScreen(`/s${i}`);
    await jest.advanceTimersByTimeAsync(100); // wysyłka startuje od razu, bez czekania na 4 s
    expect(tokenService.authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  test('bez tokenu (ekran logowania) zdarzenia czekają; po zalogowaniu wychodzą', async () => {
    tokenService.getTokens.mockResolvedValueOnce({ accessToken: null, refreshToken: null });
    activity.logScreen('/sign-in');
    await jest.advanceTimersByTimeAsync(4000);
    expect(tokenService.authenticatedFetch).not.toHaveBeenCalled();
    expect(activity.pendingCount()).toBe(1);
    activity.logEvent('app', 'app.start', 'Uruchomienie aplikacji');
    await jest.advanceTimersByTimeAsync(4000);
    expect(tokenService.authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(sentEvents()).toHaveLength(2);
  });

  test('błąd sieci: paczka wraca do kolejki i idzie przy kolejnej próbie', async () => {
    tokenService.authenticatedFetch.mockRejectedValueOnce(new Error('Network request failed'));
    activity.logScreen('/home');
    await jest.advanceTimersByTimeAsync(4000);
    expect(activity.pendingCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(4000);
    expect(tokenService.authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(activity.pendingCount()).toBe(0);
  });

  test('reset po wylogowaniu czyści kolejkę i pozwala znów zgłosić ten sam ekran', () => {
    activity.logScreen('/home');
    activity.reset();
    expect(activity.pendingCount()).toBe(0);
    activity.logScreen('/home');
    expect(activity.pendingCount()).toBe(1);
  });
});

describe('nagłówki telefonu w zapytaniach', () => {
  test('getAuthHeaders dodaje X-Device-Id / X-Device-Name / X-Platform', async () => {
    jest.resetModules();
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: jest.fn(async (key) => (key === 'BukowskiDeviceId' ? 'phone-abc' : null)),
      setItemAsync: jest.fn(async () => {}),
      deleteItemAsync: jest.fn(async () => {}),
    }));
    jest.doMock('../config/api', () => ({ getApiUrl: (path) => `http://api${path}`, API_CONFIG: { TIMEOUT: 1000 } }));
    const realTokenService = jest.requireActual('../services/tokenService').default; // bez mocka z góry pliku
    const headers = await realTokenService.getAuthHeaders();
    expect(headers['X-Device-Id']).toBe('phone-abc');
    expect(headers['X-Device-Name']).toMatch(/Android|iPhone/);
    expect(headers['X-Platform']).toMatch(/android|ios/);
    expect(headers['Content-Type']).toBe('application/json');
  });
});
