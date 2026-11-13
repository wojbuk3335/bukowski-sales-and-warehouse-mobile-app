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
let availableScanners = []; // czytniki, które SDK widzi (po parowaniu), ale sesja jeszcze nie powstała - [{ id, name, model }]
let sdkLog = []; // ostatnie komunikaty z modułu (wyniki wywołań SDK) - widoczne na ekranie czytnika
let currentProtocol = 'classic'; // tryb zapisany (wybór użytkownika)
let runningProtocol = ''; // tryb, w którym SDK faktycznie działa ('' = nie działa)
export const PROTOCOL_KEY = 'zebra-ssi-protocol';
const stateListeners = new Set();
const notifyState = () => stateListeners.forEach((listener) => { try { listener(getState()); } catch (error) { /* słuchacz */ } });
export const getState = () => ({ available: isSsiAvailable(), started, scanner: connectedScanner, error: lastError, availableScanners, log: sdkLog, protocol: currentProtocol });
const scannerInfo = (scanner) => ({ id: scanner?.id ?? -1, name: scanner?.name || '', model: scanner?.model || '', connectionType: scanner?.connectionType || '' });
// SDK bez filtru pokazuje WSZYSTKIE sparowane urządzenia Bluetooth (zegarek, czujnik tętna…) - na liście zostają
// tylko czytniki Zebry (DS/CS/RS/LI + numer albo „Zebra”); 13.11.2026 automat próbował łączyć się z zegarkiem
export const isZebraScanner = (scanner) => /\b(DS|CS|RS|LI|RFD)\s?\d{3,4}\b|zebra/i.test(`${scanner?.name || ''} ${scanner?.model || ''}`);
export const onStateChange = (listener) => { stateListeners.add(listener); return () => stateListeners.delete(listener); };

let subscriptions = [];
const unsubscribeAll = () => { subscriptions.forEach((sub) => sub.remove()); subscriptions = []; };

export const getSavedProtocol = async () => {
  try { const value = await AsyncStorage.getItem(PROTOCOL_KEY); return value === 'ble' ? 'ble' : 'classic'; } catch (error) { return 'classic'; }
};
export const saveProtocol = async (protocol) => {
  currentProtocol = protocol === 'ble' ? 'ble' : 'classic';
  try { await AsyncStorage.setItem(PROTOCOL_KEY, currentProtocol); } catch (error) { /* bez pamięci */ }
  return currentProtocol;
};

// Uruchomienie: uprawnienia → SDK → nasłuch połączeń. Zwraca true, gdy SDK działa (czytnik może się jeszcze nie łączyć).
// protocol: 'classic' | 'ble' - tryb SDK zgodny z kodem parowania (zmiana trybu uruchamia SDK od nowa)
export const startSsi = async (protocol) => {
  if (!isSsiAvailable()) { lastError = 'Brak modułu czytnika w tej wersji aplikacji.'; return false; }
  const wanted = protocol || (await getSavedProtocol());
  if (started && wanted === runningProtocol) return true;
  if (started) { await stopSsi(); } // zmiana trybu LE <-> Classic = SDK od nowa
  currentProtocol = wanted;
  const granted = await ensureBluetoothPermissions();
  if (!granted) {
    lastError = 'Brak zgody na Bluetooth („Urządzenia w pobliżu”). Włącz ją w Ustawienia → Aplikacje → Bukowski → Uprawnienia.';
    notifyState();
    return false;
  }
  unsubscribeAll();
  subscriptions.push(zebra.addListener('onSessionEstablished', (scanner) => {
    connectedScanner = scannerInfo(scanner);
    lastError = '';
    notifyState();
  }));
  subscriptions.push(zebra.addListener('onSessionTerminated', (event) => {
    // SDK potrafi zgłosić ten sam czytnik dwa razy (Classic i LE) - koniec tej drugiej, pustej sesji nie może
    // gasić statusu żywej sesji; gaśnie tylko, gdy zamknęła się sesja POŁĄCZONEGO czytnika
    const id = event?.id ?? -1;
    if (connectedScanner && id !== -1 && id !== connectedScanner.id) {
      lastError = `Zamknięta sesja czytnika ${id} (połączony zostaje ${connectedScanner.id})`;
      notifyState();
      return;
    }
    connectedScanner = null;
    lastError = `Czytnik ${id} rozłączył się - SDK spróbuje połączyć ponownie; możesz też kliknąć „Odśwież” / „Połącz”.`;
    notifyState();
  }));
  // czytnik widoczny dla SDK (sparowany), zanim powstanie sesja - na ekranie z przyciskiem „Połącz”
  subscriptions.push(zebra.addListener('onScannerAppeared', (scanner) => {
    const info = scannerInfo(scanner);
    if (!isZebraScanner(info)) return; // zegarki, czujniki - nie pokazujemy
    availableScanners = [...availableScanners.filter((item) => item.id !== info.id), info];
    notifyState();
    // automat: pierwszy czytnik Zebry bez sesji - łączymy sami (SDK w buildzie 21 próbował pierwsze urządzenie z listy)
    if (!connectedScanner) connectScanner(info.id);
  }));
  subscriptions.push(zebra.addListener('onScannerDisappeared', (event) => {
    availableScanners = availableScanners.filter((item) => item.id !== (event?.id ?? -1));
    notifyState();
  }));
  subscriptions.push(zebra.addListener('onLog', (event) => {
    const stamp = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    sdkLog = [...sdkLog, `${stamp} ${event?.message || ''}`].slice(-12);
    notifyState();
  }));
  try {
    const status = await zebra.start(currentProtocol);
    started = true;
    runningProtocol = currentProtocol;
    lastError = '';
    const active = Array.isArray(status?.active) ? status.active[0] : null;
    if (active) connectedScanner = scannerInfo(active);
    availableScanners = (Array.isArray(status?.available) ? status.available : []).map(scannerInfo).filter(isZebraScanner);
    notifyState();
    const first = availableScanners.find((item) => item.id !== connectedScanner?.id);
    if (!connectedScanner && first) connectScanner(first.id);
    return true;
  } catch (error) {
    unsubscribeAll();
    lastError = `Moduł czytnika nie wystartował: ${error?.message || error}`;
    notifyState();
    return false;
  }
};

