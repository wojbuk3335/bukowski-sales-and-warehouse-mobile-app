// Szybkie logowanie na zaufanym telefonie: wzór / PIN / odcisk palca zamiast hasła (u admina także zamiast 2FA).
//
// Po pełnym logowaniu telefon prosi serwer o klucz (POST /user/trusted-device) i trzyma go w SecureStore razem
// z danymi konta. Kolejne wejście: systemowa blokada ekranu (expo-local-authentication) -> POST /user/quick-login.
// Bez ustawionej blokady ekranu w telefonie szybkie logowanie jest niedostępne (każdy, kto weźmie telefon,
// wszedłby na konto). Moduł natywny jest od wersji 1.2.0 - starsza wersja (OTA) po cichu działa jak dotąd.
import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from '../config/api';
import tokenService from './tokenService';
import { getDeviceId, getDeviceName } from './deviceId';
import Logger from './logger';

// Zapamiętane konta: { accounts: [{ userId, secret, email, symbol, role, sellingPoint, savedAt, lastUsedAt }] }.
// Dawniej jedno konto (sam obiekt) - odczyt przyjmuje oba formaty.
const STORE_KEY = 'BukowskiQuickLogin';
const PROMPTED_KEY = 'BukowskiQuickLoginAsked'; // konto, któremu już zaproponowano (żeby nie pytać przy każdym logowaniu)

let module = null;
let loaded = false;
export const loadLocalAuth = () => {
    if (loaded) return module;
    loaded = true;
    try {
        // eslint-disable-next-line global-require
        const core = require('expo-modules-core');
        if (typeof core?.requireOptionalNativeModule === 'function' && !core.requireOptionalNativeModule('ExpoLocalAuthentication')) {
            return null; // stara wersja aplikacji bez modułu natywnego
        }
        // eslint-disable-next-line global-require
        module = require('expo-local-authentication');
    } catch (error) {
        module = null;
    }
    return module;
};

// 'ok' | 'no-lock' (telefon bez blokady ekranu) | 'unsupported' (stara wersja aplikacji / brak sprzętu)
export const availability = async () => {
    const auth = loadLocalAuth();
    if (!auth) return 'unsupported';
    try {
        if (typeof auth.getEnrolledLevelAsync === 'function') {
            const level = await auth.getEnrolledLevelAsync();
            return level >= (auth.SecurityLevel?.SECRET ?? 1) ? 'ok' : 'no-lock';
        }
        const [hardware, enrolled] = await Promise.all([auth.hasHardwareAsync(), auth.isEnrolledAsync()]);
        return hardware && enrolled ? 'ok' : 'no-lock';
    } catch (error) {
        return 'unsupported';
    }
};

// Systemowe okno odblokowania (wzór / PIN / odcisk / Face ID); true = odblokowano
export const unlock = async (promptMessage = 'Odblokuj aplikację Bukowski') => {
    const auth = loadLocalAuth();
    if (!auth) return false;
    try {
        const result = await auth.authenticateAsync({ promptMessage, cancelLabel: 'Anuluj', disableDeviceFallback: false });
        return !!result?.success;
    } catch (error) {
        Logger.debug('Odblokowanie nieudane:', error?.message);
        return false;
    }
};

const isAccount = (item) => Boolean(item && item.userId && item.secret);
const lastUsed = (item) => new Date(item.lastUsedAt || item.savedAt || 0).getTime() || 0;

// Wszystkie konta zapamiętane na tym telefonie, ostatnio używane na początku
export const getAccounts = async () => {
    try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const list = Array.isArray(parsed?.accounts) ? parsed.accounts : (isAccount(parsed) ? [parsed] : []);
        return list.filter(isAccount).sort((a, b) => lastUsed(b) - lastUsed(a));
    } catch (error) {
        return [];
    }
};

const writeAccounts = async (accounts) => {
    if (accounts.length === 0) {
        try { await SecureStore.deleteItemAsync(STORE_KEY); } catch (error) { /* brak wpisu */ }
        return;
    }
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ accounts }));
};

// Jedno konto: wskazane (userId) albo ostatnio używane; null = brak
export const getSaved = async (userId) => {
    const accounts = await getAccounts();
    if (userId) return accounts.find((item) => item.userId === String(userId)) || null;
    return accounts[0] || null;
};

// Usuwa z telefonu jedno konto (userId) albo wszystkie (bez argumentu)
export const clearSaved = async (userId) => {
    if (!userId) {
        await writeAccounts([]);
        return;
    }
    const accounts = await getAccounts();
    await writeAccounts(accounts.filter((item) => item.userId !== String(userId)));
};

