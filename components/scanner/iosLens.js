// Wybór obiektywu do skanowania na iPhonie (2.11.2026).
//
// Dlaczego: expo-camera na iOS 17+ bierze „aparat preferowany przez system” (AVCaptureDevice.systemPreferredCamera).
// Na iPhone'ach z kilkoma obiektywami to aparat WIRTUALNY (Dual Wide / Triple), w którym współczynnik zoomu 1,0
// oznacza obiektyw ULTRASZEROKI (0,5×), a zwykły szeroki (1×) zaczyna się od 2,0. expo-camera liczy zoom od 1,0, więc
// podgląd w aplikacji to w praktyce ultraszeroki obiektyw (12 MP, zniekształcenia na brzegach, mała szczegółowość)
// przycięty cyfrowo ~1,8× przez IOS_SCAN_ZOOM. Kod kreskowy z metki jest w nim za mało wyraźny - Android czyta
// (jeden obiektyw, bez tego problemu), iPhone „z lepszym aparatem” nie.
//
// Rozwiązanie: wskazać expo-camera konkretny obiektyw (prop selectedLens) - zwykły szeroki aparat główny.
// Nazwy obiektywów przychodzą z systemu PRZETŁUMACZONE („Back Camera” / „Tylny aparat”, „Back Ultra Wide Camera”…),
// więc nie porównujemy ich z listą słów. Aparat główny ma zawsze NAJKRÓTSZĄ nazwę - pozostałe to ta sama nazwa
// z dopiskiem (Ultra Wide, Telephoto, Dual, Triple, w każdym języku). Przy jednym obiektywie (iPhone SE) - bez zmian.

export const pickPrimaryLens = (lenses) => {
  const names = Array.isArray(lenses) ? lenses.map((name) => String(name || '').trim()).filter(Boolean) : [];
  if (names.length === 0) return null;
  return names.reduce((best, name) => {
    if (name.length < best.length) return name;
    if (name.length === best.length && name < best) return name; // ta sama długość - stabilny wybór
    return best;
  });
};

export default pickPrimaryLens;
