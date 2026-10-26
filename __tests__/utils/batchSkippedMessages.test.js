// D7: opisy pozycji pominiętych przez serwer przy przetwarzaniu w Dobieraniu (telefon)
import { describeSkipped, skippedCountLabel, skippedFromBatchResult } from '../../utils/batchSkippedMessages';

const users = [{ symbol: 'T', sellingPoint: 'Tata', role: 'user' }];

describe('batchSkippedMessages (mobile)', () => {
  test('opis: rodzaj, nazwa, rozmiar, pełna nazwa punktu i powód', () => {
    expect(describeSkipped({ kind: 'sale', fullName: 'Ada CZERWONY', size: 'XL', point: 'T', reason: 'Tej sprzedaży już nie ma (usunięta)' }, users))
      .toBe('Sprzedaż: Ada CZERWONY XL (Tata) - Tej sprzedaży już nie ma (usunięta)');
    expect(describeSkipped({ kind: 'incoming', fullName: 'Torebka A', size: '-', point: 'MAGAZYN', reason: 'Już przyjęte wcześniej' }, users))
      .toBe('Przyjęcie: Torebka A (MAGAZYN) - Już przyjęte wcześniej');
  });

  test('odmiana i pusta odpowiedź', () => {
    expect(skippedCountLabel(1)).toBe('1 pozycję');
    expect(skippedCountLabel(4)).toBe('4 pozycje');
    expect(skippedCountLabel(13)).toBe('13 pozycji');
    expect(skippedFromBatchResult({})).toEqual([]);
  });
});
