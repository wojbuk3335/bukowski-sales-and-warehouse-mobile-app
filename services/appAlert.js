import { Alert } from 'react-native';
import AuthErrorHandler from '../utils/authErrorHandler';

// Okienka w stylu aplikacji zamiast systemowych okienek telefonu.
// appAlert ma TĘ SAMĄ sygnaturę co Alert.alert: (title, message, buttons, options),
// więc podmiana w kodzie jest 1:1. Gdy host nie jest zamontowany (np. testy, start aplikacji),
// używane jest zwykłe systemowe okienko, żeby komunikat nigdy nie zginął.

let host = null;
const pending = [];

export const registerAppAlertHost = (show) => {
  host = show;
  while (pending.length > 0 && host) {
    host(pending.shift());
  }
  return () => {
    if (host === show) host = null;
  };
};

export function appAlert(title, message, buttons, options) {
  // Sesja wygasła i aplikacja właśnie przechodzi do logowania - komunikat ekranu z błędem tokenu
  // („Token refresh failed”, „Authentication failed: 401”…) pokazałby się nad ekranem logowania
  if (AuthErrorHandler.redirectedRecently()
    && AuthErrorHandler.isAuthError({ message: `${title || ''} ${message || ''}` })) {
    return;
  }
  const request = { title, message, buttons, options };
  if (host) {
    host(request);
    return;
  }
  if (process.env.NODE_ENV === 'test') {
    Alert.alert(title, message, buttons, options);
    return;
  }
  pending.push(request); // host zaraz się zamontuje (start aplikacji)
}

export default appAlert;
