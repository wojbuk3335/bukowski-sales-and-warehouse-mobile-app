// Pola kwot: przecinek jako kropka, jedna kropka, max 2 miejsca - „12,50” to 12.50, nie 1250 ani 12
import { sanitizeAmountInput } from '../../utils/amountInput';

describe('sanitizeAmountInput', () => {
  test.each([
    ['12,50', '12.50'],
    ['12.50', '12.50'],
    ['1250,99', '1250.99'],
    ['12,', '12.'],
    [',5', '0.5'],
    ['12.5.5', '12.55'],
    ['12,555', '12.55'],
    ['1 200 zł', '1200'],
    ['-50', '50'],
    ['', ''],
    [undefined, ''],
    ['abc', ''],
  ])('%p → %p', (input, expected) => {
    expect(sanitizeAmountInput(input)).toBe(expected);
  });

  test('wynik czyta się parseFloat bez gubienia groszy', () => {
    expect(parseFloat(sanitizeAmountInput('12,50'))).toBe(12.5);
    expect(parseFloat(sanitizeAmountInput('1199,90'))).toBe(1199.9);
  });
});
