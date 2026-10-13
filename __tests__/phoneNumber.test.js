/**
 * Formularz zamówienia: numer telefonu klienta - komórkowy i stacjonarny, z prefiksem +48 / 0048 lub bez.
 */
/* global test, expect */
import { formatPhoneNumber, isValidPolishPhone, nationalPhoneDigits } from '../utils/phoneNumber';

test('numery komórkowe są poprawne', () => {
  expect(isValidPolishPhone('600 123 456')).toBe(true);
  expect(isValidPolishPhone('512-345-678')).toBe(true);
  expect(isValidPolishPhone('+48 600 123 456')).toBe(true);
  expect(isValidPolishPhone('0048 600123456')).toBe(true);
  expect(isValidPolishPhone('48600123456')).toBe(true);
});

test('numery stacjonarne (kierunkowe 12, 22, 32...) są poprawne', () => {
  expect(isValidPolishPhone('12 345 67 89')).toBe(true);
  expect(isValidPolishPhone('22 123 45 67')).toBe(true);
  expect(isValidPolishPhone('32-123-45-67')).toBe(true);
  expect(isValidPolishPhone('(18) 201 23 45')).toBe(true);
  expect(isValidPolishPhone('+48 22 123 45 67')).toBe(true);
  expect(isValidPolishPhone('481234567')).toBe(true); // kierunkowy 48 (Radom) bez prefiksu kraju
});

test('błędne numery są odrzucane', () => {
  expect(isValidPolishPhone('')).toBe(false);
  expect(isValidPolishPhone('12345678')).toBe(false); // 8 cyfr
  expect(isValidPolishPhone('1234567890')).toBe(false); // 10 cyfr
  expect(isValidPolishPhone('012 345 678')).toBe(false); // zaczyna się od 0
  expect(isValidPolishPhone('+44 123 456 789')).toBe(false); // zagraniczny
  expect(isValidPolishPhone('0044 123456789')).toBe(false);
  expect(isValidPolishPhone('600 123 45a')).toBe(false);
});

test('cyfry numeru krajowego', () => {
  expect(nationalPhoneDigits('+48 600 123 456')).toBe('600123456');
  expect(nationalPhoneDigits('0048 22 123 45 67')).toBe('221234567');
  expect(nationalPhoneDigits('+1 555 123 4567')).toBeNull();
});

test('formatowanie w trakcie pisania', () => {
  expect(formatPhoneNumber('6001')).toBe('600 1');
  expect(formatPhoneNumber('600123456')).toBe('600 123 456');
  expect(formatPhoneNumber('221234567')).toBe('221 234 567');
  expect(formatPhoneNumber('+48600123456')).toBe('+48 600 123 456');
  expect(formatPhoneNumber('+481')).toBe('+48 1');
  expect(formatPhoneNumber('+4')).toBe('+4');
  expect(formatPhoneNumber('0048600123456')).toBe('+48 600 123 456');
  expect(formatPhoneNumber('48600123456')).toBe('+48 600 123 456');
  expect(formatPhoneNumber('')).toBe('');
});

test('sformatowany numer przechodzi walidację', () => {
  ['12 345 67 89', '+48 22 123 45 67', '0048 600 123 456', '600-123-456'].forEach((input) => {
    expect(isValidPolishPhone(formatPhoneNumber(input))).toBe(true);
  });
});
