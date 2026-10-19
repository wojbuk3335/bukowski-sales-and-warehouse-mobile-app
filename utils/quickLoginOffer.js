// Po pełnym logowaniu (hasło, u admina także 2FA): propozycja włączenia szybkiego logowania na tym telefonie.
// Telefon bez blokady ekranu: krótka informacja, że trzeba ją ustawić (szybkie logowanie bez blokady jest wyłączone).
import { appAlert } from '../services/appAlert';
import quickLogin from '../services/quickLogin';

export const offerQuickLogin = async (user) => {
    if (!(await quickLogin.shouldOffer(user))) return 'skipped';
    const status = await quickLogin.availability();
    if (status === 'unsupported') return 'skipped';
    if (status === 'no-lock') {
        await quickLogin.rememberDeclined(user); // informacja raz na konto
        appAlert(
            'Szybkie logowanie',
            'Żeby logować się wzorem, PIN-em albo odciskiem palca zamiast hasła, ustaw blokadę ekranu w ustawieniach telefonu. Potem zaloguj się jeszcze raz hasłem.'
        );
        return 'no-lock';
    }
    return new Promise((resolve) => {
        appAlert(
            'Szybkie logowanie',
            'Włączyć logowanie wzorem / PIN-em / odciskiem palca na tym telefonie? Następnym razem nie trzeba będzie wpisywać hasła'
                + (user?.role === 'admin' ? ' ani kodu 2FA' : '') + '.',
            [
                { text: 'Nie teraz', style: 'cancel', onPress: async () => { await quickLogin.rememberDeclined(user); resolve('declined'); } },
                {
                    text: 'Włącz',
                    onPress: async () => {
                        // potwierdzenie właściciela telefonu, zanim klucz trafi do telefonu
                        if (!(await quickLogin.unlock('Potwierdź, żeby włączyć szybkie logowanie'))) { resolve('cancelled'); return; }
                        try {
                            await quickLogin.enable(user);
                            appAlert('Szybkie logowanie włączone', 'Następnym razem odblokujesz aplikację wzorem / PIN-em / odciskiem palca.');
                            resolve('enabled');
                        } catch (error) {
                            appAlert('Błąd', error.message);
                            resolve('error');
                        }
                    },
                },
            ]
        );
    });
};

export default offerQuickLogin;
