// Sortowanie po polsku (31.10.2026): ta sama kolejność co localeCompare('pl'), ale bez budowania reguł przy każdym
// porównaniu - sortowanie całego stanu w zakładce Szukaj blokowało aplikację ponad 4 s
import { comparePl, comparePlBase } from '../../utils/plSort';

test('kolejność jak localeCompare("pl"): polskie litery po swoich odpowiednikach, liczby przed literami', () => {
  const words = ['Żaneta', 'Zuza', 'Łucja', 'Lena', 'Ćma', 'Cela', 'Agata', 'ada', '2XL'];
  expect([...words].sort(comparePl)).toEqual([...words].sort((a, b) => a.localeCompare(b, 'pl')));
});

test('bez rozróżniania wielkości liter i akcentów (sensitivity base); puste i brakujące wartości', () => {
  expect(comparePlBase('ADA', 'ada')).toBe(0);
  expect(comparePlBase('Agata', 'Ada')).toBeGreaterThan(0);
  expect(comparePl(undefined, '')).toBe(0);
  expect(comparePl(null, 'a')).toBeLessThan(0);
});
