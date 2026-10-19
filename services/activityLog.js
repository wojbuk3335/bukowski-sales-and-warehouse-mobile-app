// Dziennik aktywności - zdarzenia z telefonu, których serwer sam nie widzi: wejście na ekran, próba zrzutu
// ekranu, aplikacja w tle / z powrotem. Zbierane w kolejce i wysyłane paczką (POST /activity/events) co kilka
// sekund albo od razu przy przejściu w tło. Zmiany danych (sprzedaż, odpisy, zamówienia…) serwer zapisuje sam
// po nagłówkach X-Device-* z tokenService - tu ich nie zgłaszamy.
import tokenService from './tokenService';
import { getApiUrl } from '../config/api';
import Logger from './logger';

const FLUSH_DELAY_MS = 4000;
const FLUSH_AT = 20; // tyle zdarzeń wysyłamy od razu
const MAX_QUEUE = 200; // bez internetu kolejka nie rośnie w nieskończoność

// Ścieżka z expo-router (bez grup w nawiasach) -> nazwa ekranu po polsku
export const SCREEN_LABELS = {
    '/': 'Start',
    '/sign-in': 'Logowanie',
    '/sign-up': 'Rejestracja',
    '/two-factor': 'Kod 2FA',
    '/change-password': 'Zmiana hasła',
    // panel użytkownika (zakładki)
    '/home': 'Sprzedaż',
    '/writeoff': 'Stan punktu',
    '/search': 'Wyszukiwarka',
    '/create': 'Odpis / przesunięcie',
    '/cudzych': 'Cudzych',
    '/profile': 'Zamówienia',
    '/remanent': 'Remanent',
    '/QRScanner': 'Skaner (sprzedaż)',
    '/QRScannerSearch': 'Skaner (wyszukiwarka)',
    // panel admina
    '/dashboard': 'Sprawdź (admin)',
    '/users': 'Dobierz (admin)',
    '/various': 'Różne (admin)',
    '/reports': 'Raporty (admin)',
    '/settings': 'Ustawienia (admin)',
    '/states-list': 'Stany',
    '/warehouse-mobile': 'Magazyn',
    '/products-list': 'Lista produktów',
    '/sales-view': 'Podgląd sprzedaży',
    '/stock-list': 'Tabela asortymentu',
    '/colors-list': 'Lista kolorów',
    '/sizes-list': 'Lista rozmiarów',
    '/localizations-list': 'Lista lokalizacji',
    '/bags-list': 'Tabela torebek',
    '/wallets-list': 'Tabela portfeli',
    '/remaining-products-list': 'Pozostały asortyment',
    '/employees-list': 'Tabela pracowników',
    '/manufacturers-list': 'Tabela grup',
    '/subcategories-menu': 'Podkategorie',
    '/payroll': 'Wypłaty',
    '/history': 'Historia',
    '/users-management': 'Zarządzanie użytkownikami',
    '/corrections-list': 'Korekty',
    '/orders-list': 'Zamówienia (admin)',
    '/cudzich-list': 'Cudzich (admin)',
    '/operacje-list': 'Operacje',
    '/cenniki': 'Cenniki',
    '/print-labels': 'Drukowanie metek',
    '/pan-kazek': 'Pan Kazek',
    '/activity-log': 'Dziennik aktywności',
    '/sales-report': 'Raport sprzedaży',
    '/inventory-report': 'Raport stanów',
    '/movements-report': 'Raport przepływów',
};

const SUBCATEGORY_SCREENS = /^\/(bags|belts|caps|coats|gloves|wallets)-subcategory-list$/;

export const screenLabel = (pathname) => {
    const path = String(pathname || '/');
    if (SCREEN_LABELS[path]) return SCREEN_LABELS[path];
    if (path.startsWith('/search/')) return `Wyszukiwarka: ${decodeURIComponent(path.slice('/search/'.length))}`;
    if (SUBCATEGORY_SCREENS.test(path)) return 'Podkategorie';
    // nieznany ekran: „/nowy-ekran” -> „Nowy ekran”
    const name = path.replace(/^\//, '').replace(/[-_]/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Start';
};

const queue = [];
let timer = null;
let sending = false;
let lastScreen = null;

const canSend = async () => {
    if (tokenService.isLoggingOut) return false;
    const { accessToken } = await tokenService.getTokens();
    return !!accessToken;
};

export const flush = async () => {
    if (sending || queue.length === 0) return false;
    clearTimeout(timer);
    timer = null;
    sending = true;
    const batch = queue.splice(0, 50);
    try {
        if (!(await canSend())) {
            queue.unshift(...batch); // zalogowany dopiero za chwilę - zdarzenia zostają (ekran logowania też)
            return false;
        }
        const response = await tokenService.authenticatedFetch(getApiUrl('/activity/events'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: batch }),
        });
        if (!response.ok) {
            if (response.status !== 401 && response.status !== 403) queue.unshift(...batch);
            return false;
        }
        return true;
    } catch (error) {
        queue.unshift(...batch); // bez internetu - spróbujemy przy następnej paczce
        Logger.debug('Dziennik aktywności: nie wysłano', error?.message);
        return false;
    } finally {
        sending = false;
        if (queue.length > 0) schedule();
    }
};

const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        flush();
    }, FLUSH_DELAY_MS);
};

export const logEvent = (kind, action, label, details) => {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ at: new Date().toISOString(), kind, action, label, ...(details ? { details } : {}) });
    if (queue.length >= FLUSH_AT) flush();
    else schedule();
};

// Wejście na ekran (ta sama ścieżka pod rząd - raz)
export const logScreen = (pathname) => {
    const path = String(pathname || '/');
    if (path === lastScreen) return;
    lastScreen = path;
    logEvent('screen', path.slice(0, 80), `Ekran: ${screenLabel(path)}`);
};

export const currentScreen = () => lastScreen;

// Po wylogowaniu zdarzenia z poprzedniej sesji nie mają trafić na nowe konto
export const reset = () => {
    queue.length = 0;
    lastScreen = null;
    clearTimeout(timer);
    timer = null;
};

export const pendingCount = () => queue.length;

export default { logEvent, logScreen, flush, reset, screenLabel, currentScreen, pendingCount };
