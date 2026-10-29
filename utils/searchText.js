// Wyszukiwanie po listach (Stan, Szukaj, Remanent): małe litery, bez polskich znaków (ł→l, ą→a…), kilka słów = wszystkie
// muszą pasować. Ten sam sposób co w panelu (frontend/src/utils/searchText.js).
//
// Dopasowanie słowa ma trzy stopnie: całe słowo („Dominik” = „Dominik”), początek słowa („Domi” → „Dominik”, „Dominika”)
// i fragment („0002” w kodzie kreskowym). Lista pokazuje tylko NAJLEPSZY stopień, jaki w ogóle wystąpił (29.10.2026):
// wpisane „Dominik” pokazuje same „Dominik”, nie „Dominika”; w trakcie pisania „Domi” nadal podpowiada oba.
export const searchText = (value) => String(value || '')
  .toLowerCase()
  .replace(/ł/g, 'l')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, ''); // znaki diakrytyczne po rozłożeniu NFD

export const searchWords = (query) => searchText(query).split(/\s+/).filter(Boolean);

// Polskie końcówki (kolory: „czerwona” ~ „czerwony”) - do porównania całych słów
const polishStem = (word) => word.replace(/(iego|iej|ego|ej|ym|im|ie|ich|ych|emu|acy|aca|ace|ami|owi|owie|ow|om|ach|y|a|e|i|u|o)$/, '');

export const MATCH_NONE = 0;
export const MATCH_FRAGMENT = 1;
export const MATCH_PREFIX = 2;
export const MATCH_WORD = 3;

// Stopień dopasowania jednego słowa zapytania do słów wiersza. Ta sama końcówkowo odmiana („zielony” ~ „ZIELONA”)
// liczy się jak początek słowa, nie jak całe słowo - inaczej „Dominik” znów łapałby „Dominika” (ten sam rdzeń)
const wordRank = (word, haystackWords, haystack) => {
  if (haystackWords.includes(word)) return MATCH_WORD;
  if (haystackWords.some((hw) => hw.startsWith(word))) return MATCH_PREFIX;
  const stem = polishStem(word);
  if (stem.length >= 3 && haystackWords.some((hw) => polishStem(hw) === stem)) return MATCH_PREFIX;
  if (haystack.includes(word)) return MATCH_FRAGMENT;
  return MATCH_NONE;
};

// Stopień dopasowania wiersza: najsłabsze ze słów zapytania (wszystkie muszą pasować). fields: wartości wiersza
// (nazwa, rozmiar, kod…); words: z searchWords()
export const searchRank = (fields, words) => {
  if (!words || words.length === 0) return MATCH_WORD;
  const haystack = searchText((fields || []).filter(Boolean).join(' '));
  const haystackWords = haystack.split(/\s+/).filter(Boolean);
  let rank = MATCH_WORD;
  for (const word of words) {
    rank = Math.min(rank, wordRank(word, haystackWords, haystack));
    if (rank === MATCH_NONE) return MATCH_NONE;
  }
  return rank;
};

// Czy wiersz w ogóle pasuje (dowolny stopień) - zgodność wsteczna
export const matchesSearch = (fields, words) => searchRank(fields, words) > MATCH_NONE;

// Lista po wyszukiwaniu: tylko wiersze z najlepszym stopniem, jaki wystąpił. fieldsOf(item) → wartości wiersza
export const filterBySearch = (items, fieldsOf, words) => {
  if (!words || words.length === 0) return items;
  const ranked = [];
  let best = MATCH_NONE;
  (items || []).forEach((item) => {
    const rank = searchRank(fieldsOf(item), words);
    if (rank > MATCH_NONE) {
      ranked.push([item, rank]);
      if (rank > best) best = rank;
    }
  });
  return ranked.filter(([, rank]) => rank === best).map(([item]) => item);
};
