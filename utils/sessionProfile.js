// Dane konta zapisywane w AsyncStorage (klucz „user”) po zalogowaniu.
// Odpowiedź serwera z logowania zawiera także tokeny (token, accessToken, refreshToken) i jednorazowe kody
// odzyskiwania 2FA. Te trafiają TYLKO do SecureStore (tokenService) / na ekran - do zwykłego, niezaszyfrowanego
// AsyncStorage zapisujemy sam profil (userId, email, role, symbol, sellingPoint…). Dawniej szła tam cała
// odpowiedź, więc kopia tokenów leżała poza sejfem telefonu.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const USER_STORAGE_KEY = 'user';

const SECRET_KEYS = ['token', 'accessToken', 'refreshToken', 'recoveryCodes'];

// Profil bez tajnych pól - do AsyncStorage i do stanu aplikacji
export const stripSessionSecrets = (data) => {
    if (!data || typeof data !== 'object') return data;
    const profile = { ...data };
    SECRET_KEYS.forEach((key) => { delete profile[key]; });
    return profile;
};

export const hasSessionSecrets = (data) =>
    Boolean(data) && typeof data === 'object' && SECRET_KEYS.some((key) => key in data);

// Zapisany wcześniej (starą wersją aplikacji) profil z tokenami - przy starcie przepisujemy go bez nich,
// nie czekając na kolejne logowanie
export const purgeStoredSessionSecrets = async () => {
    try {
        const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
        if (!raw) return false;
        const stored = JSON.parse(raw);
        if (!hasSessionSecrets(stored)) return false;
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(stripSessionSecrets(stored)));
        return true;
    } catch (_error) {
        return false; // uszkodzony wpis / brak dostępu - nie blokujemy startu aplikacji
    }
};

export default { stripSessionSecrets, hasSessionSecrets, purgeStoredSessionSecrets, USER_STORAGE_KEY };
