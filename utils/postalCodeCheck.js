// Kod pocztowy w formularzu zamówienia: format XX-XXX i porównanie miejscowości z wynikiem z Google (przez backend).

export const POSTAL_CODE_RE = /^\d{2}-\d{3}$/;

export const isPostalCodeFormatValid = (code) => POSTAL_CODE_RE.test(String(code || '').trim());

// Porównanie bez wielkości liter i polskich znaków („zakopane” = „Zakopane”, „Lodz” = „Łódź”)
const PL_MAP = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
export const normalizePlace = (name) => String(name || '')
  .toLowerCase()
  .replace(/[ąćęłńóśźż]/g, (ch) => PL_MAP[ch])
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const cityMatchesLocalities = (city, localities = []) => {
  const wanted = normalizePlace(city);
  return !wanted || localities.length === 0 || localities.some((place) => normalizePlace(place) === wanted);
};

// Stan do pokazania pod polami: 'idle' | 'checking' | 'ok' | 'mismatch' | 'not_found' | 'unavailable'
export const postalCodeHint = (check, city) => {
  if (!check || check.status === 'idle' || check.status === 'checking' || check.status === 'unavailable') {
    return check ? check.status : 'idle';
  }
  if (check.status === 'not_found') return 'not_found';
  return cityMatchesLocalities(city, check.localities) ? 'ok' : 'mismatch';
};
