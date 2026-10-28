// Punkt „Cudzich” ma własny moduł (zakładka Cudzich). W Dobieraniu w telefonie ma go NIE być - tak jak w panelu
// (kopia 1:1 z frontend/src/utils/cudzich.js, 28.10.2026). Rozpoznawanie odporne na literówki i warianty nazwy:
// ignorujemy wielkość liter, polskie znaki i znaki inne niż litery, a nazwę porównujemy z „cudzich”
// z tolerancją dwóch pomyłek (np. „Cudzcih”, „CUDZIH”, „cudzich zakopane”, „Cudzich 2”).

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z]/g, '');

const levenshtein = (a, b) => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distance = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j += 1) distance[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(distance[i - 1][j] + 1, distance[i][j - 1] + 1, distance[i - 1][j - 1] + cost);
    }
  }
  return distance[rows - 1][cols - 1];
};

const TARGET = 'cudzich';

export const isCudzichPoint = (value) => {
  const text = normalize(value);
  if (!text) return false;
  if (text.includes(TARGET)) return true;
  if (text.length < 5) return false; // krótkie symbole (P, T, M, SOP) nigdy nie są Cudzichem
  const head = text.slice(0, TARGET.length);
  return levenshtein(head, TARGET) <= 2 || levenshtein(text.slice(0, TARGET.length + 1), TARGET) <= 2;
};

export const isCudzichUser = (user) => Boolean(user) && (
  isCudzichPoint(user.symbol) || isCudzichPoint(user.sellingPoint) || isCudzichPoint(user.location) || normalize(user.role) === TARGET
);

// Punkty do Dobierania - ta sama reguła co w panelu: bez admina, domu, Cudzicha; MAGAZYN zostaje
export const isDobieraniePoint = (user) => {
  const symbol = String(user?.symbol || '').toLowerCase();
  const role = String(user?.role || '').toLowerCase();
  return symbol !== 'admin' && symbol !== 'dom' && symbol !== 'limited_admin' &&
    role !== 'superadmin' && role !== 'limited admin' && role !== 'admin' && role !== 'admin2' &&
    !isCudzichUser(user);
};

export default isCudzichPoint;
