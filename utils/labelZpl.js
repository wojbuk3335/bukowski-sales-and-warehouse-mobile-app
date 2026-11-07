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
// Kod: od 7.11.2026 domyślnie EAN-13 (kod z poprawną cyfrą kontrolną; inny zostaje w Code 128, a Code 128 da się
// wymusić: barcodeFormat 'code128'). EAN-13 drukuje się STANDARDOWO (^BE z linią cyfr = Y): przedłużone kreski skrajne
// i środkowa, pierwsza cyfra przed kodem, dwie grupy po 6 cyfr - cyfry rysuje drukarka, nie osobne pole tekstowe.
// Kod zaczynający się od zera jest jednocześnie UPC-A - telefon może oddać 12 cyfr; aplikacja mobilna dopisuje zero
// (smartScanLogic.restoreLeadingZero). Dawniej (do 7.11) domyślny był Code 128 w trybie automatycznym.
// Grubość kreski: największa, przy której kod mieści się w lewej części metki z PEŁNYM białym marginesem
// 10 szerokości kreski z każdej strony (norma Code 128). 26.10.2026: dawniej kreska 4 pkt z marginesem tylko 6X
// (2,0 mm z lewej, 2,5 mm do obróconej ceny) - aparat w telefonie nie znajdował końca kodu (cena tuż przy
// kreskach działa jak kolejne kreski), kod z ekranu czytał się od razu, z metki nie. Dla 13 cyfr wychodzi kreska
// 3 pkt (0,25 mm, kod 31 mm, po ok. 5,5 mm bieli z każdej strony przy cenie 80 pkt). Druk najwolniejszy (^PR2) - równiejsze krawędzie.
//
// 7.11.2026 (etap 1 edytora metek): układ metki jest DANYMI (DEFAULT_LABEL_LAYOUT - dokładnie dzisiejsza metka), a nie
// stałymi w kodzie. buildLabelZpl({ ..., layout }) rysuje metkę z podanego układu; bez layout - z domyślnego, czyli
// bajt w bajt jak dotąd. Serwer trzyma zapisany układ w bazie (LabelLayout) i każdy wydruk (panel, telefon) dostaje go
// przez /api/print/generate-zpl. LABEL_PRESETS: 'full' = układ domyślny, 'ean_only' = sam kod z cyframi, nic więcej
// (próba: czy teksty obok kodu przeszkadzają aparatowi). Kod kreskowy NIE jest skalowany dowolnie - grubość kreski
// i strefy ciszy wynikają z normy (barcodeGeometry); układ ustala tylko pole, w którym kod jest wyśrodkowany, i wysokość.

const LABEL_WIDTH = 590; // 50 mm przy 300 dpi
const LABEL_HEIGHT = 400;
const PRINT_SPEED_IPS = 2; // najwolniejszy druk (2 cale/s): równe krawędzie kresek ważniejsze niż czas wydruku
const PRINT_DARKNESS = 12; // domyślne zaczernienie (^MD, względem ustawienia drukarki) - do korekty po próbie przy drukarce
const MIN_MODULE_WIDTH = 3; // kreska nigdy cieńsza niż 3 pkt (0,25 mm) - 2 pkt (stare metki) aparat czytał źle
const MAX_MODULE_WIDTH = 8; // najgrubsza kreska do wyboru w edytorze (0,68 mm) - EAN-13 ma wtedy 64 mm, więcej nie ma sensu
const QUIET_ZONE_MODULES = 10; // biały margines z każdej strony kodu: 10 szerokości kreski (norma Code 128)
const EDGE = 12;
const PRICE_FONT = 80; // wysokość liter ceny (6,8 mm) = szerokość kolumny ceny; 27.10.2026 dwa razy większa (było 40) - decyzja właściciela
const PRICE_X = LABEL_WIDTH - 4 - PRICE_FONT; // cena dosunięta maksymalnie do prawej krawędzi
const PRICE_LENGTH = 285; // długość pola ceny (wzdłuż krawędzi), cena wyśrodkowana
const AREA_WIDTH = PRICE_X - 6; // lewa część metki: nazwa, kod, rozmiar
const POINT_WIDTH = 110;
const BARCODE_TOP = 52;
// 7.11.2026: kreski 150 pkt (12,7 mm, było 190 = 16 mm) - pod nimi cyfry EAN-13 sięgają lewej krawędzi (pierwsza cyfra
// przed kodem), więc rozmiar idzie POD cyfry zamiast obok nich (decyzja właściciela). Kod nadal dość wysoki dla aparatu.
const BARCODE_HEIGHT = 150;
const DIGITS_TOP = BARCODE_TOP + BARCODE_HEIGHT + 10; // cyfry Code 128 (osobne pole) - tuż pod kreskami
const BOTTOM_LINE = BARCODE_TOP + BARCODE_HEIGHT + 46; // rozmiar: pod cyframi kodu (248 pkt, kończy się na 292 z 295)
// Ile miejsca pod kreskami zajmują cyfry EAN-13 rysowane przez drukarkę (przedłużone kreski + linia cyfr) - SZACUNEK
// ok. 10 szerokości kreski (przy kresce 4 pkt: 40 pkt = 3,4 mm); służy edytorowi do ostrzeżeń, ZPL go nie używa.
const EAN13_DIGITS_MODULES = 10;

