// D7 (audyt Dobierania 25.10.2026): pozycje, które serwer pominął przy przetwarzaniu (np. sprzedaż usunięta
// po otwarciu ekranu, przepisanie anulowane, kurtka przyjęta już w innym oknie). Dawniej serwer odpowiadał
// „sukces”, a telefon nic o nich nie mówił. Ten sam tekst co w panelu (frontend/src/utils/batchSkippedMessages.js).
import { pointNameBySymbol } from './pointName';

const KIND_LABELS = {
  sale: 'Sprzedaż',
  transfer: 'Przepisanie',
  incoming: 'Przyjęcie',
  warehouse: 'Z magazynu',
};

export const describeSkipped = (entry, users) => {
  const kind = KIND_LABELS[entry?.kind] || 'Pozycja';
  const name = entry?.fullName || 'bez nazwy';
  const size = entry?.size && entry.size !== '-' ? ` ${entry.size}` : '';
  const point = entry?.point
    ? (String(entry.point).toUpperCase() === 'MAGAZYN' ? 'MAGAZYN' : pointNameBySymbol(users, entry.point))
    : '';
  const where = point ? ` (${point})` : '';
  const reason = entry?.reason || 'pominięta';
  return `${kind}: ${name}${size}${where} - ${reason}`;
};

export const skippedCountLabel = (count) => {
  const n = Number(count) || 0;
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return '1 pozycję';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} pozycje`;
  return `${n} pozycji`;
};

export const skippedFromBatchResult = (batchResult) => (
  Array.isArray(batchResult?.skipped) ? batchResult.skipped.filter(Boolean) : []
);
