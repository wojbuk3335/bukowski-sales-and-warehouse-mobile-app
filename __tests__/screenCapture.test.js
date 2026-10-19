/**
 * Blokada zrzutów ekranu: z modułem natywnym włączana, bez modułu (stara wersja aplikacji po OTA) pomijana bez błędu.
 */
/* global jest, test, expect, beforeEach */

beforeEach(() => {
  jest.resetModules();
});

const withNative = (present) => jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => (present ? {} : null) }));

test('z modułem: włącza blokadę zrzutów ekranu', async () => {
  withNative(true);
  const preventScreenCaptureAsync = jest.fn(() => Promise.resolve());
  jest.doMock('expo-screen-capture', () => ({ preventScreenCaptureAsync }));
  const { enableScreenCaptureProtection } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(true);
  expect(preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
});

test('bez modułu natywnego (stara wersja): pomija blokadę bez ładowania modułu JS (bez czerwonego błędu w Metro)', async () => {
  withNative(false);
  const factory = jest.fn(() => {
    throw new Error("Cannot find native module 'ExpoScreenCapture'");
  });
  jest.doMock('expo-screen-capture', factory);
  const { enableScreenCaptureProtection, loadScreenCapture } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(false);
  expect(loadScreenCapture()).toBeNull();
  expect(factory).not.toHaveBeenCalled(); // require('expo-screen-capture') w ogóle nie wykonany
});

test('starsze expo bez requireOptionalNativeModule: require sprawdza sam, błąd łapany', async () => {
  jest.doMock('expo-modules-core', () => ({}));
  jest.doMock('expo-screen-capture', () => {
    throw new Error("Cannot find native module 'ExpoScreenCapture'");
  });
  const { enableScreenCaptureProtection } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(false);
});

test('błąd modułu przy włączaniu nie wywraca aplikacji', async () => {
  withNative(true);
  jest.doMock('expo-screen-capture', () => ({ preventScreenCaptureAsync: () => Promise.reject(new Error('nie wspierane')) }));
  const { enableScreenCaptureProtection } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(false);
});
