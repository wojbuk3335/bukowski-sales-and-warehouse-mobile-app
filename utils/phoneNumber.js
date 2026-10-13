// Numer telefonu klienta w formularzu zamówienia.
// Polskie numery - komórkowe i stacjonarne - mają 9 cyfr (stacjonarne zaczynają się od numeru
// kierunkowego, np. 12 Kraków, 22 Warszawa, 32 Katowice). Dopuszczamy prefiks +48 / 0048 / 48
// oraz spacje, myślniki i nawiasy.

const groupNational = (digits) => [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
  .filter(Boolean)
  .join(' ');

// 9 cyfr numeru krajowego (bez prefiksu kraju); null = numer zagraniczny
export const nationalPhoneDigits = (phone) => {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.startsWith('48') ? digits.slice(2) : null;
  if (digits.startsWith('00')) return digits.startsWith('0048') ? digits.slice(4) : null;
  if (digits.length === 11 && digits.startsWith('48')) return digits.slice(2);
  return digits;
};

export const isValidPolishPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!/^\+?[\d\s\-()]+$/.test(raw)) return false;
  const national = nationalPhoneDigits(raw);
  return Boolean(national) && /^[1-9]\d{8}$/.test(national);
};

// Formatowanie w trakcie pisania: „123 456 789” albo „+48 123 456 789”
export const formatPhoneNumber = (phone) => {
  const raw = String(phone || '').trim();
  let digits = raw.replace(/\D/g, '');
  let international = raw.startsWith('+');
  if (digits.startsWith('00')) {
    international = true;
    digits = digits.slice(2);
  }
  if (!international && digits.length > 9 && digits.startsWith('48')) international = true;
  if (international) {
    if (digits.length <= 2 || !digits.startsWith('48')) return `+${digits}`;
    return `+48 ${groupNational(digits.slice(2, 11))}`.trim();
  }
  return groupNational(digits.slice(0, 9));
};
