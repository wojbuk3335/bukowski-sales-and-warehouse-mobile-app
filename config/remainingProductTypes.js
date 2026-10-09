// Typy produktów w „Tabeli pozostałego asortymentu” (Poz_Kod) i wzorce ich kodów z metek.
// Kopia listy z backend/api/app/config/remainingProductTypes.js – serwer sprawdza format niezależnie.
export const REMAINING_PRODUCT_TYPES = [
    { value: 'Pasek', label: 'Pasek', pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'APS 120' },
    { value: 'Rękawiczka', label: 'Rękawiczka', pattern: '^[A-Z]{2} \\d{3}\\.\\d{3}$', formatHint: '2 duże litery, spacja, 3 cyfry, kropka, 3 cyfry', example: 'IR 161.590' },
    { value: 'Impregnat', label: 'Impregnat', pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'IMP 054' },
    { value: 'Pasta', label: 'Pasta', pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'PAS 054' },
    { value: 'Pompon', label: 'Pompon', pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'POM 054' },
    { value: 'Kapa', label: 'Kapa', pattern: '^[A-Z]{2} \\d{2}\\.\\d [A-Z]{2}$', formatHint: '2 duże litery, spacja, 2 cyfry, kropka, 1 cyfra, spacja, 2 duże litery', example: 'JR 05.5 DW' },
    { value: 'Czapka', label: 'Czapka', pattern: '^[A-Z]{2} \\d{2}$', formatHint: '2 duże litery, spacja, 2 cyfry', example: 'MK 04' },
    { value: 'Kołnierz', label: 'Kołnierz', pattern: null, formatHint: 'wzór kodu zostanie ustalony po otrzymaniu metki', example: '' },
    { value: 'Opaska', label: 'Opaska', pattern: '^[A-Z]{2} \\d{2}\\.\\d{3}$', formatHint: '2 duże litery, spacja, 2 cyfry, kropka, 3 cyfry', example: 'LT 02.422' }
];

export const getRemainingProductType = (value) => REMAINING_PRODUCT_TYPES.find((type) => type.value === value) || null;

export const normalizeRemainingProductCode = (code) => String(code ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

export const validateRemainingProductCode = (productType, code) => {
    const normalized = normalizeRemainingProductCode(code);
    if (!normalized) return { valid: true, code: '' };
    const type = getRemainingProductType(productType);
    if (!type) return { valid: false, message: 'Wybierz typ produktu (pasek, rękawiczka, czapka, …), aby zapisać kod' };
    if (normalized.length > 100) return { valid: false, message: 'Poz_Kod może mieć maksymalnie 100 znaków' };
    if (type.pattern && !new RegExp(type.pattern).test(normalized)) {
        return {
            valid: false,
            message: `Nieprawidłowy kod dla typu „${type.label}”. Wymagany wzór: ${type.formatHint}, np. ${type.example}`,
            formatHint: type.formatHint,
            example: type.example
        };
    }
    return { valid: true, code: normalized };
};
