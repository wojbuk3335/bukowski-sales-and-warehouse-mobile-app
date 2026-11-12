// Czytnik Zebra (SSI) w aplikacji (12.11.2026): uprawnienia Bluetooth, start/stop SDK, stan połączenia, sygnały
// czytnika (kod policzony = krótki wysoki pisk, kod odrzucony = długi niski podwójny), adres Bluetooth telefonu do
// kodu parowania (Android 8+ nie zdradza go aplikacji - użytkownik wpisuje raz, pamiętamy).
// Bez modułu w buildzie (stara aplikacja) wszystko jest bezpiecznym „brakiem” - tryb SSI po prostu się nie pokazuje.
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import zebra, { BEEP } from '../modules/zebra-ssi-scanner';

export const BT_ADDRESS_KEY = 'zebra-ssi-phone-bt-address';

export const isSsiAvailable = () => Platform.OS === 'android' && zebra.isAvailable();

// Android 12+: BLUETOOTH_CONNECT i BLUETOOTH_SCAN pyta się użytkownika; starsze - uprawnienia z manifestu wystarczą
export const ensureBluetoothPermissions = async () => {
  if (Platform.OS !== 'android') return false;
  if (Platform.Version < 31) return true;
  try {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);
    return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
  } catch (error) {
    return false;
  }
};

let started = false;
let connectedScanner = null; // { id, name, model } albo null
let lastError = ''; // dlaczego SDK nie działa (brak zgody na Bluetooth, błąd modułu) - widoczne na ekranie (12.11.2026)
const stateListeners = new Set();
const notifyState = () => stateListeners.forEach((listener) => { try { listener(getState()); } catch (error) { /* słuchacz */ } });
export const getState = () => ({ available: isSsiAvailable(), started, scanner: connectedScanner, error: lastError });
export const onStateChange = (listener) => { stateListeners.add(listener); return () => stateListeners.delete(listener); };

let subscriptions = [];
const unsubscribeAll = () => { subscriptions.forEach((sub) => sub.remove()); subscriptions = []; };

// Uruchomienie: uprawnienia → SDK → nasłuch połączeń. Zwraca true, gdy SDK działa (czytnik może się jeszcze nie łączyć).
export const startSsi = async () => {
  if (!isSsiAvailable()) { lastError = 'Brak modułu czytnika w tej wersji aplikacji.'; return false; }
  if (started) return true;
  const granted = await ensureBluetoothPermissions();
  if (!granted) {
    lastError = 'Brak zgody na Bluetooth („Urządzenia w pobliżu”). Włącz ją w Ustawienia → Aplikacje → Bukowski → Uprawnienia.';
    notifyState();
    return false;
  }
  unsubscribeAll();
  subscriptions.push(zebra.addListener('onSessionEstablished', (scanner) => {
    connectedScanner = { id: scanner?.id ?? -1, name: scanner?.name || '', model: scanner?.model || '' };
    notifyState();
  }));
  subscriptions.push(zebra.addListener('onSessionTerminated', () => {
    connectedScanner = null;
    notifyState();
  }));
  try {
    const status = await zebra.start();
    started = true;
    lastError = '';
    const active = Array.isArray(status?.active) ? status.active[0] : null;
    if (active) connectedScanner = { id: active.id, name: active.name || '', model: active.model || '' };
    notifyState();
    return true;
  } catch (error) {
    unsubscribeAll();
    lastError = `Moduł czytnika nie wystartował: ${error?.message || error}`;
    notifyState();
    return false;
  }
};

export const stopSsi = async () => {
  if (!started) return;
  unsubscribeAll();
  started = false;
  connectedScanner = null;
  try { await zebra.stop(); } catch (error) { /* SDK już zamknięte */ }
  notifyState();
};

// Kody z czytnika: handler({ data, type, scannerId }) → { remove() }
export const onBarcode = (handler) => zebra.addListener('onBarcode', handler);

// Sygnał z czytnika po decyzji aplikacji: 'ok' = policzono, 'warn'/'error' = NIE policzono (zeskanuj jeszcze raz).
// Czytnik sam piszczy przy każdym odczycie; nasz sygnał idzie zaraz po nim i jest inny: błąd = dwa długie niskie.
export const scannerFeedback = async (kind = 'ok') => {
  if (!started || !connectedScanner) return false;
  try {
    return await zebra.beep(kind === 'ok' ? BEEP.HIGH_SHORT_1 : BEEP.LOW_LONG_2);
  } catch (error) {
    return false;
  }
};

export const getSavedBtAddress = async () => {
  try { return (await AsyncStorage.getItem(BT_ADDRESS_KEY)) || ''; } catch (error) { return ''; }
};
export const saveBtAddress = async (address) => {
  const clean = String(address || '').trim().toUpperCase();
  try { await AsyncStorage.setItem(BT_ADDRESS_KEY, clean); } catch (error) { /* bez pamięci */ }
  return clean;
};
export const isValidBtAddress = (address) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(String(address || '').trim());

// Kod parowania (PNG base64) - czytnik skanuje go z ekranu i łączy się z telefonem; SSI przez Bluetooth Classic.
// Bez działającego SDK próbujemy je uruchomić (np. zgoda na Bluetooth dana dopiero teraz); błąd modułu trafia do stanu.
export const pairingBarcodePng = async ({ btAddress = '', factoryDefaults = true } = {}) => {
  if (!started && !(await startSsi())) return null;
  try {
    const png = await zebra.getPairingBarcodePng({ protocol: 'classic', factoryDefaults, btAddress, width: 1000, height: 300 });
    if (!png && btAddress) lastError = 'Moduł Zebry nie zbudował kodu parowania mimo adresu - sprawdź, czy Bluetooth w telefonie jest włączony.';
    if (png) lastError = '';
    notifyState();
    return png;
  } catch (error) {
    lastError = `Błąd kodu parowania: ${error?.message || error}`;
    notifyState();
    return null;
  }
};

export { BEEP };
