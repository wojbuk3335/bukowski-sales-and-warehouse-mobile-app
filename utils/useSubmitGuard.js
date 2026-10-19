import { useCallback, useRef, useState } from 'react';

// Blokada podwójnego kliknięcia przy zapisie: drugie kliknięcie, zanim serwer odpowie, nic nie robi.
// Dawniej przy słabym zasięgu dwa kliknięcia „Odpisz kwotę” zapisywały dwie operacje.
// Użycie: const [saving, runOnce] = useSubmitGuard(); onPress={() => runOnce(zapisz)} disabled={saving}
export const useSubmitGuard = () => {
  const busyRef = useRef(false); // ref - działa od razu, zanim React odświeży stan
  const [busy, setBusy] = useState(false);

  const runOnce = useCallback(async (action) => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, runOnce];
};

export default useSubmitGuard;
