import { InteractionManager } from 'react-native';
import { logEvent } from './activityLog';

// Pomiar przejść między zakładkami (31.10.2026): w zainstalowanej aplikacji każde przejście czekało ok. 4 s.
// Przy każdym przejściu do Dziennika aktywności (panel → Dziennik zdarzeń, „Aplikacja”) trafia wpis
// „Przejście na <zakładka>: pokazana po X ms, gotowa po Y ms”:
//  - pokazana  = od dotknięcia ikony do wejścia zakładki na wierzch (focus) - ile trwało przerysowanie,
//  - klatka    = do pierwszej narysowanej klatki po wejściu,
//  - gotowa    = do końca prac po wejściu (pobrania, efekty) - kiedy ekran reaguje na dotyk.
// Bez wpływu na działanie - tylko liczy czas. Usunąć, gdy przyczyna będzie znana.

let pending = null; // { to, from, at }
let lastFocused = null;

const LABELS = {
  home: 'Sprzedaż', writeoff: 'Stan', search: 'Szukaj', create: 'Dodaj', cudzych: 'Cudzich', profile: 'Zamówienia',
  remanent: 'Remanent', dashboard: 'Pulpit', users: 'Dobieranie', various: 'Różne',
};
const labelOf = (name) => LABELS[name] || name;

// Dotknięcie ikony zakładki (także już aktywnej - wtedy ekran montuje się od nowa)
export const markTabPress = (routeName) => {
  pending = { to: routeName, from: lastFocused, at: Date.now() };
};

// Zakładka weszła na wierzch
export const markTabFocus = (routeName) => {
  const started = pending && pending.to === routeName ? pending : null;
  const from = lastFocused;
  lastFocused = routeName;
  if (!started) return;
  pending = null;
  const shownMs = Date.now() - started.at;
  let frameMs = null;
  requestAnimationFrame(() => {
    frameMs = Date.now() - started.at;
  });
  InteractionManager.runAfterInteractions(() => {
    // jeszcze jedna klatka - efekty po wejściu (pobrania) zdążą ruszyć i zablokować wątek, jeśli blokują
    setTimeout(() => {
      const readyMs = Date.now() - started.at;
      logEvent('app', 'perf.tab', `Przejście na ${labelOf(routeName)}: pokazana po ${shownMs} ms, gotowa po ${readyMs} ms`, {
        to: routeName,
        from: from || started.from || null,
        shownMs,
        frameMs,
        readyMs,
      });
    }, 0);
  });
};