// Czy zaproponować włączenie (po pełnym logowaniu): moduł jest, ten telefon nie ma jeszcze klucza dla tego konta,
// a temu kontu nie odmówiono wcześniej („Nie teraz”)
export const shouldOffer = async (user) => {
    if (!user?.userId && !user?._id) return false;
    if (!loadLocalAuth()) return false;
    const userId = String(user.userId || user._id);
    if (await getSaved(userId)) return false; // to konto jest już zapamiętane na tym telefonie
    try {
        return (await SecureStore.getItemAsync(PROMPTED_KEY)) !== userId;
    } catch (error) {
        return true;
    }
};
export const rememberDeclined = async (user) => {
    try { await SecureStore.setItemAsync(PROMPTED_KEY, String(user?.userId || user?._id || '')); } catch (error) { /* ignore */ }
};

// Włączenie dla zalogowanego konta (po pełnym logowaniu): klucz z serwera do SecureStore
export const enable = async (user) => {
    const deviceId = await getDeviceId();
    const response = await tokenService.authenticatedFetch(getApiUrl('/user/trusted-device'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, deviceName: getDeviceName() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.secret) throw new Error(data?.message || 'Nie udało się włączyć szybkiego logowania');
    const now = new Date().toISOString();
    const saved = {
        userId: String(data.userId),
        secret: data.secret,
        email: data.email || user?.email || '',
        symbol: data.symbol || user?.symbol || '',
        role: data.role || user?.role || '',
        sellingPoint: data.sellingPoint || user?.sellingPoint || '',
        savedAt: now,
        lastUsedAt: now,
    };
    // Kolejne konto DOPISUJE się do listy (np. admin i konto punktu na jednym telefonie); to samo konto - nowy klucz
    const others = (await getAccounts()).filter((item) => item.userId !== saved.userId);
    await writeAccounts([saved, ...others]);
    return saved;
};

// Logowanie kluczem po odblokowaniu telefonu - konto wskazane (userId) albo ostatnio używane.
// Błędy: code 'CANCELLED' (anulowano odblokowanie), 'TRUSTED_DEVICE_REJECTED' (odcięty - klucz tego konta usunięty),
// 'SESSION_ACTIVE' (punkt zajęty), inne - sieć / serwer.
export const login = async (userId) => {
    const saved = await getSaved(userId);
    if (!saved) {
        const error = new Error('Szybkie logowanie nie jest włączone na tym telefonie');
        error.code = 'NOT_ENABLED';
        throw error;
    }
    if (!(await unlock(`Zaloguj jako ${saved.symbol || saved.email}`))) {
        const error = new Error('Anulowano odblokowanie');
        error.code = 'CANCELLED';
        throw error;
    }
    const deviceId = await getDeviceId();
    const response = await fetch(getApiUrl('/user/quick-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId, 'X-Device-Name': getDeviceName() },
        body: JSON.stringify({ userId: saved.userId, deviceId, secret: saved.secret, deviceName: getDeviceName() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data?.message || `Szybkie logowanie nie powiodło się (HTTP ${response.status})`);
        error.code = data?.code || data?.error || '';
        error.session = data?.session || null;
        error.sessions = Array.isArray(data?.sessions) ? data.sessions : null; // wszystkie zalogowane telefony (limit 2)
        if (error.code === 'TRUSTED_DEVICE_REJECTED') await clearSaved(saved.userId); // odcięty - to konto hasłem
        throw error;
    }
    // ostatnio używane konto na początku listy (podpowiedź na ekranie logowania)
    try {
        const accounts = await getAccounts();
        const used = { ...saved, lastUsedAt: new Date().toISOString() };
        await writeAccounts([used, ...accounts.filter((item) => item.userId !== saved.userId)]);
    } catch (error) { /* tylko kolejność */ }
    return data;
};

// „Zapomnij”: wyłączenie na serwerze (potwierdzone kluczem, bez tokenu) i usunięcie klucza z telefonu -
// jedno konto (userId) albo ostatnio używane
export const forget = async (userId) => {
    const saved = await getSaved(userId);
    if (!saved) return;
    await clearSaved(saved.userId);
    try {
        await fetch(getApiUrl('/user/trusted-device/forget'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: saved.userId, deviceId: await getDeviceId(), secret: saved.secret }),
        });
    } catch (error) {
        // bez internetu - klucz i tak usunięty z telefonu; admin może odciąć telefon w panelu
    }
};

export default { loadLocalAuth, availability, unlock, getAccounts, getSaved, clearSaved, shouldOffer, rememberDeclined, enable, login, forget };
