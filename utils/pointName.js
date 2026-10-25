// Nazwa punktu do wyświetlenia na listach wyboru (sprzedaż, edycja sprzedaży, przepisanie) - 25.10.2026.
// Zamiast symbolu („P”) pełna nazwa punktu („Parzygnat”); magazyn zawsze jako „MAGAZYN”.
// Symbol dalej jest wartością zapisywaną (from / transfer_to) - zmienia się tylko napis.
export const pointDisplayName = (user) => {
  if (!user) return '';
  const role = String(user.role || '').toLowerCase();
  const symbol = String(user.symbol || '');
  if (role === 'magazyn' || symbol.toUpperCase() === 'MAGAZYN') return 'MAGAZYN';
  return String(user.sellingPoint || '').trim() || symbol;
};

// Nazwa po symbolu (dla pola z wybranym punktem); gdy punktu nie ma na liście - sam symbol
export const pointNameBySymbol = (users, symbol) => {
  if (!symbol) return '';
  const user = (users || []).find((u) => u?.symbol === symbol);
  return user ? pointDisplayName(user) : String(symbol);
};
