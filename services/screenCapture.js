// Blokada zrzutów i nagrywania ekranu w całej aplikacji (dane klientów, finanse).
// Android: zrzut / nagranie wychodzi czarne, podgląd w ostatnich aplikacjach zaciemniony.
// iPhone: blokowane nagrywanie ekranu (zwykłego zrzutu Apple nie pozwala zablokować).
//
// Moduł natywny - działa od buildu, który go zawiera. Stara wersja aplikacji (bez modułu) dostaje ten kod
// przez OTA: najpierw sprawdzamy, czy część natywna istnieje, i dopiero wtedy ładujemy moduł JS - samo
// `require('expo-screen-capture')` bez części natywnej rzuca błąd i wypisuje go na czerwono w Metro.
import Logger from './logger';

let loaded = false;
let screenCapture = null;

const hasNativeModule = () => {
  try {
    // eslint-disable-next-line global-require
    const core = require('expo-modules-core');
    if (typeof core?.requireOptionalNativeModule !== 'function') return true; // starsze expo - sprawdzi sam require
    return !!core.requireOptionalNativeModule('ExpoScreenCapture');
  } catch (error) {
    return false;
  }
};

// Moduł expo-screen-capture albo null (brak części natywnej w tej wersji aplikacji)
export const loadScreenCapture = () => {
  if (loaded) return screenCapture;
  loaded = true;
  if (!hasNativeModule()) {
    Logger.debug('Moduł zrzutów ekranu niedostępny w tej wersji aplikacji (potrzebny nowy build)');
    return null;
  }
  try {
    // eslint-disable-next-line global-require
    screenCapture = require('expo-screen-capture');
  } catch (error) {
    screenCapture = null;
  }
  return screenCapture;
};

export const enableScreenCaptureProtection = async () => {
  const module = loadScreenCapture();
  if (!module?.preventScreenCaptureAsync) return false;
  try {
    await module.preventScreenCaptureAsync();
    return true;
  } catch (error) {
    Logger.debug('Blokada zrzutów ekranu niedostępna:', error?.message);
    return false;
  }
};

export default { enableScreenCaptureProtection, loadScreenCapture };
