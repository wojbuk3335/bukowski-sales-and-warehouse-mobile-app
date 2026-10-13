// Blokada zrzutów i nagrywania ekranu w całej aplikacji (dane klientów, finanse).
// Android: zrzut / nagranie wychodzi czarne, podgląd w ostatnich aplikacjach zaciemniony.
// iPhone: blokowane nagrywanie ekranu (zwykłego zrzutu Apple nie pozwala zablokować).
//
// Moduł natywny - działa od buildu, który go zawiera. Stara wersja aplikacji (bez modułu)
// dostaje ten kod przez OTA: wtedy blokada jest po cichu pomijana, aplikacja działa normalnie.
import Logger from './logger';

let screenCapture = null;
try {
  // eslint-disable-next-line global-require
  screenCapture = require('expo-screen-capture');
} catch (error) {
  screenCapture = null; // brak modułu natywnego w tej wersji aplikacji
}

export const enableScreenCaptureProtection = async () => {
  if (!screenCapture?.preventScreenCaptureAsync) return false;
  try {
    await screenCapture.preventScreenCaptureAsync();
    return true;
  } catch (error) {
    Logger.debug('Blokada zrzutów ekranu niedostępna:', error?.message);
    return false;
  }
};
