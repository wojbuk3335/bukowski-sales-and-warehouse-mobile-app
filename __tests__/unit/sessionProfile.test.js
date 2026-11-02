import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSessionSecrets, purgeStoredSessionSecrets, stripSessionSecrets } from '../../utils/sessionProfile';

const loginResponse = {
    token: 'jwt-1',
    accessToken: 'jwt-1',
    refreshToken: 'refresh-1',
    recoveryCodes: ['AAAA-BBBB'],
    userId: 'u1',
    email: 'punkt@bukowski.pl',
    role: 'user',
    symbol: 'P',
    sellingPoint: 'Karpacz',
};

describe('sessionProfile', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it('stripSessionSecrets zostawia profil, usuwa tokeny i kody odzyskiwania', () => {
        const profile = stripSessionSecrets(loginResponse);
        expect(profile).toEqual({ userId: 'u1', email: 'punkt@bukowski.pl', role: 'user', symbol: 'P', sellingPoint: 'Karpacz' });
        expect(loginResponse.accessToken).toBe('jwt-1'); // oryginał nietknięty - tokenService go jeszcze potrzebuje
        expect(stripSessionSecrets(null)).toBeNull();
    });

    it('hasSessionSecrets rozpoznaje wpis z tokenami', () => {
        expect(hasSessionSecrets(loginResponse)).toBe(true);
        expect(hasSessionSecrets({ userId: 'u1', role: 'admin' })).toBe(false);
        expect(hasSessionSecrets(null)).toBe(false);
    });

    it('purgeStoredSessionSecrets przepisuje stary wpis bez tokenów', async () => {
        await AsyncStorage.setItem('user', JSON.stringify(loginResponse));
        expect(await purgeStoredSessionSecrets()).toBe(true);
        const stored = JSON.parse(await AsyncStorage.getItem('user'));
        expect(stored).toEqual({ userId: 'u1', email: 'punkt@bukowski.pl', role: 'user', symbol: 'P', sellingPoint: 'Karpacz' });
    });

    it('purgeStoredSessionSecrets nie rusza czystego wpisu ani braku wpisu', async () => {
        expect(await purgeStoredSessionSecrets()).toBe(false);
        await AsyncStorage.setItem('user', JSON.stringify({ userId: 'u1', role: 'admin' }));
        expect(await purgeStoredSessionSecrets()).toBe(false);
        expect(JSON.parse(await AsyncStorage.getItem('user'))).toEqual({ userId: 'u1', role: 'admin' });
    });

    it('purgeStoredSessionSecrets przy uszkodzonym JSON nie rzuca', async () => {
        await AsyncStorage.setItem('user', '{nie-json');
        expect(await purgeStoredSessionSecrets()).toBe(false);
    });
});
