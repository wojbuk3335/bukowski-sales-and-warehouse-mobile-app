import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { subscribeLiveEvents, isLiveConnected } from "./liveEvents";
import useScreenFocused from "./useScreenFocused";

// Odświeża ekran, gdy serwer zgłosi zmianę danych (np. 'pricelists'), po wznowieniu połączenia,
// po powrocie aplikacji na pierwszy plan oraz co pollMs, gdy połączenie na żywo nie działa.
// Działa tylko, gdy ekran jest na wierzchu: zakładki i ekrany stosu nie odmontowują się po zejściu
// z wierzchu, więc bez tego każdy odwiedzony ekran odświeżał się dalej w tle (np. pod Historią).
export default function useLiveRefresh(types, onRefresh, { pollMs = 60000, enabled = true } = {}) {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;
  const typesKey = (types || []).join(",");
  const focused = useScreenFocused();
  const active = Boolean(enabled) && focused;

  useEffect(() => {
    if (!active) return undefined;
    const wanted = new Set(typesKey.split(",").filter(Boolean));
    let timer = null;
    let lastRun = 0;
    const trigger = (minGapMs = 0) => {
      if (Date.now() - lastRun < minGapMs) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        lastRun = Date.now();
        try { callbackRef.current && callbackRef.current(); } catch (error) { /* ignore */ }
      }, 300);
    };

    const unsubscribe = subscribeLiveEvents((type) => {
      if (wanted.has(type) || type === "reconnect") trigger();
    });
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") trigger(5000);
    });
    const poll = setInterval(() => { if (!isLiveConnected()) trigger(); }, pollMs);

    return () => {
      unsubscribe();
      appSub.remove();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [typesKey, pollMs, active]);
}
