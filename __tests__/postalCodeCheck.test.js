/**
 * Formularz zamówienia: kod pocztowy XX-XXX i zgodność miejscowości z wynikiem Google.
 */
/* global test, expect */
import { isPostalCodeFormatValid, cityMatchesLocalities, postalCodeHint } from '../utils/postalCodeCheck';

test('format XX-XXX', () => {
  expect(isPostalCodeFormatValid('34-500')).toBe(true);
  expect(isPostalCodeFormatValid('34500')).toBe(false);
  expect(isPostalCodeFormatValid('34-50')).toBe(false);
});

test('miejscowość porównywana bez wielkości liter i polskich znaków', () => {
  expect(cityMatchesLocalities('zakopane', ['Zakopane'])).toBe(true);
  expect(cityMatchesLocalities('Lodz', ['Łódź'])).toBe(true);
  expect(cityMatchesLocalities('Kraków', ['Zakopane'])).toBe(false);
  expect(cityMatchesLocalities('', ['Zakopane'])).toBe(true); // pusta - uzupełni się sama
});

test('podpowiedź: ok / niezgodna miejscowość / nieznany kod / nie sprawdzono', () => {
  const ok = { status: 'ok', localities: ['Zakopane'] };
  expect(postalCodeHint(ok, 'Zakopane')).toBe('ok');
  expect(postalCodeHint(ok, 'Kraków')).toBe('mismatch');
  expect(postalCodeHint({ status: 'not_found', localities: [] }, 'X')).toBe('not_found');
  expect(postalCodeHint({ status: 'unavailable', localities: [] }, 'X')).toBe('unavailable');
  expect(postalCodeHint({ status: 'checking', localities: [] }, 'X')).toBe('checking');
});
