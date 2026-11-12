/**
 * Czytnik Zebra (SSI, 12.11.2026) - warstwa aplikacji nad modułem natywnym: uprawnienia Bluetooth (Android 12+),
 * start/stop, stan połączenia ze zdarzeń SDK, sygnał z czytnika (OK = krótki wysoki, błąd = długi niski),
 * adres Bluetooth telefonu do kodu parowania. Bez modułu w buildzie wszystko jest bezpiecznym „brakiem”.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const listeners = {};
const mockNative = {
  isAvailable: jest.fn(() => true),
  start: jest.fn(() => Promise.resolve({ started: true, active: [], available: [] })),
  stop: jest.fn(() => Promise.resolve()),
  beep: jest.fn(() => Promise.resolve(true)),
  connect: jest.fn(() => Promise.resolve(true)),
  getStatus: jest.fn(() => Promise.resolve({ started: true, activeScannerId: -1, active: [], available: [] })),
  getPairingBarcodePng: jest.fn(() => Promise.resolve('UElORw==')),
  addListener: jest.fn((event, handler) => {
    listeners[event] = handler;
    return { remove: jest.fn(() => { delete listeners[event]; }) };
  }),
  BEEP: { HIGH_SHORT_1: 0, LOW_LONG_2: 16 },
};
jest.mock('../../modules/zebra-ssi-scanner', () => ({ __esModule: true, default: mockNative, BEEP: mockNative.BEEP }));

const zebraSsi = require('../../services/zebraSsi');

beforeEach(async () => {
  jest.clearAllMocks();
  Object.keys(listeners).forEach((key) => delete listeners[key]);
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });
  PermissionsAndroid.requestMultiple = jest.fn(() => Promise.resolve({
    [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: 'granted',
    [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: 'granted',
  }));
  await zebraSsi.stopSsi();
  await AsyncStorage.clear();
});

test('start: pyta o uprawnienia Bluetooth (Android 12+), uruchamia SDK, stan połączenia idzie ze zdarzeń', async () => {
  const seen = [];
  const unsubscribe = zebraSsi.onStateChange((state) => seen.push(state));
  expect(await zebraSsi.startSsi()).toBe(true);
  expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]);
  expect(mockNative.start).toHaveBeenCalledTimes(1);
  expect(zebraSsi.getState()).toEqual({ available: true, started: true, scanner: null, error: '', availableScanners: [] });
  listeners.onScannerAppeared({ id: 7, name: 'DS2278', model: 'DS2278-SR' }); // sparowany, bez sesji
  expect(zebraSsi.getState().availableScanners).toEqual([{ id: 7, name: 'DS2278', model: 'DS2278-SR', connectionType: '' }]);
  expect(await zebraSsi.connectScanner(7)).toBe(true);
  listeners.onScannerDisappeared({ id: 7 });
  expect(zebraSsi.getState().availableScanners).toEqual([]);

  listeners.onSessionEstablished({ id: 1, name: 'DS2278', model: 'DS2278-SR' });
  expect(zebraSsi.getState().scanner).toEqual({ id: 1, name: 'DS2278', model: 'DS2278-SR', connectionType: '' });
  listeners.onSessionTerminated({ id: 1 });
  expect(zebraSsi.getState().scanner).toBeNull();
  expect(seen.length).toBeGreaterThanOrEqual(3);
  unsubscribe();

  await zebraSsi.startSsi(); // drugi start nic nie uruchamia ponownie
  expect(mockNative.start).toHaveBeenCalledTimes(1);
});

test('odmowa uprawnień = SDK nie startuje; sygnał tylko przy połączonym czytniku', async () => {
  PermissionsAndroid.requestMultiple = jest.fn(() => Promise.resolve({ a: 'denied', b: 'granted' }));
  expect(await zebraSsi.startSsi()).toBe(false);
  expect(mockNative.start).not.toHaveBeenCalled();
  expect(zebraSsi.getState().error).toMatch(/Brak zgody na Bluetooth/); // powód widoczny na ekranie (12.11)
  expect(await zebraSsi.scannerFeedback('ok')).toBe(false); // niepołączony - bez sygnału

  PermissionsAndroid.requestMultiple = jest.fn(() => Promise.resolve({ a: 'granted' }));
  await zebraSsi.startSsi();
  listeners.onSessionEstablished({ id: 2, name: 'DS2278' });
  expect(await zebraSsi.scannerFeedback('ok')).toBe(true);
  expect(mockNative.beep).toHaveBeenLastCalledWith(0); // krótki wysoki
  await zebraSsi.scannerFeedback('error');
  expect(mockNative.beep).toHaveBeenLastCalledWith(16); // długi niski ×2 = nie policzono, zeskanuj jeszcze raz
});

test('kod parowania: zapamiętany adres Bluetooth telefonu, walidacja postaci', async () => {
  expect(zebraSsi.isValidBtAddress('aa:bb:cc:dd:ee:ff')).toBe(true);
  expect(zebraSsi.isValidBtAddress('AA-BB-CC')).toBe(false);
  expect(await zebraSsi.saveBtAddress(' aa:bb:cc:dd:ee:ff ')).toBe('AA:BB:CC:DD:EE:FF');
  expect(await zebraSsi.getSavedBtAddress()).toBe('AA:BB:CC:DD:EE:FF');

  // przed startem SDK kod parowania sam uruchamia SDK (zgoda na Bluetooth dana dopiero teraz)
  expect(await zebraSsi.pairingBarcodePng({ btAddress: 'AA:BB:CC:DD:EE:FF' })).toBe('UElORw==');
  expect(mockNative.start).toHaveBeenCalledTimes(1);
  expect(zebraSsi.getState().started).toBe(true);
  expect(mockNative.getPairingBarcodePng).toHaveBeenCalledWith({ protocol: 'ble', factoryDefaults: true, btAddress: 'AA:BB:CC:DD:EE:FF', width: 1000, height: 300 }); // domyślnie LE
  await zebraSsi.pairingBarcodePng({ btAddress: 'AA:BB:CC:DD:EE:FF', protocol: 'classic' });
  expect(mockNative.getPairingBarcodePng).toHaveBeenLastCalledWith({ protocol: 'classic', factoryDefaults: true, btAddress: 'AA:BB:CC:DD:EE:FF', width: 1000, height: 300 });
});

test('stop: odpina słuchaczy i zamyka SDK; starszy Android nie pyta o uprawnienia', async () => {
  Object.defineProperty(Platform, 'Version', { value: 29, configurable: true }); // Android 10 - uprawnienia z manifestu
  await zebraSsi.startSsi();
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  expect(typeof listeners.onSessionEstablished).toBe('function');
  await zebraSsi.stopSsi();
  expect(mockNative.stop).toHaveBeenCalled();
  expect(listeners.onSessionEstablished).toBeUndefined();
  expect(zebraSsi.getState().started).toBe(false);
});