// Odświeżenie stanu z SDK (lista widocznych i połączonych czytników) - przycisk „Odśwież” na ekranie
export const refreshStatus = async () => {
  if (!started) return getState();
  try {
    const status = await zebra.getStatus();
    const active = Array.isArray(status?.active) ? status.active[0] : null;
    connectedScanner = active ? scannerInfo(active) : connectedScanner;
    availableScanners = (Array.isArray(status?.available) ? status.available : []).map(scannerInfo).filter(isZebraScanner);
    if (!active && connectedScanner && !(status?.activeScannerId >= 0)) connectedScanner = null;
  } catch (error) {
    lastError = `Błąd odczytu stanu: ${error?.message || error}`;
  }
  notifyState();
  return getState();
};

// Ręczne nawiązanie sesji z widocznym czytnikiem (gdy automat po parowaniu nie zadziałał)
export const connectScanner = async (scannerId) => {
  if (!started) return false;
  try {
    const ok = await zebra.connect(scannerId);
    if (!ok) lastError = `SDK odmówiło połączenia z czytnikiem ${scannerId} - sprawdź, czy telefon potwierdził parowanie Bluetooth.`;
    else lastError = '';
    notifyState();
    return ok;
  } catch (error) {
    lastError = `Błąd połączenia: ${error?.message || error}`;
    notifyState();
    return false;
  }
};

export const stopSsi = async () => {
  if (!started) return;
  unsubscribeAll();
  started = false;
  runningProtocol = '';
  connectedScanner = null;
  availableScanners = [];
  sdkLog = [];
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

// Kod parowania (PNG base64) - czytnik skanuje go z ekranu i łączy się z telefonem.
// protocol: 'ble' (SSI przez Bluetooth LE - telefon sam łączy się z czytnikiem, bez potwierdzania parowania; domyślny
// w aplikacji Zebry) albo 'classic' (SSI przez Bluetooth Classic - czytnik łączy się z telefonem, Android pyta o parowanie).
// Bez działającego SDK próbujemy je uruchomić (np. zgoda na Bluetooth dana dopiero teraz); błąd modułu trafia do stanu.
export const pairingBarcodePng = async ({ btAddress = '', factoryDefaults = true, protocol = 'classic' } = {}) => {
  const wanted = protocol === 'ble' ? 'ble' : 'classic';
  await saveProtocol(wanted);
  if (!(await startSsi(wanted))) return null; // SDK w trybie zgodnym z kodem parowania
  try {
    // kod STC jest długi (adres telefonu + ustawienia) - rysujemy go w wysokiej rozdzielczości, żeby czytnik
    // odróżnił kreski z ekranu (13.11.2026: przy 1000 px kod był nieczytelny)
    const png = await zebra.getPairingBarcodePng({ protocol: wanted, factoryDefaults, btAddress, width: 2400, height: 700 });
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
