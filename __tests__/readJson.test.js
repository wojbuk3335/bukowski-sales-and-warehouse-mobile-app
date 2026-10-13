/**
 * Odpowiedzi serwera bez JSON-a (np. strona HTML z błędem 502) nie mogą kończyć się „JSON Parse error”.
 */
/* global test, expect */
import { isConnectionError, readJson, serverErrorMessage } from '../utils/readJson';

const jsonResponse = (status, body) => ({ status, ok: status < 400, json: async () => body });
const htmlResponse = (status) => ({
  status,
  ok: status < 400,
  json: async () => { throw new SyntaxError('JSON Parse error: Unrecognized token \'<\''); },
});

test('readJson: poprawny JSON', async () => {
  await expect(readJson(jsonResponse(200, { success: true }))).resolves.toEqual({ success: true });
});

test('readJson: HTML, pusta treść, null i brak odpowiedzi dają {}', async () => {
  await expect(readJson(htmlResponse(502))).resolves.toEqual({});
  await expect(readJson(jsonResponse(200, null))).resolves.toEqual({});
  await expect(readJson(jsonResponse(200, 'tekst'))).resolves.toEqual({});
  await expect(readJson(undefined)).resolves.toEqual({});
});

test('serverErrorMessage: komunikat z serwera ma pierwszeństwo', () => {
  expect(serverErrorMessage({ status: 400 }, { message: 'Brak numeru telefonu' }, 'x')).toBe('Brak numeru telefonu');
  expect(serverErrorMessage({ status: 500 }, { message: 'Błąd bazy' })).toBe('Błąd bazy');
});

test('serverErrorMessage: błąd 5xx bez JSON-a', () => {
  expect(serverErrorMessage({ status: 502 }, {})).toBe('Serwer chwilowo nie odpowiada (błąd 502) - spróbuj za chwilę.');
  expect(serverErrorMessage({ status: 504 }, {}, 'inny')).toBe('Serwer chwilowo nie odpowiada (błąd 504) - spróbuj za chwilę.');
  expect(serverErrorMessage(undefined, {})).toBe('Serwer chwilowo nie odpowiada - spróbuj za chwilę.');
});

test('serverErrorMessage: 4xx bez komunikatu - tekst domyślny', () => {
  expect(serverErrorMessage({ status: 404 }, {}, 'Nie znaleziono zamówienia')).toBe('Nie znaleziono zamówienia');
  expect(serverErrorMessage({ status: 404 }, {})).toBe('Nieoczekiwana odpowiedź serwera (błąd 404).');
});

test('isConnectionError: limit czasu i brak sieci', () => {
  const abort = new Error('Żądanie przekroczyło limit czasu połączenia');
  abort.name = 'AbortError';
  expect(isConnectionError(abort)).toBe(true);
  expect(isConnectionError(new TypeError('Network request failed'))).toBe(true);
  expect(isConnectionError(new Error('Brak numeru telefonu'))).toBe(false);
  expect(isConnectionError(null)).toBe(false);
});
