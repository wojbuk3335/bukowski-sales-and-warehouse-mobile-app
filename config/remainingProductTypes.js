// Pozostały asortyment: typy produktów (wiersze „Tabeli pozostałego asortymentu” z kodem z metki)
// i ich podkategorie w formularzu Dodaj produkt. Kopia listy z backend/api/app/config/remainingProductTypes.js.
//   value – typ produktu przy kodzie (Poz_Kod), key – klucz podkategorii w produkcie (goods.subcategory),
//   plural – nazwa podkategorii, hasSubcategoryTable – typ ma tabelę podpodkategorii (Pasek damski / męski …)
export const REMAINING_PRODUCT_TYPES = [
    { value: 'Pasek', key: 'belts', label: 'Pasek', plural: 'Paski', hasSubcategoryTable: true, pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'APS 120' },
    { value: 'Rękawiczka', key: 'gloves', label: 'Rękawiczka', plural: 'Rękawiczki', hasSubcategoryTable: true, pattern: '^[A-Z]{2} \\d{3}\\.\\d{3}$', formatHint: '2 duże litery, spacja, 3 cyfry, kropka, 3 cyfry', example: 'IR 161.590' },
    { value: 'Impregnat', key: 'impregnates', label: 'Impregnat', plural: 'Impregnaty', hasSubcategoryTable: false, pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'IMP 054' },
    { value: 'Pasta', key: 'pastes', label: 'Pasta', plural: 'Pasty', hasSubcategoryTable: false, pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'PAS 054' },
    { value: 'Pompon', key: 'pompoms', label: 'Pompon', plural: 'Pompony', hasSubcategoryTable: false, pattern: '^[A-Z]{3} \\d{3}$', formatHint: '3 duże litery, spacja, 3 cyfry', example: 'POM 054' },
    { value: 'Kapa', key: 'capes', label: 'Kapa', plural: 'Kapy', hasSubcategoryTable: false, pattern: '^[A-Z]{2} \\d{2}\\.\\d [A-Z]{2}$', formatHint: '2 duże litery, spacja, 2 cyfry, kropka, 1 cyfra, spacja, 2 duże litery', example: 'JR 05.5 DW' },
    { value: 'Czapka', key: 'caps', label: 'Czapka', plural: 'Czapki', hasSubcategoryTable: true, pattern: '^[A-Z]{2} \\d{2}$', formatHint: '2 duże litery, spacja, 2 cyfry', example: 'MK 04' },
    { value: 'Kołnierz', key: 'collars', label: 'Kołnierz', plural: 'Kołnierze', hasSubcategoryTable: false, pattern: null, formatHint: 'wzór kodu zostanie ustalony po otrzymaniu metki', example: '' },
    { value: 'Opaska', key: 'headbands', label: 'Opaska', plural: 'Opaski', hasSubcategoryTable: false, pattern: '^[A-Z]{2} \\d{2}\\.\\d{3}$', formatHint: '2 duże litery, spacja, 2 cyfry, kropka, 3 cyfry', example: 'LT 02.422' }
];

export const getRemainingProductType = (value) => REMAINING_PRODUCT_TYPES.find((type) => type.value === value) || null;
export const getRemainingProductTypeByKey = (key) => REMAINING_PRODUCT_TYPES.find((type) => type.key === key) || null;

// Podkategorie pozostałego asortymentu w formularzu Dodaj produkt i filtrach raportów
export const REMAINING_SUBCATEGORY_OPTIONS = REMAINING_PRODUCT_TYPES.map((type) => ({ _id: type.key, Rem_Kat_1_Opis_1: type.plural, type: 'static' }));
export const REMAINING_CATEGORY_FILTER_OPTIONS = REMAINING_PRODUCT_TYPES.map((type) => ({ value: type.plural, label: type.plural }));

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

// 3 cyfry z kodu z metki do kodu kreskowego: po kropce, gdy jest kropka (IR 161.590 → 590), inaczej końcowe cyfry (MK 04 → 004)
export const remainingCodeDigits = (code) => {
    const normalized = normalizeRemainingProductCode(code);
    const afterDot = normalized.match(/\.(\d+)/);
    const trailing = normalized.match(/(\d+)\s*(?:[A-Z]+)?$/);
    const digits = afterDot ? afterDot[1] : (trailing ? trailing[1] : '');
    return digits.slice(-3).padStart(3, '0');
};

// Nazwy podkategorii do list filtrów w raportach i na etykietach
export const REMAINING_CATEGORY_LABELS = REMAINING_PRODUCT_TYPES.map((type) => type.plural);
