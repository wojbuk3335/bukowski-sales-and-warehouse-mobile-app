// Dziennik aktywności: zgłasza do serwera wejścia na ekrany, próby zrzutu ekranu i przejścia aplikacji
// w tło / z powrotem. Montowany raz w głównym layoucie; nic nie rysuje.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { flush, logEvent, logScreen, currentScreen } from '../services/activityLog';
import { loadScreenCapture } from '../services/screenCapture';

// Wykrywanie zrzutu: moduł natywny (od buildu, który go zawiera); stara wersja po OTA - po cichu bez wykrywania.
// Android poniżej 14 wymaga uprawnień do zdjęć, o które nie prosimy - tam nasłuch może nie zadziałać,
// ale sam zrzut i tak wychodzi czarny (blokada w services/screenCapture).
const subscribeScreenshots = (onScreenshot) => {
    try {
        const screenCapture = loadScreenCapture();
        if (typeof screenCapture?.addScreenshotListener !== 'function') return null;
        return screenCapture.addScreenshotListener(onScreenshot);
    } catch (error) {
        return null;
    }
};

const ActivityTracker = () => {
    const pathname = usePathname();
    const started = useRef(false);

    useEffect(() => {
        logScreen(pathname);
    }, [pathname]);

    useEffect(() => {
        if (!started.current) {
            started.current = true;
            logEvent('app', 'app.start', 'Uruchomienie aplikacji');
        }
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'background' || state === 'inactive') {
                logEvent('app', 'app.background', 'Aplikacja w tle', { screen: currentScreen() });
                flush(); // zanim system uśpi aplikację
            } else if (state === 'active') {
                logEvent('app', 'app.foreground', 'Powrót do aplikacji', { screen: currentScreen() });
            }
        });
        const screenshots = subscribeScreenshots(() => {
            logEvent('screenshot', 'screenshot', 'Próba zrzutu ekranu', { screen: currentScreen() });
            flush();
        });
        return () => {
            subscription?.remove?.();
            screenshots?.remove?.();
        };
    }, []);

    return null;
};

export default ActivityTracker;
