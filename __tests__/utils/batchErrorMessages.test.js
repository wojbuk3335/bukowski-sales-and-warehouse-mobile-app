// Komunikaty błędów zapisu w Dobieraniu (telefon) - dawniej surowy tekst odpowiedzi serwera
import { batchErrorToPolish } from '../../utils/batchErrorMessages';

describe('batchErrorToPolish (mobile)', () => {
  test('kolizja zapisu → polski opis i co zrobić, bez wzmianki o F5', () => {
    const out = batchErrorToPolish(409, { code: 'ITEM_ALREADY_IN_TRANSFER', message: 'Item transfer conflict' });
    expect(out.message).toContain('w innym oknie, w telefonie');
    expect(out.instruction).not.toContain('F5');
  });

  test('polski komunikat serwera (np. zły numer pozycji) → bez zmian', () => {
    const out = batchErrorToPolish(400, { code: 'INVALID_ITEM_ID', message: 'Nieprawidłowy numer przepisania: abc. Odśwież stronę (F5) i zapisz ponownie.' });
    expect(out.message).toContain('Nieprawidłowy numer przepisania: abc');
  });

  test('błąd serwera bez opisu → ogólny polski komunikat', () => {
    expect(batchErrorToPolish(500, { message: 'Failed to process batch' }).message).toBe('Błąd serwera podczas zapisu.');
  });
});
