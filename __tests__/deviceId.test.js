/**
 * Blokada „jedna osoba na punkcie”: identyfikator telefonu (services/deviceId).
 *
 * - getDeviceId zwraca ten sam UUID przy kolejnych wywołaniach i zapisuje go raz w SecureStore
 * - po „restarcie aplikacji” (nowy rejestr modułów) odczytuje identyfikator zapisany w SecureStore
 * - getDeviceName: iPhone / Android (+ marka i model, gdy Platform.constants je ma)
 */

const DEVICE_ID_KEY = 'BukowskiDeviceId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Świeży rejestr modułów = świeży cache w deviceId.js i nowy (pusty) mock SecureStore z jest-setup
const loadFresh = () => {
  jest.resetModules();
  const SecureStore = require('expo-secure-store');
  const deviceId = require('../services/deviceId');
  return { SecureStore, ...deviceId };
};

describe('services/deviceId - getDeviceId', () => {
  test('generuje UUID raz i zwraca ten sam identyfikator przy kolejnych wywołaniach', async () => {
    const { SecureStore, getDeviceId } = loadFresh();

    const first = await getDeviceId();
    const second = await getDeviceId();
    const third = await getDeviceId();

    expect(first).toMatch(UUID_RE);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DEVICE_ID_KEY, first);
  });

  test('równoległe wywołania dostają ten sam identyfikator (jeden zapis)', async () => {
    const { SecureStore, getDeviceId } = loadFresh();

    const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()]);

    expect(new Set(ids).size).toBe(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  test('po ponownym uruchomieniu aplikacji odczytuje identyfikator zapisany w SecureStore', async () => {
    const { SecureStore, getDeviceId } = loadFresh();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, 'zapisany-wczesniej-id');
    SecureStore.setItemAsync.mockClear();

    const id = await getDeviceId();

    expect(id).toBe('zapisany-wczesniej-id');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('gdy SecureStore nie działa, logowanie dostaje tymczasowy identyfikator zamiast błędu', async () => {
    const { SecureStore, getDeviceId } = loadFresh();
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('SecureStore unavailable'));

    const id = await getDeviceId();

    expect(id).toMatch(UUID_RE);
    expect(await getDeviceId()).toBe(id);
  });
});

describe('services/deviceId - getDeviceName', () => {
  // Platform z tego samego rejestru modułów, z którego korzysta świeżo załadowany deviceId.js
  const loadWithPlatform = ({ OS, constants }) => {
    const fresh = loadFresh();
    const { Platform } = require('react-native');
    // W mocku RN `OS` i `constants` mogą być getterami - defineProperty zamiast zwykłego przypisania
    Object.defineProperty(Platform, 'OS', { value: OS, configurable: true, writable: true });
    Object.defineProperty(Platform, 'constants', { value: constants, configurable: true, writable: true });
    return fresh;
  };

  test('iOS -> „iPhone”', () => {
    const { getDeviceName } = loadWithPlatform({ OS: 'ios', constants: {} });
    expect(getDeviceName()).toBe('iPhone');
  });

  test('Android bez stałych platformy -> „Android”', () => {
    const { getDeviceName } = loadWithPlatform({ OS: 'android', constants: undefined });
    expect(getDeviceName()).toBe('Android');
  });

  test('Android z marką i modelem -> „Android Samsung SM-A525F”', () => {
    const { getDeviceName } = loadWithPlatform({
      OS: 'android',
      constants: { Brand: 'samsung', Model: 'SM-A525F' },
    });
    expect(getDeviceName()).toBe('Android Samsung SM-A525F');
  });
});
