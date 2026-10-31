// Porównywanie po polsku (31.10.2026, wydajność): `a.localeCompare(b, 'pl')` na Androidzie (Hermes) przy KAŻDYM
// porównaniu od nowa buduje reguły sortowania - posortowanie całego stanu wszystkich punktów (tysiące sztuk) trwało
// w zakładce Szukaj ponad 4 s i blokowało aplikację (pomiar z Dziennika aktywności: „Przerysowanie: Szukaj 4394 ms”).
// Jeden wspólny Intl.Collator robi to samo wielokrotnie szybciej. Bez Intl - zwykłe porównanie małych liter.
let collator = null;
let collatorBase = null;
try {
  collator = new Intl.Collator('pl');
  collatorBase = new Intl.Collator('pl', { sensitivity: 'base' });
} catch (_error) {
  collator = null;
  collatorBase = null;
}

const plain = (a, b) => {
  const x = String(a ?? '').toLowerCase();
  const y = String(b ?? '').toLowerCase();
  if (x < y) return -1;
  return x > y ? 1 : 0;
};

// Jak a.localeCompare(b, 'pl')
export const comparePl = (a, b) => (collator ? collator.compare(String(a ?? ''), String(b ?? '')) : plain(a, b));

// Jak a.localeCompare(b, 'pl', { sensitivity: 'base' }) - bez rozróżniania wielkości liter i znaków diakrytycznych
export const comparePlBase = (a, b) => (collatorBase ? collatorBase.compare(String(a ?? ''), String(b ?? '')) : plain(a, b));
