// Układ metki (ZPL, drukarka Zebra, metka 450 x 400 punktów) - JEDNO źródło wyglądu metki.
// KOPIA 1:1 z serwera (backend/api/app/utils/labelZpl.js) - wydruk zapasowy, gdy serwer nie odpowie.
// Ta sama funkcja jest w panelu (frontend/src/utils/labelZpl.js) i aplikacji mobilnej
// (utils/labelZpl.js) dla wydruku zapasowego - zmieniając układ, zmień wszystkie trzy kopie.
//
//  ┌──────────────────────────────────────────┐
//  │ Amanda CZARNY                      888 zł │  nazwa (do 2 linii) | cena - duża, pogrubiona
//  │  ▌▌▐ ▌▐▐▌ ▌▌▐▐ ▌ ▐▌▌▐ ▐▌ ▌▐▌▌ ▐▐ ▌▐▌ ▌▐   │  kod - duży, wyśrodkowany, z marginesami
//  │ 2XL         0100600300002     Punkt: 01   │  rozmiar - pogrubiony | cyfry kodu | punkt
//  └──────────────────────────────────────────┘
//
// Fizyczna metka ma ok. 310 punktów wysokości (ok. 38 mm, zmierzone na wydruku) - treść kończy się na ok. 292.
//
// Kod: Code 128 w trybie automatycznym (cyfry parami - kod krótszy), grubość kreski 3 punkty, gdy się mieści
// z pełnymi marginesami (min. 10 szerokości kreski z każdej strony), inaczej 2, w ostateczności 1.

const LABEL_WIDTH = 450;
const LABEL_HEIGHT = 400;
const EDGE = 12;
const BARCODE_TOP = 92;
const BARCODE_HEIGHT = 145; // wcześniej 85 - wyższy kod łatwiej złapać aparatem
const BOTTOM_LINE = BARCODE_TOP + BARCODE_HEIGHT + 8; // linia rozmiar | cyfry | punkt

const toZplUtf8Hex = (text) => {
    const value = (text ?? '').toString().replace(/\s+/g, ' ').trim();
    const bytes = typeof Buffer !== 'undefined'
        ? Array.from(Buffer.from(value, 'utf8'))
        : Array.from(new TextEncoder().encode(value));
    return bytes.map((b) => `_${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');
};

// Szerokość kodu Code 128 w modułach (tryb automatyczny: same cyfry kodowane parami)
const code128Modules = (data) => {
    const value = String(data || '');
    const n = value.length;
    if (/^\d+$/.test(value)) {
        // start C + pary cyfr (+ przełączenie na B i ostatnia cyfra przy nieparzystej liczbie) + suma kontrolna + stop
        const symbols = n % 2 === 0 ? 1 + n / 2 + 1 : 1 + (n - 1) / 2 + 2 + 1;
        return symbols * 11 + 13;
    }
    return (1 + n + 1) * 11 + 13; // start B + znaki + suma kontrolna + stop
};

// Grubość kreski i położenie: największa kreska, przy której kod mieści się z marginesami po obu stronach
const barcodeGeometry = (data) => {
    const modules = code128Modules(data);
    let moduleWidth = 1;
    for (const width of [3, 2]) {
        if (modules * width + 2 * 10 * width <= LABEL_WIDTH - 2 * 4) {
            moduleWidth = width;
            break;
        }
    }
    const width = modules * moduleWidth;
    return { moduleWidth, width, x: Math.max(0, Math.round((LABEL_WIDTH - width) / 2)) };
};

const isUndefinedSize = (size) => {
    const value = String(size || '').trim().toUpperCase();
    return !value || ['!NIEOKREŚLONY', 'NIEOKREŚLONY', 'NO SIZE', 'N/A', '-'].includes(value);
};

// Tekst pogrubiony: ten sam napis drukowany drugi raz przesunięty o 1 punkt (2 dawało podwójny obrys)
const boldField = (x, y, font, block, hex) => [
    `^FO${x},${y}^A0N,${font},${font}${block}^FH_^FD${hex}^FS`,
    `^FO${x + 1},${y}^A0N,${font},${font}${block}^FH_^FD${hex}^FS`,
].join('\n');

const buildLabelZpl = ({ productName, price, size, pointNumber, barcode } = {}) => {
    const name = (productName || 'N/A').toString();
    const priceText = price !== null && price !== undefined && price !== '' ? `${price} zł` : '';
    const sizeText = isUndefinedSize(size) ? '' : String(size).trim();
    const pointText = `Punkt: ${pointNumber || 'N/A'}`;
    const code = (barcode || 'NO-BARCODE').toString().trim();

    const priceWidth = 250; // mieści „22121 zł” czcionką 80
    const priceX = LABEL_WIDTH - EDGE - priceWidth;
    const nameWidth = priceX - EDGE - 8;
    const { moduleWidth, x: barcodeX } = barcodeGeometry(code);
    const digitsFont = code.length > 15 ? 18 : 24;

    const lines = [
        '^XA',
        '^CI28',
        '^MMT',
        `^PW${LABEL_WIDTH}`,
        `^LL${String(LABEL_HEIGHT).padStart(4, '0')}`,
        '^LS0',
        // nazwa: lewy górny róg, do 2 linii, żeby nie wchodziła na cenę
        `^FO${EDGE},14^A0N,30,30^FB${nameWidth},2,0,L,0^FH_^FD${toZplUtf8Hex(name)}^FS`,
    ];
    if (priceText) {
        // cena: prawy górny róg, duża, pogrubiona, bez słowa „Cena”
        lines.push(boldField(priceX, 6, 80, `^FB${priceWidth},1,0,R,0`, toZplUtf8Hex(priceText)));
    }
    lines.push(
        // kod: wyśrodkowany, tryb automatyczny (A), bez napisu kreskowego (cyfry osobno niżej)
        `^BY${moduleWidth},3,${BARCODE_HEIGHT}`,
        `^FO${barcodeX},${BARCODE_TOP}^BCN,${BARCODE_HEIGHT},N,N,N,A^FD${code}^FS`,
        `^FO0,${BOTTOM_LINE + 10}^A0N,${digitsFont},${digitsFont}^FB${LABEL_WIDTH},1,0,C,0^FD${code}^FS`,
    );
    if (sizeText) {
        // rozmiar: lewy dolny róg, duży, pogrubiony
        lines.push(boldField(EDGE, BOTTOM_LINE, 46, '', toZplUtf8Hex(sizeText)));
    }
    if (pointText) {
        // punkt: prawy dolny róg
        lines.push(`^FO${LABEL_WIDTH - EDGE - 120},${BOTTOM_LINE + 10}^A0N,24,24^FB120,1,0,R,0^FH_^FD${toZplUtf8Hex(pointText)}^FS`);
    }
    lines.push('^XZ');
    return lines.join('\n');
};

export { buildLabelZpl, barcodeGeometry, code128Modules, toZplUtf8Hex };
