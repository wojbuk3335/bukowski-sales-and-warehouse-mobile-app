// Układ metki (ZPL, drukarka Zebra 300 dpi, metka 50 mm = 590 punktów szerokości) - JEDNO źródło wyglądu metki.
// KOPIA 1:1 z serwera (backend/api/app/utils/labelZpl.js) - wydruk zapasowy, gdy serwer nie odpowie.
// Ta sama funkcja jest w panelu (frontend/src/utils/labelZpl.js) i aplikacji mobilnej
// (utils/labelZpl.js) dla wydruku zapasowego - zmieniając układ, zmień wszystkie trzy kopie.
//
//  ┌──────────────────────────────────────────┐
//  │ Agnieszka 04             Punkt: 01 │  6  │  nazwa | punkt          | cena obrócona o 90° w prawo:
//  │   ▌▌▐ ▌▐▐▌ ▌▌▐▐ ▌ ▐▌▌▐ ▐▌ ▌▐▌ ▌▐   │  5  │  kod - wysoki, wyśrodkowany | po obróceniu metki w lewo
//  │   ▌▌▐ ▌▐▐▌ ▌▌▐▐ ▌ ▐▌▌▐ ▐▌ ▌▐▌ ▌▐   │  0  │  z marginesami              | „650 zł” czyta się normalnie,
//  │ 8XL        0040408300005           │ zł  │  rozmiar | cyfry kodu       | duża, pogrubiona
//  └──────────────────────────────────────────┘
//
// Drukarka ma 300 dpi (wcześniejsze ^PW450 drukowało tylko 38 z 50 mm szerokości - prawy pas metki zostawał pusty,
// a kreska 2 pkt = 0,17 mm była za cienka dla aparatu). Treść w pionie kończy się na ok. 292 punktach.
// Kod: Code 128 w trybie automatycznym (cyfry parami - kod krótszy). NIE EAN-13: kod EAN-13 zaczynający się od zera
// jest jednocześnie UPC-A i skanery w telefonach obcinają pierwsze zero (0040408300005 -> 040408300005), a prawie
// wszystkie nasze kody zaczynają się od zera. Code 128 czyta się dokładnie tak, jak jest wydrukowany.
// Grubość kreski: największa, przy której kod mieści się w lewej części metki z białym marginesem. Kreska 4 pkt
// (0,34 mm - decyzja użytkownika: grubsza kreska ważniejsza niż duża cena) z marginesem 6 szerokości kreski
// (ok. 2 mm), cieńsze kreski z pełnym marginesem 10 szerokości kreski.

const LABEL_WIDTH = 590; // 50 mm przy 300 dpi
const LABEL_HEIGHT = 400;
const EDGE = 12;
const PRICE_FONT = 40; // wysokość liter ceny = szerokość kolumny ceny (mniejsza cena = miejsce na kreskę 4 pkt)
const PRICE_X = LABEL_WIDTH - 4 - PRICE_FONT; // cena dosunięta maksymalnie do prawej krawędzi
const PRICE_LENGTH = 285; // długość pola ceny (wzdłuż krawędzi), cena wyśrodkowana
const AREA_WIDTH = PRICE_X - 6; // lewa część metki: nazwa, kod, rozmiar
const BARCODE_TOP = 52;
const BARCODE_HEIGHT = 190; // wcześniej 85 - wyższy kod łatwiej złapać aparatem
const BOTTOM_LINE = BARCODE_TOP + BARCODE_HEIGHT + 6; // linia rozmiar | cyfry kodu

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

// Grubość kreski i położenie: największa kreska, przy której kod mieści się w lewej części
// z wymaganym białym marginesem (kod wyśrodkowany - marginesy wychodzą równe)
const barcodeGeometry = (data, areaWidth = AREA_WIDTH) => {
    const modules = code128Modules(data);
    let moduleWidth = 1;
    for (const width of [4, 3, 2]) {
        const quietModules = 2 * (width >= 4 ? 6 : 10);
        if ((modules + quietModules) * width <= areaWidth) {
            moduleWidth = width;
            break;
        }
    }
    const width = modules * moduleWidth;
    return { moduleWidth, width, x: Math.max(0, Math.round((areaWidth - width) / 2)) };
};

