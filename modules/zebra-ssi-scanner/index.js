// JS moduł natywny „Czytnik Zebra (SSI)” (12.11.2026) - tylko Android, tylko w buildzie z tym modułem.
// W starszym buildzie (bez modułu) wszystko tu jest bezpiecznym „brakiem”: isAvailable() = false, reszta nic nie robi,
// więc aktualizacja OTA z tym kodem nie wywraca aplikacji.
import { Platform } from 'react-native';

let native = null;
try {
  if (Platform.OS === 'android') {
    // requireOptionalNativeModule zwraca null, gdy modułu nie ma w buildzie (zamiast rzucać wyjątek)
    const { requireOptionalNativeModule } = require('expo-modules-core');
    native = requireOptionalNativeModule('ZebraSsiScanner');
  }
} catch (error) {
  native = null;
}

// Sygnały czytnika (RMD_ATTR_VALUE_ACTION_* z SDK Zebry)
export const BEEP = {
  HIGH_SHORT_1: 0,
  HIGH_SHORT_2: 1,
  LOW_SHORT_1: 5,
  LOW_SHORT_2: 6,
  HIGH_LONG_1: 10,
  LOW_LONG_1: 15,
  LOW_LONG_2: 16,
  FAST_WARBLE: 20,
  SLOW_WARBLE: 21,
  HIGH_LOW: 22,
  LOW_HIGH: 23,
  HIGH_LOW_HIGH: 24,
};

export const isAvailable = () => Boolean(native);

// protocol: 'classic' | 'ble' | 'both' - tryb Bluetooth SDK, zgodny z kodem parowania
export const start = async (protocol = 'classic') => {
  if (!native) return null;
  try {
    return await native.start(protocol);
  } catch (error) {
    // moduł z buildu 20 (start bez argumentu) + nowszy JS z OTA: „Received 1 arguments but 0 was expected”
    if (/arguments/i.test(String(error?.message || ''))) return native.start();
    throw error;
  }
};
export const stop = async () => { if (native) await native.stop(); };
export const getStatus = async () => (native ? native.getStatus() : { started: false, activeScannerId: -1, available: [], active: [] });
export const getPairingBarcodePng = async ({ protocol = 'classic', factoryDefaults = true, btAddress = '', width = 1000, height = 300 } = {}) =>
  (native ? native.getPairingBarcodePng(protocol, factoryDefaults, btAddress || null, width, height) : null);
export const connect = async (scannerId) => (native ? native.connect(scannerId) : false);
export const disconnect = async (scannerId) => (native ? native.disconnect(scannerId) : false);
export const beep = async (pattern) => (native ? native.beep(pattern) : false);
export const setScanEnabled = async (enabled) => (native ? native.setScanEnabled(enabled) : false);

// addListener(event, handler) → { remove() }; zdarzenia: onBarcode, onScannerAppeared, onScannerDisappeared,
// onSessionEstablished, onSessionTerminated, onLog { message } (komunikaty SDK na ekran)
export const addListener = (event, handler) => {
  if (!native || typeof native.addListener !== 'function') return { remove: () => {} };
  const subscription = native.addListener(event, handler);
  return { remove: () => { try { subscription?.remove?.(); } catch (error) { /* już odpięte */ } } };
};

export default { isAvailable, start, stop, getStatus, getPairingBarcodePng, connect, disconnect, beep, setScanEnabled, addListener, BEEP };
