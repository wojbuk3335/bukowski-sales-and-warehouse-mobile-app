/**
 * Blokada zrzutów ekranu: z modułem natywnym włączana, bez modułu (stara wersja aplikacji po OTA) pomijana bez błędu.
 */
/* global jest, test, expect, beforeEach */

beforeEach(() => {
  jest.resetModules();
});

test('z modułem: włącza blokadę zrzutów ekranu', async () => {
  const preventScreenCaptureAsync = jest.fn(() => Promise.resolve());
  jest.doMock('expo-screen-capture', () => ({ preventScreenCaptureAsync }));
  const { enableScreenCaptureProtection } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(true);
  expect(preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
});

test('bez modułu natywnego (stara wersja): pomija blokadę, aplikacja działa', async () => {
  jest.doMock('expo-screen-capture', () => {
    throw new Error("Cannot find native module 'ExpoScreenCapture'");
  });
  const { enableScreenCaptureProtection } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(false);
});

test('błąd modułu przy włączaniu nie wywraca aplikacji', async () => {
  jest.doMock('expo-screen-capture', () => ({ preventScreenCaptureAsync: () => Promise.reject(new Error('nie wspierane')) }));
  const { enableScreenCaptureProtection } = require('../services/screenCapture');
  await expect(enableScreenCaptureProtection()).resolves.toBe(false);
});
