/**
 * Blokada „jedna osoba na punkcie”: logowanie w GlobalState (bukowski_login).
 *
 * - body loginu zawiera { email, password, deviceId, deviceName } (oba endpointy)
 * - 403 { error: 'SESSION_ACTIVE', session } -> błąd z code='SESSION_ACTIVE' i error.session z backendu
 */
import React, { useContext } from 'react';
import { render, act } from '@testing-library/react-native';
import { GlobalStateProvider, GlobalStateContext } from '../context/GlobalState';

jest.mock('../services/deviceId', () => ({
  getDeviceId: jest.fn(() => Promise.resolve('device-123')),
  getDeviceName: jest.fn(() => 'Android'),
}));

jest.mock('../config/api', () => ({
  getApiUrl: (endpoint) => `http://localhost:3000/api${endpoint}`,
  API_CONFIG: { BASE_URL: 'http://localhost:3000/api', TIMEOUT: 10000 },
}));

// Wyciąga bukowski_login z providera
const renderLogin = () => {
  let context = null;
  const Consumer = () => {
    context = useContext(GlobalStateContext);
    return null;
  };
  render(
    <GlobalStateProvider>
      <Consumer />
    </GlobalStateProvider>
  );
  return () => context;
};

const parseBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('bukowski_login - identyfikator urządzenia i SESSION_ACTIVE', () => {
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };

  beforeEach(() => {
    global.fetch = jest.fn();
    // Logi logowania nie zaśmiecają wyniku testów
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  test('POST /user/login wysyła email, password, deviceId i deviceName', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ _id: 'u1', email: 'punkt@test.pl', role: 'user', accessToken: 'a', refreshToken: 'r' }),
    });
    const getContext = renderLogin();

    await act(async () => {
      await getContext().bukowski_login('punkt@test.pl', 'tajne', null, false);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/user/login',
      expect.objectContaining({ method: 'POST' })
    );
    expect(parseBody(global.fetch)).toEqual({
      email: 'punkt@test.pl',
      password: 'tajne',
      deviceId: 'device-123',
      deviceName: 'Android',
    });
  });

  test('POST /user/admin-login też dostaje deviceId i deviceName', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ requiresVerification: true, userId: 'admin1', email: 'admin@test.pl' }),
    });
    const getContext = renderLogin();

    let result;
    await act(async () => {
      result = await getContext().bukowski_login('admin@test.pl', 'tajne', null, true);
    });

    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:3000/api/user/admin-login');
    expect(parseBody(global.fetch)).toEqual({
      email: 'admin@test.pl',
      password: 'tajne',
      deviceId: 'device-123',
      deviceName: 'Android',
    });
    expect(result).toEqual(expect.objectContaining({ requiresVerification: true }));
  });

  test('403 SESSION_ACTIVE -> błąd z code i szczegółami sesji (error.session)', async () => {
    const session = {
      startedAt: '2026-10-14T07:15:00.000Z',
      lastSeenAt: '2026-10-14T09:58:00.000Z',
      deviceName: 'Android Samsung SM-A525F',
    };
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'SESSION_ACTIVE', message: 'Konto jest już zalogowane', session }),
    });
    const getContext = renderLogin();

    let caught = null;
    await act(async () => {
      try {
        await getContext().bukowski_login('punkt@test.pl', 'tajne', null, false);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).not.toBeNull();
    expect(caught.code).toBe('SESSION_ACTIVE');
    expect(caught.status).toBe(403);
    expect(caught.session).toEqual(session);
  });

  test('403 SESSION_ACTIVE bez session -> error.session = null (ogólny komunikat na ekranie)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'SESSION_ACTIVE', message: 'Konto jest już zalogowane' }),
    });
    const getContext = renderLogin();

    let caught = null;
    await act(async () => {
      try {
        await getContext().bukowski_login('punkt@test.pl', 'tajne', null, false);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught?.code).toBe('SESSION_ACTIVE');
    expect(caught?.session).toBeNull();
  });
});
