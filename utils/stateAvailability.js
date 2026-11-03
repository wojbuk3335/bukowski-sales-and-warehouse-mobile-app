// Szukaj (panel użytkownika), 3.11.2026: lista pokazuje DOSTĘPNOŚĆ w punkcie, nie każdą sztukę - jeden wiersz na
// model + rozmiar + punkt („Ada CZERWONY M · MAGAZYN”), bez liczby sztuk. Dawniej 200 sztuk w magazynie dawało
// 200 wierszy. Kolejność wierszy = kolejność pierwszej sztuki na liście (stan jest już posortowany po nazwie).
const rowKey = (item) => `${item.fullName || ''}|${item.size || ''}|${item.symbol || ''}`;

export const groupAvailability = (items) => {
  const rows = new Map();
  (items || []).forEach((item) => {
    const key = rowKey(item);
    const row = rows.get(key);
    if (row) {
      row.count += 1;
      if (!row.barcode && item.barcode) row.barcode = item.barcode;
      return;
    }
    rows.set(key, {
      id: key,
      fullName: item.fullName,
      size: item.size,
      symbol: item.symbol,
      color: item.color,
      barcode: item.barcode,
      count: 1,
    });
  });
  return [...rows.values()];
};

export default groupAvailability;