const isUndefinedSize = (size) => {
    const value = String(size || '').trim().toUpperCase();
    return !value || ['!NIEOKREŚLONY', 'NIEOKREŚLONY', 'NO SIZE', 'N/A', '-'].includes(value);
};

// Tekst pogrubiony: ten sam napis drukowany drugi raz przesunięty o 1 punkt (2 dawało podwójny obrys)
const boldField = (x, y, font, block, hex, rotation = 'N') => [
    `^FO${x},${y}^A0${rotation},${font},${font}${block}^FH_^FD${hex}^FS`,
    `^FO${x + 1},${y}^A0${rotation},${font},${font}${block}^FH_^FD${hex}^FS`,
].join('\n');

const buildLabelZpl = ({ productName, price, size, pointNumber, barcode } = {}) => {
    const name = (productName || 'N/A').toString();
    const priceText = price !== null && price !== undefined && price !== '' ? `${price} zł` : '';
    const sizeText = isUndefinedSize(size) ? '' : String(size).trim();
    const pointText = `Punkt: ${pointNumber || 'N/A'}`;
    const code = (barcode || 'NO-BARCODE').toString().trim();

    const pointWidth = 110;
    const nameWidth = AREA_WIDTH - EDGE - pointWidth - 6;
    const { moduleWidth, x: barcodeX } = barcodeGeometry(code);
    const digitsFont = code.length > 15 ? 18 : 22;

    const lines = [
        '^XA',
        '^CI28',
        '^MMT',
        `^PW${LABEL_WIDTH}`,
        `^LL${String(LABEL_HEIGHT).padStart(4, '0')}`,
        '^LS0',
        // nazwa: lewy górny róg, jedna linia (kod zaraz pod nią)
        `^FO${EDGE},12^A0N,28,28^FB${nameWidth},1,0,L,0^FH_^FD${toZplUtf8Hex(name)}^FS`,
        // punkt: górny róg lewej części, obok nazwy
        `^FO${AREA_WIDTH - pointWidth},16^A0N,22,22^FB${pointWidth},1,0,R,0^FH_^FD${toZplUtf8Hex(pointText)}^FS`,
    ];
    if (priceText) {
        // cena: obrócona o 90° w prawo (R) wzdłuż prawej krawędzi - po obróceniu metki w lewo czyta się normalnie;
        // duża, pogrubiona, bez słowa „Cena”
        lines.push(boldField(PRICE_X, 10, PRICE_FONT, `^FB${PRICE_LENGTH},1,0,C,0`, toZplUtf8Hex(priceText), 'R'));
    }
    lines.push(
        // kod: wyśrodkowany w lewej części, tryb automatyczny (A), bez napisu pod kreskami (cyfry osobno niżej)
        `^BY${moduleWidth},3,${BARCODE_HEIGHT}`,
        `^FO${barcodeX},${BARCODE_TOP}^BCN,${BARCODE_HEIGHT},N,N,N,A^FD${code}^FS`,
        // cyfry kodu: pod kodem, wyśrodkowane w lewej części
        `^FO0,${BOTTOM_LINE + 14}^A0N,${digitsFont},${digitsFont}^FB${AREA_WIDTH},1,0,C,0^FD${code}^FS`,
    );
    if (sizeText) {
        // rozmiar: lewy dolny róg, duży, pogrubiony
        lines.push(boldField(EDGE, BOTTOM_LINE, 44, '', toZplUtf8Hex(sizeText)));
    }
    lines.push('^XZ');
    return lines.join('\n');
};

export { buildLabelZpl, barcodeGeometry, code128Modules, toZplUtf8Hex };
