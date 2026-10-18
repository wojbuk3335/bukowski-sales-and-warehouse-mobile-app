/**
 * Formularz zamówienia: odczyt kwot (audyt Wysyłek pkt 6). Dawniej „1.200,50” = 1,20 zł.
 */
/* global test, expect */
import { parseAmount, amountOrZero, formatAmount, validateOrderAmounts } from '../utils/priceInput';

test('poprawne zapisy', () => {
  expect(parseAmount('1200').value).toBe(1200);
  expect(parseAmount('1 200 zł').value).toBe(1200);
  expect(parseAmount('1200,50').value).toBe(1200.5);
  expect(parseAmount('1200.5').value).toBe(1200.5);
  expect(parseAmount('1.200,50').value).toBe(1200.5);
  expect(parseAmount('1,200.50').value).toBe(1200.5);
  expect(parseAmount('1.200.000').value).toBe(1200000);
  expect(parseAmount('1,20').value).toBe(1.2);
  expect(parseAmount(',5').value).toBe(0.5);
  expect(parseAmount('800,').value).toBe(800);
});

test('niejednoznaczne i błędne zapisy', () => {
  expect(parseAmount('1,200').error).toBe('ambiguous');
  expect(parseAmount('1.200').error).toBe('ambiguous');
  expect(parseAmount('1.20.0').error).toBe('invalid');
  expect(parseAmount('12,345,6').error).toBe('invalid');
  expect(parseAmount('1,2,3').error).toBe('invalid');
  expect(parseAmount('12.5000').error).toBe('invalid');
  expect(parseAmount('1.2.3,50').error).toBe('invalid');
  expect(parseAmount('...').error).toBe('invalid');
  expect(parseAmount('').empty).toBe(true);
  expect(amountOrZero('1,200')).toBe(0);
});

test('podgląd kwoty', () => {
  expect(formatAmount(1200.5)).toBe('1 200,50 zł');
  expect(formatAmount(30, 'EUR')).toBe('30,00 EUR');
});

test('walidacja kwot zamówienia', () => {
  expect(validateOrderAmounts({ totalPrice: '1200', deposit: '200' })).toBeNull();
  expect(validateOrderAmounts({ totalPrice: '', deposit: '' })).toContain('Podaj cenę');
  expect(validateOrderAmounts({ totalPrice: '0', deposit: '' })).toContain('Podaj cenę');
  expect(validateOrderAmounts({ totalPrice: '1,200', deposit: '' })).toContain('niejednoznaczny');
  expect(validateOrderAmounts({ totalPrice: '120000', deposit: '' })).toContain('limit');
  expect(validateOrderAmounts({ totalPrice: '1000', deposit: '1500' })).toContain('nie może być większa');
  expect(validateOrderAmounts({ totalPrice: '1000', deposit: '1000' })).toBeNull();
  expect(validateOrderAmounts({ totalPrice: '1000', deposit: '100', depositCurrency: 'EUR', depositInPln: null })).toContain('Brak kursu EUR');
  expect(validateOrderAmounts({ totalPrice: '1000', deposit: '300', depositCurrency: 'EUR', depositInPln: 1290 })).toContain('nie może być większa');
  expect(validateOrderAmounts({ totalPrice: '1000', deposit: '100', depositCurrency: 'EUR', depositInPln: 430 })).toBeNull();
});

describe('validateOrderAmounts - zaliczka w kilku walutach', () => {
  test('poprawna lista walut przechodzi', () => {
    expect(validateOrderAmounts({ totalPrice: '1500', deposits: [{ price: '100', currency: 'EUR' }, { price: '200', currency: 'PLN' }], depositInPln: 630 })).toBeNull();
    expect(validateOrderAmounts({ totalPrice: '1500', deposits: [{ price: '300', currency: 'PLN' }, { price: '', currency: 'PLN' }], depositInPln: 300 })).toBeNull();
  });

  test('suma zaliczek większa niż cena', () => {
    expect(validateOrderAmounts({ totalPrice: '500', deposits: [{ price: '300', currency: 'PLN' }, { price: '300', currency: 'PLN' }], depositInPln: 600 }))
      .toMatch('nie może być większa niż cena');
  });

  test('brak kursu którejś waluty', () => {
    expect(validateOrderAmounts({ totalPrice: '1500', deposits: [{ price: '100', currency: 'EUR' }, { price: '50', currency: 'CHF' }], depositInPln: null }))
      .toMatch('Brak kursu EUR, CHF');
  });

  test('błędny zapis kwoty w którymś wierszu', () => {
    expect(validateOrderAmounts({ totalPrice: '1500', deposits: [{ price: '100', currency: 'PLN' }, { price: '1,200', currency: 'PLN' }], depositInPln: 1300 }))
      .toBeTruthy();
  });
});
