// Identyfikator urządzenia dla blokady „jedna osoba na punkcie”.
// Backend rozpoznaje po nim ten sam telefon (ponowne logowanie np. po rozładowaniu)
// i odróżnia go od innego telefonu próbującego wejść na to samo konto.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Logger from './logger';

const DEVICE_ID_KEY = 'BukowskiDeviceId';
const MAX_DEVICE_NAME_LENGTH = 60;

let cachedDeviceId = null; // identyfikator odczytany w tym uruchomieniu aplikacji
let pendingDeviceId = null; // równoległe wywołania czekają na ten sam odczyt

// UUID v4 bez dodatkowych zależności (crypto nie jest dostępne w każdym środowisku RN)
const generateUuid = () => {
    const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    let seed = Date.now();
    return template.replace(/[xy]/g, (char) => {
        // Mieszamy czas z Math.random, żeby dwa telefony uruchomione w tej samej milisekundzie nie zderzyły się
        const random = (seed + Math.random() * 16) % 16 | 0;
        seed = Math.floor(seed / 16);
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
};

// Stały identyfikator telefonu: generowany raz i trzymany w SecureStore (przeżywa wylogowanie).
export const getDeviceId = async () => {
    if (cachedDeviceId) return cachedDeviceId;
    if (pendingDeviceId) return pendingDeviceId;

    pendingDeviceId = (async () => {
        try {
            const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
            if (stored) {
                cachedDeviceId = stored;
                return stored;
            }

            const fresh = generateUuid();
            await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
            cachedDeviceId = fresh;
            return fresh;
        } catch (error) {
            Logger.warn('Nie udało się odczytać identyfikatora urządzenia z SecureStore:', error);
            // Bez SecureStore identyfikator żyje tylko do zamknięcia aplikacji - logowanie i tak ma działać
            cachedDeviceId = cachedDeviceId || generateUuid();
            return cachedDeviceId;
        } finally {
            pendingDeviceId = null;
        }
    })();

    return pendingDeviceId;
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Czytelna nazwa urządzenia pokazywana drugiej osobie w komunikacie o zajętym punkcie.
export const getDeviceName = () => {
    if (Platform.OS === 'ios') return 'iPhone';

    const parts = ['Android'];
    try {
        // Platform.constants (Brand/Model) jest dostępne tylko na Androidzie i nie wymaga natywnych pakietów
        const constants = Platform.constants || {};
        if (typeof constants.Brand === 'string' && constants.Brand.trim()) {
            parts.push(capitalize(constants.Brand.trim()));
        }
        if (typeof constants.Model === 'string' && constants.Model.trim()) {
            parts.push(constants.Model.trim());
        }
    } catch (_error) {
        // Brak stałych platformy - zostaje samo „Android”
    }

    return parts.join(' ').slice(0, MAX_DEVICE_NAME_LENGTH);
};

export default { getDeviceId, getDeviceName };
