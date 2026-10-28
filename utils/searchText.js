// Wyszukiwanie po listach (Stan, 28.10.2026): małe litery, bez polskich znaków (ł→l, ą→a…), kilka słów = wszystkie
// muszą pasować. Ten sam sposób co wyszukiwarka zeskanowanych sztuk w Remanencie.
export const searchText = (value) => String(value || '')
  .toLowerCase()
  .replace(/ł/g, 'l')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, ''); // znaki diakrytyczne po rozłożeniu NFD

export const searchWords = (query) => searchText(query).split(/\s+/).filter(Boolean);

// fields: wartości wiersza (nazwa, rozmiar, kod…); words: z searchWords()
export const matchesSearch = (fields, words) => {
  if (!words || words.length === 0) return true;
  const haystack = searchText((fields || []).filter(Boolean).join(' '));
  return words.every((word) => haystack.includes(word));
};
