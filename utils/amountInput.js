// Pole kwoty w trakcie wpisywania: przecinek = kropka, tylko cyfry i jedna kropka, najwyżej 2 miejsca po kropce.
//
// Dawniej pola kwot albo USUWAŁY przecinek („12,50” → „1250”), albo przepuszczały cokolwiek, a parseFloat
// czytał tylko do przecinka („12,50” → 12 zł). Klawiatura numeryczna na Androidzie ma przecinek.
export const sanitizeAmountInput = (value) => {
  const text = String(value ?? '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const dot = text.indexOf('.');
  if (dot === -1) return text;
  const whole = text.slice(0, dot);
  const fraction = text.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole || '0'}.${fraction}`;
};
