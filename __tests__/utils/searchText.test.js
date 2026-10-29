import { searchWords, searchRank, matchesSearch, filterBySearch, MATCH_WORD, MATCH_PREFIX, MATCH_FRAGMENT, MATCH_NONE } from '../../utils/searchText';

// Wyszukiwanie (29.10.2026): „Dominik” nie pokazuje „Dominika” (całe słowo wygrywa), ale „Domi” w trakcie pisania
// podpowiada oba; fragment kodu kreskowego nadal działa; polskie znaki i końcówki kolorów bez znaczenia.

const rows = [
  { fullName: 'Dominik CZERWONY', size: 'XL', barcode: '0010701300002' },
  { fullName: 'Dominika CZARNA', size: 'M', barcode: '0020701000001' },
  { fullName: 'Ada ZIELONA', size: 'S', barcode: '0030700900002' },
];
const fieldsOf = (row) => [row.fullName, row.size, row.barcode];
const names = (list) => list.map((row) => row.fullName);

test('stopnie dopasowania: całe słowo > początek słowa > fragment; kilka słów = najsłabsze decyduje', () => {
  expect(searchRank(fieldsOf(rows[0]), searchWords('dominik'))).toBe(MATCH_WORD);
  expect(searchRank(fieldsOf(rows[1]), searchWords('dominik'))).toBe(MATCH_PREFIX);
  expect(searchRank(fieldsOf(rows[0]), searchWords('0002'))).toBe(MATCH_FRAGMENT);
  expect(searchRank(fieldsOf(rows[0]), searchWords('dominik xl'))).toBe(MATCH_WORD);
  expect(searchRank(fieldsOf(rows[0]), searchWords('dominik 0002'))).toBe(MATCH_FRAGMENT);
  expect(searchRank(fieldsOf(rows[0]), searchWords('dominik m'))).toBe(MATCH_FRAGMENT); // „m” to tylko fragment („doMinik”)
  expect(searchRank(fieldsOf(rows[0]), searchWords('dominik zz'))).toBe(MATCH_NONE); // słowo, którego nie ma - brak dopasowania
  expect(matchesSearch(fieldsOf(rows[2]), searchWords('zielona'))).toBe(true);
});

test('„Dominik” pokazuje tylko Dominik; „Domi” podpowiada Dominik i Dominika; „Dominika” tylko Dominikę', () => {
  expect(names(filterBySearch(rows, fieldsOf, searchWords('Dominik')))).toEqual(['Dominik CZERWONY']);
  expect(names(filterBySearch(rows, fieldsOf, searchWords('Domi')))).toEqual(['Dominik CZERWONY', 'Dominika CZARNA']);
  expect(names(filterBySearch(rows, fieldsOf, searchWords('Dominika')))).toEqual(['Dominika CZARNA']);
  expect(names(filterBySearch(rows, fieldsOf, searchWords('dominik czerw')))).toEqual(['Dominik CZERWONY']);
});

test('fragment kodu kreskowego, polskie znaki i końcówki kolorów', () => {
  expect(names(filterBySearch(rows, fieldsOf, searchWords('00002')))).toEqual(['Dominik CZERWONY', 'Ada ZIELONA']);
  expect(names(filterBySearch(rows, fieldsOf, searchWords('zielona')))).toEqual(['Ada ZIELONA']);
  expect(names(filterBySearch(rows, fieldsOf, searchWords('zielony')))).toEqual(['Ada ZIELONA']); // końcówka koloru
  expect(names(filterBySearch(rows, fieldsOf, searchWords('ŁĄKA')))).toEqual([]);
  expect(filterBySearch(rows, fieldsOf, searchWords('   '))).toBe(rows); // puste zapytanie = cała lista
});
