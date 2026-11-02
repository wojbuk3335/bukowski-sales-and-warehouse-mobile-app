import { pickPrimaryLens } from '../../components/scanner/iosLens';

// iPhone: z listy obiektywów (nazwy przetłumaczone przez system) wybieramy zwykły szeroki aparat główny -
// zawsze ma najkrótszą nazwę, pozostałe to ta sama nazwa z dopiskiem (Ultra Wide, Telephoto, Dual, Triple).
describe('pickPrimaryLens', () => {
    it('iPhone Pro po angielsku: „Back Camera” spośród wirtualnych i pozostałych obiektywów', () => {
        expect(pickPrimaryLens([
            'Back Dual Camera', 'Back Dual Wide Camera', 'Back Camera', 'Back Telephoto Camera', 'Back Triple Camera', 'Back Ultra Wide Camera',
        ])).toBe('Back Camera');
    });

    it('nazwy po polsku: aparat główny bez dopisku', () => {
        expect(pickPrimaryLens(['Tylny aparat ultraszerokokątny', 'Tylny aparat', 'Tylny aparat z dwoma obiektywami'])).toBe('Tylny aparat');
    });

    it('iPhone z jednym obiektywem (SE): ten jeden', () => {
        expect(pickPrimaryLens(['Back Camera'])).toBe('Back Camera');
    });

    it('brak listy / pusta / śmieci -> null; puste wpisy pomijane', () => {
        expect(pickPrimaryLens(undefined)).toBeNull();
        expect(pickPrimaryLens([])).toBeNull();
        expect(pickPrimaryLens(['', null, '  '])).toBeNull();
        expect(pickPrimaryLens(['', 'Back Camera', null])).toBe('Back Camera');
    });

    it('ta sama długość -> wybór stabilny (alfabetycznie), niezależnie od kolejności z systemu', () => {
        expect(pickPrimaryLens(['Lens B', 'Lens A'])).toBe('Lens A');
        expect(pickPrimaryLens(['Lens A', 'Lens B'])).toBe('Lens A');
    });
});
