import { useLayoutEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
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

// --- Drugi pomiar (31.10.2026): pierwszy wpis „Szukaj: pokazana po 4343 ms” - najlżejsza zakładka, więc stoi coś innego.
// 1) Czas przerysowania każdej zakładki (od początku renderu do zatwierdzenia zmian na ekranie). Wpis tylko, gdy
//    przerysowanie trwało dłużej niż SLOW_RENDER_MS: „Przerysowanie: Sprzedaż 3900 ms”.
// 2) Przestój wątku aplikacji: zegar co 250 ms - gdy kolejne tyknięcie spóźni się o więcej niż STALL_MS, wpis
//    „Aplikacja stała 4100 ms (ekran: …)”. Pokaże, czy aplikacja stoi tylko przy przejściu, czy cały czas.
// Najwyżej MAX_PERF_EVENTS wpisów na uruchomienie, żeby nie zalać dziennika.
const SLOW_RENDER_MS = 300;
const STALL_MS = 700;
const MAX_PERF_EVENTS = 60;
let perfEvents = 0;
const MEASURE = process.env.NODE_ENV !== 'test'; // w testach bez pomiaru (czas renderu w jest jest inny)
const perfLog = (action, label, details) => {
  if (!MEASURE || perfEvents >= MAX_PERF_EVENTS) return;
  perfEvents += 1;
  logEvent('app', action, label, details);
};

// W komponencie zakładki: useRenderTiming('home')
export const useRenderTiming = (name) => {
  const startedAt = Date.now();
  useLayoutEffect(() => {
    const ms = Date.now() - startedAt;
    if (ms >= SLOW_RENDER_MS) {
      perfLog('perf.render', `Przerysowanie: ${labelOf(name)} ${ms} ms`, { screen: name, ms, focused: lastFocused === name });
    }
  });
};

let watchdogStarted = false;
export const startStallWatchdog = () => {
  if (watchdogStarted || !MEASURE) return;
  watchdogStarted = true;
  let last = Date.now();
  // w tle zegary stoją - po powrocie liczymy od nowa (to nie przestój)
  AppState.addEventListener('change', (state) => { if (state === 'active') last = Date.now(); });
  setInterval(() => {
    const now = Date.now();
    if (AppState.currentState !== 'active') { last = now; return; }
    const late = now - last - 250;
    last = now;
    if (late >= STALL_MS) {
      perfLog('perf.stall', `Aplikacja stała ${late} ms (ekran: ${labelOf(lastFocused || '?')})`, { ms: late, screen: lastFocused, afterTabPressMs: pending ? now - pending.at : null });
    }
  }, 250);
};