// Układ domyślny (wszystkie wartości w punktach drukarki, 300 dpi: 1 mm = 11,8 pkt).
// barcode.area: pole, w którym kod jest wyśrodkowany (grubość kreski liczona tak, by zmieścił się z marginesami);
// digits: cyfry kodu pod kreskami. EAN-13: show = drukarka rysuje standardowe cyfry (y / font nieużywane);
// Code 128: osobne pole wyśrodkowane w polu kodu na wysokości y (fontLong dla kodów dłuższych niż 15 znaków).
// price.rotation: 'R' = obrócona o 90° wzdłuż prawej krawędzi (jak dotąd), 'N' = pozioma.
// barcodeFormat (8.11.2026): format kodu ustawiany WYŁĄCZNIE w Ustawieniach wydruku → Metki ('ean13' | 'code128').
// barcode.moduleWidth: grubość kreski w punktach (3-8); 0 = automatycznie (największa, przy której kod mieści się w polu
// z pełną strefą ciszy). Edytor zmienia ją razem z wysokością kresek - kod skaluje się zawsze proporcjonalnie.
// name.variant: która nazwa produktu (serwer, labelService.productNameForLabel): 'code' = nazwa bez słowa koloru + kod
// koloru (jak dotąd), 'model' = sama nazwa modelu (bez koloru i kodu), 'full' = pełna nazwa z kolorem.
const DEFAULT_LABEL_LAYOUT = {
    version: 1,
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    speed: PRINT_SPEED_IPS,
    darkness: PRINT_DARKNESS,
    barcodeFormat: 'ean13',
    barcode: { show: true, area: { x: 0, width: AREA_WIDTH }, y: BARCODE_TOP, height: BARCODE_HEIGHT, moduleWidth: 0, digits: { show: true, y: DIGITS_TOP, font: 30, fontLong: 24 } },
    name: { show: true, x: EDGE, y: 12, font: 28, width: AREA_WIDTH - EDGE - POINT_WIDTH - 6, variant: 'code' },
    point: { show: true, x: AREA_WIDTH - POINT_WIDTH, y: 16, font: 22, width: POINT_WIDTH },
    price: { show: true, x: PRICE_X, y: 10, font: PRICE_FONT, length: PRICE_LENGTH, rotation: 'R', bold: true },
    size: { show: true, x: EDGE, y: BOTTOM_LINE, font: 44, bold: true },
};

