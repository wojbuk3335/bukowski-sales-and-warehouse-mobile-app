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

export const getSaved = async () => {
    try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        return saved && saved.userId && saved.secret ? saved : null;
    } catch (error) {
        return null;
    }
};

export const clearSaved = async () => {
    try { await SecureStore.deleteItemAsync(STORE_KEY); } catch (error) { /* brak wpisu */ }
};

// Czy zaproponować włączenie (po pełnym logowaniu): moduł jest, ten telefon nie ma jeszcze klucza dla tego konta,
// a temu kontu nie odmówiono wcześniej („Nie teraz”)
export const shouldOffer = async (user) => {
    if (!user?.userId && !user?._id) return false;
    if (!loadLocalAuth()) return false;
    const saved = await getSaved();
    const userId = String(user.userId || user._id);
    if (saved?.userId === userId) return false;
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
    const saved = {
        userId: data.userId,
        secret: data.secret,
        email: data.email || user?.email || '',
        symbol: data.symbol || user?.symbol || '',
        role: data.role || user?.role || '',
        sellingPoint: data.sellingPoint || user?.sellingPoint || '',
        savedAt: new Date().toISOString(),
    };
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(saved));
    return saved;
};

// Logowanie kluczem po odblokowaniu telefonu. Błędy: code 'CANCELLED' (anulowano odblokowanie),
// 'TRUSTED_DEVICE_REJECTED' (odcięty - klucz usunięty), 'SESSION_ACTIVE' (punkt zajęty), inne - sieć / serwer.
export const login = async () => {
    const saved = await getSaved();
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
        if (error.code === 'TRUSTED_DEVICE_REJECTED') await clearSaved(); // odcięty przez admina - pełne logowanie
        throw error;
    }
    return data;
};

// „Zapomnij ten telefon”: wyłączenie na serwerze (potwierdzone kluczem, bez tokenu) i usunięcie klucza z telefonu
export const forget = async () => {
    const saved = await getSaved();
    await clearSaved();
    if (!saved) return;
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

export default { loadLocalAuth, availability, unlock, getSaved, clearSaved, shouldOffer, rememberDeclined, enable, login, forget };
