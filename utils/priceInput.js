/**
 * Odczyt kwot wpisywanych w formularzu zamówienia.
 *
 * Dawniej „1.200,50” dawało 1,20 zł (zamiana tylko pierwszego przecinka, parseFloat obcinał resztę).
 * Teraz: „1200”, „1 200”, „1200,50”, „1200.50”, „1.200,50”, „1,200.50”, „1.200.000” są czytane poprawnie,
 * a zapis niejednoznaczny („1,200” / „1.200” - tysiąc dwieście czy 1,2?) jest odrzucany z prośbą o poprawkę.
 */

export const MAX_ORDER_PRICE = 100000; // zł - górna granica ceny zamówienia (literówki typu 120000 zamiast 1200)

const groupsPattern = (sep) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`);

/**
 * @returns {{ value: number|null, empty: boolean, error: null|'ambiguous'|'invalid' }}
 */
export const parseAmount = (input) => {
  const invalid = { value: null, empty: false, error: 'invalid' };
  const text = String(input ?? '')
    .replace(/zł/gi, '')
    .replace(/[\s ]/g, '');
  if (!text) return { value: null, empty: true, error: null };
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return invalid;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let integerPart = text;
  let fraction = '';

  if (lastDot !== -1 && lastComma !== -1) {
    // Oba separatory: ostatni jest dziesiętny, drugi to separator tysięcy (grupy po 3 cyfry)
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    const cut = Math.max(lastDot, lastComma);
    integerPart = text.slice(0, cut);
    fraction = text.slice(cut + 1);
    if (integerPart.includes(decimalSep) || !groupsPattern(thousandsSep).test(integerPart)) return invalid;
    integerPart = integerPart.split(thousandsSep).join('');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const parts = text.split(sep);
    if (parts.length > 2) {
      // Kilka takich samych separatorów: tylko jako separator tysięcy („1.200.000”)
      if (!groupsPattern(sep).test(text)) return invalid;
      integerPart = parts.join('');
    } else {
      [integerPart, fraction] = parts;
      if (fraction.length === 3) return { value: null, empty: false, error: 'ambiguous' };
    }
  }

  if (!integerPart) integerPart = '0';
  if (!/^\d+$/.test(integerPart) || !/^\d{0,2}$/.test(fraction)) return invalid;
  const value = Number(`${integerPart}.${fraction || '0'}`);
  return Number.isFinite(value) ? { value, empty: false, error: null } : invalid;
};

/** Liczba do obliczeń na żywo (pobranie, podgląd) - błędny/pusty zapis = 0. */
export const amountOrZero = (input) => parseAmount(input).value || 0;

/** „1 200,50 zł” - podgląd pod polem, żeby sprzedawca widział, co zostanie zapisane. */
export const formatAmount = (value, currency = 'zł') => {
  const [int, dec] = Number(value).toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} ${currency}`;
};

/** Komunikat dla pola z błędnym zapisem albo null. */
export const amountError = (input, label) => {
  const { error } = parseAmount(input);
  const shown = String(input ?? '').trim();
  if (error === 'ambiguous') return `${label}: zapis „${shown}” jest niejednoznaczny - wpisz bez kropki tysięcy (np. 1200 albo 1,20)`;
  if (error === 'invalid') return `${label}: nieprawidłowa kwota „${shown}” (np. 1200 albo 1200,50)`;
  return null;
};

/**
 * Walidacja kwot przed wysłaniem zamówienia. depositInPln - zaliczka przeliczona na zł (null = brak kursu).
 * @returns {string|null} komunikat błędu
 */
export const validateOrderAmounts = ({ totalPrice, deposit, depositCurrency = 'PLN', depositInPln }) => {
  const priceErr = amountError(totalPrice, 'Cena');
  if (priceErr) return priceErr;
  const price = parseAmount(totalPrice).value;
  if (!price || price <= 0) return 'Podaj cenę całkowitą zamówienia (większą od 0)';
  if (price > MAX_ORDER_PRICE) return `Cena ${formatAmount(price)} przekracza limit ${formatAmount(MAX_ORDER_PRICE)} - sprawdź, czy nie ma literówki`;

  const depositErr = amountError(deposit, 'Zaliczka');
  if (depositErr) return depositErr;
  const dep = parseAmount(deposit).value || 0;
  if (dep > 0 && depositCurrency !== 'PLN' && !(depositInPln > 0)) {
    return `Brak kursu ${depositCurrency} - spróbuj za chwilę albo wpisz zaliczkę w PLN`;
  }
  const depPln = depositCurrency === 'PLN' ? dep : depositInPln || 0;
  if (depPln - price > 0.01) return `Zaliczka (${formatAmount(depPln)}) nie może być większa niż cena (${formatAmount(price)})`;
  return null;
};