// Gotowe układy: 'full' = domyślny; 'ean_only' = sam kod z cyframi, wyśrodkowany na całej szerokości metki,
// bez nazwy, punktu, ceny i rozmiaru (ta sama wysokość i grubość kreski co na pełnej metce - zmienia się tylko otoczenie)
const LABEL_PRESETS = {
    full: DEFAULT_LABEL_LAYOUT,
    ean_only: {
        ...DEFAULT_LABEL_LAYOUT,
        barcode: { show: true, area: { x: 0, width: LABEL_WIDTH }, y: BARCODE_TOP, height: BARCODE_HEIGHT, moduleWidth: 0, digits: { show: true, y: DIGITS_TOP, font: 30, fontLong: 24 } },
        name: { ...DEFAULT_LABEL_LAYOUT.name, show: false },
        point: { ...DEFAULT_LABEL_LAYOUT.point, show: false },
        price: { ...DEFAULT_LABEL_LAYOUT.price, show: false },
        size: { ...DEFAULT_LABEL_LAYOUT.size, show: false },
    },
};

const clampInt = (value, fallback, min, max) => {
    const n = Number(value);
    if (value === null || value === '' || !Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
};
const asBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const asObject = (value) => (value && typeof value === 'object' ? value : {});

// Układ z bazy / z edytora uzupełniony domyślnymi wartościami i przycięty do metki - buildLabelZpl nigdy nie dostaje
// śmieci. Szerokość i wysokość metki są stałe (fizyczna metka 50 x 25 mm, ^LL jak dotąd).
const normalizeLabelLayout = (raw) => {
    const d = DEFAULT_LABEL_LAYOUT;
    const r = asObject(raw);
    const text = (key, extra) => {
        const rd = d[key];
        const rr = asObject(r[key]);
        return {
            show: asBool(rr.show, rd.show),
            x: clampInt(rr.x, rd.x, 0, LABEL_WIDTH - 1),
            y: clampInt(rr.y, rd.y, 0, LABEL_HEIGHT - 1),
            font: clampInt(rr.font, rd.font, 10, 200),
            ...extra(rr, rd),
        };
    };
    const b = asObject(r.barcode);
    const area = asObject(b.area);
    const digits = asObject(b.digits);
    const areaX = clampInt(area.x, d.barcode.area.x, 0, LABEL_WIDTH - 100);
    return {
        version: 1,
        width: LABEL_WIDTH,
        height: LABEL_HEIGHT,
        speed: clampInt(r.speed, d.speed, 2, 6),
        darkness: clampInt(r.darkness, d.darkness, -30, 30),
        barcodeFormat: r.barcodeFormat === 'code128' ? 'code128' : 'ean13',
        barcode: {
            show: asBool(b.show, d.barcode.show),
            area: { x: areaX, width: clampInt(area.width, d.barcode.area.width, 100, LABEL_WIDTH - areaX) },
            y: clampInt(b.y, d.barcode.y, 0, LABEL_HEIGHT - 40),
            height: clampInt(b.height, d.barcode.height, 40, LABEL_HEIGHT),
            moduleWidth: Number(b.moduleWidth) === 0 || b.moduleWidth === undefined || b.moduleWidth === null || b.moduleWidth === '' ? 0 : clampInt(b.moduleWidth, 0, MIN_MODULE_WIDTH, MAX_MODULE_WIDTH),
            digits: {
                show: asBool(digits.show, d.barcode.digits.show),
                y: clampInt(digits.y, d.barcode.digits.y, 0, LABEL_HEIGHT - 1),
                font: clampInt(digits.font, d.barcode.digits.font, 10, 100),
                fontLong: clampInt(digits.fontLong, d.barcode.digits.fontLong, 10, 100),
            },
        },
        name: text('name', (rr, rd) => ({ width: clampInt(rr.width, rd.width, 20, LABEL_WIDTH), variant: ['code', 'model', 'full'].includes(rr.variant) ? rr.variant : rd.variant })),
        point: text('point', (rr, rd) => ({ width: clampInt(rr.width, rd.width, 20, LABEL_WIDTH) })),
        price: text('price', (rr, rd) => ({ length: clampInt(rr.length, rd.length, 20, LABEL_WIDTH), rotation: rr.rotation === 'N' ? 'N' : 'R', bold: asBool(rr.bold, rd.bold) })),
        size: text('size', (rr, rd) => ({ bold: asBool(rr.bold, rd.bold) })),
    };
};

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

// EAN-13 (próba 6.11.2026, domyślny od 7.11.2026): 95 modułów zamiast 123, więc na tej samej metce kreska ma 4 pkt (0,34 mm)
// zamiast 3 pkt (0,25 mm). Tylko dla kodu 13-cyfrowego z poprawną cyfrą kontrolną -
// drukarka sama liczy 13. cyfrę z pierwszych 12, więc kod ze złą cyfrą wydrukowałby się inny niż w systemie;
// taki kod zostaje w Code 128. UWAGA: EAN-13 zaczynający się od zera jest jednocześnie UPC-A - telefon / czytnik
// może oddać 12 cyfr bez pierwszego zera; aplikacja dopisuje je z powrotem (smartScanLogic.restoreLeadingZero).
const EAN13_MODULES = 95;
const EAN13_QUIET_MODULES = 11 + 7; // biały margines wg normy EAN: 11 kresek z lewej, 7 z prawej
const isValidEan13 = (data) => {
    const value = String(data ?? '').trim();
    if (!/^\d{13}$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === Number(value[12]);
};
// Format faktycznie drukowany / rysowany: 'ean13' (domyślnie, od 7.11.2026) albo 'code128' (na życzenie albo gdy kod
// nie jest poprawnym 13-cyfrowym EAN-13 - drukarka liczy 13. cyfrę sama, więc zły kod wydrukowałby się inny niż w bazie)
const resolveBarcodeFormat = (data, wanted) => (wanted !== 'code128' && isValidEan13(data) ? 'ean13' : 'code128');
// Wysokość cyfr EAN-13 pod kreskami (szacunek, patrz EAN13_DIGITS_MODULES)
const ean13DigitsHeight = (moduleWidth) => EAN13_DIGITS_MODULES * moduleWidth;
// Wymagana biel obok kodu w szerokościach kreski (edytor metek pilnuje, żeby teksty tam nie wchodziły)
const barcodeQuietZones = (format) => (format === 'ean13' ? { left: 11, right: 7 } : { left: QUIET_ZONE_MODULES, right: QUIET_ZONE_MODULES });

// Grubość kreski i położenie: największa kreska, przy której kod mieści się w lewej części
// z wymaganym białym marginesem (kod wyśrodkowany - marginesy wychodzą równe)
// fixedModule: grubość kreski ustawiona w układzie (3-8 pkt) - wtedy bez dopasowania do pola (edytor ostrzega o strefie ciszy)
const barcodeGeometry = (data, areaWidth = AREA_WIDTH, format = 'code128', fixedModule = 0) => {
    const ean13 = format === 'ean13';
    const modules = ean13 ? EAN13_MODULES : code128Modules(data);
    if (fixedModule >= MIN_MODULE_WIDTH) {
        const width = modules * fixedModule;
        return { moduleWidth: fixedModule, width, x: Math.max(0, Math.round((areaWidth - width) / 2)) };
    }
    let moduleWidth = MIN_MODULE_WIDTH;
    for (const width of [4, MIN_MODULE_WIDTH]) {
        const quietModules = ean13 ? EAN13_QUIET_MODULES : 2 * QUIET_ZONE_MODULES; // pełny margines z obu stron, dla każdej grubości
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
const textField = (x, y, font, block, hex, rotation = 'N', bold = false) => (bold
    ? boldField(x, y, font, block, hex, rotation)
    : `^FO${x},${y}^A0${rotation},${font},${font}${block}^FH_^FD${hex}^FS`);

// darkness: zaczernienie względem ustawienia drukarki (^MD, -30..30); bez podania - z układu (domyślnie PRINT_DARKNESS)
// barcodeFormat: 'code128' / 'ean13'; bez podania - z układu (domyślnie EAN-13; kod bez poprawnej cyfry kontrolnej - Code 128)
// layout: układ metki (z bazy / edytora / LABEL_PRESETS); bez podania - DEFAULT_LABEL_LAYOUT
const buildLabelZpl = ({ productName, price, size, pointNumber, barcode, darkness, barcodeFormat, layout } = {}) => {
    const L = normalizeLabelLayout(layout);
    const name = (productName || 'N/A').toString();
    const priceText = price !== null && price !== undefined && price !== '' ? `${price} zł` : '';
    const sizeText = isUndefinedSize(size) ? '' : String(size).trim();
    const pointText = `Punkt: ${pointNumber || 'N/A'}`;
    const code = (barcode || 'NO-BARCODE').toString().trim();

    const format = resolveBarcodeFormat(code, barcodeFormat || L.barcodeFormat);
    const { moduleWidth, x: barcodeX } = barcodeGeometry(code, L.barcode.area.width, format, L.barcode.moduleWidth);
    const digitsFont = code.length > 15 ? L.barcode.digits.fontLong : L.barcode.digits.font; // cyfry pod kodem ~2,5 mm (27.10.2026: było 22 = 1,9 mm; pod kodem jest ok. 6 mm miejsca)

    const lines = [
        '^XA',
        '^CI28',
        '^MMT',
        `^PR${L.speed},${L.speed},${L.speed}`,
        `^MD${clampInt(darkness, L.darkness, -30, 30)}`,
        `^PW${L.width}`,
        `^LL${String(L.height).padStart(4, '0')}`,
        '^LS0',
    ];
    if (L.name.show) {
        // nazwa: lewy górny róg, jedna linia (kod zaraz pod nią)
        lines.push(`^FO${L.name.x},${L.name.y}^A0N,${L.name.font},${L.name.font}^FB${L.name.width},1,0,L,0^FH_^FD${toZplUtf8Hex(name)}^FS`);
    }
    if (L.point.show) {
        // punkt: górny róg lewej części, obok nazwy
        lines.push(`^FO${L.point.x},${L.point.y}^A0N,${L.point.font},${L.point.font}^FB${L.point.width},1,0,R,0^FH_^FD${toZplUtf8Hex(pointText)}^FS`);
    }
    if (L.price.show && priceText) {
        // cena: obrócona o 90° w prawo (R) wzdłuż prawej krawędzi - po obróceniu metki w lewo czyta się normalnie;
        // duża, pogrubiona, bez słowa „Cena”
        lines.push(textField(L.price.x, L.price.y, L.price.font, `^FB${L.price.length},1,0,C,0`, toZplUtf8Hex(priceText), L.price.rotation, L.price.bold));
    }
    if (L.barcode.show) {
        // kod wyśrodkowany w swoim polu. EAN-13: standardowy wygląd - cyfry (gdy pokazane) rysuje drukarka (Y):
        // przedłużone kreski skrajne i środkowa, „1 002005 300009”; 13. cyfrę liczy drukarka.
        // Code 128: tryb automatyczny (A), bez napisu drukarki - cyfry osobnym polem niżej
        lines.push(
            `^BY${moduleWidth},3,${L.barcode.height}`,
            format === 'ean13'
                ? `^FO${L.barcode.area.x + barcodeX},${L.barcode.y}^BEN,${L.barcode.height},${L.barcode.digits.show ? 'Y' : 'N'},N^FD${code.slice(0, 12)}^FS`
                : `^FO${L.barcode.area.x + barcodeX},${L.barcode.y}^BCN,${L.barcode.height},N,N,N,A^FD${code}^FS`,
        );
        if (format !== 'ean13' && L.barcode.digits.show) {
            // cyfry kodu Code 128: pod kodem, wyśrodkowane w polu kodu
            lines.push(`^FO${L.barcode.area.x},${L.barcode.digits.y}^A0N,${digitsFont},${digitsFont}^FB${L.barcode.area.width},1,0,C,0^FD${code}^FS`);
        }
    }
    if (L.size.show && sizeText) {
        // rozmiar: lewy dolny róg, duży, pogrubiony
        lines.push(textField(L.size.x, L.size.y, L.size.font, '', toZplUtf8Hex(sizeText), 'N', L.size.bold));
    }
    lines.push('^XZ');
    return lines.join('\n');
};

export { MIN_MODULE_WIDTH, MAX_MODULE_WIDTH, buildLabelZpl, barcodeGeometry, barcodeQuietZones, ean13DigitsHeight, code128Modules, toZplUtf8Hex, isValidEan13, resolveBarcodeFormat, DEFAULT_LABEL_LAYOUT, LABEL_PRESETS, normalizeLabelLayout };
