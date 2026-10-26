// Okno błędu w Dobieraniu (telefon, 26.10.2026): odpowiedź serwera (kody po angielsku) → polski opis i co zrobić.
// Kopia frontend/src/utils/batchErrorMessages.js z napisami pod telefon (zamiast „F5” - odświeżenie listy).
// Dawniej telefon pokazywał surowy tekst odpowiedzi serwera.
// Serwer odrzuca cały zapis przy błędzie (transakcja), więc żadna kurtka nie została zmieniona.

const DEFAULT_INSTRUCTION = 'Zapis nie został wykonany - żadna kurtka nie została zmieniona. Odśwież listę (przeciągnij w dół albo wybierz punkt ponownie) i spróbuj ponownie.';
const REFRESH_INSTRUCTION = 'Lista na ekranie jest nieaktualna. Odśwież listę (przeciągnij w dół albo wybierz punkt ponownie) - przetworzone pozycje znikną z listy, a pozostałe możesz zapisać jeszcze raz.';

const fromCode = (code, payload) => {
  const failure = payload?.failure || {};
  const details = failure.details || payload?.details || {};
  switch (code) {
    case 'TRANSFERS_ALREADY_PROCESSED':
      return {
        message: `Część przepisań (${payload?.count || 1}) została już przetworzona - w innym oknie albo przez innego pracownika albo administratora.`,
        instruction: REFRESH_INSTRUCTION,
      };
    case 'SALES_ALREADY_PROCESSED':
      return {
        message: `Część sprzedaży (${payload?.count || 1}) została już odpisana ze stanu - w innym oknie albo przez innego pracownika albo administratora.`,
        instruction: REFRESH_INSTRUCTION,
      };
    case 'INSUFFICIENT_STOCK':
      return {
        message: details.requested
          ? `Brak w magazynie: z ${details.requested} wybranych kurtek w magazynie jest jeszcze ${details.available}. Brakujące zostały już przeniesione - w innym oknie albo przez innego pracownika albo administratora.`
          : 'Część wybranych kurtek nie jest już w magazynie - zostały przeniesione w innym oknie albo przez innego pracownika albo administratora.',
        instruction: REFRESH_INSTRUCTION,
      };
    case 'ITEM_ALREADY_IN_TRANSFER':
      return {
        message: 'Te same pozycje są właśnie zapisywane lub zmieniane w innym oknie, w telefonie albo przez innego pracownika lub administratora.',
        instruction: 'Odczekaj chwilę, odśwież listę i sprawdź listę - zapisz tylko to, co na niej zostało.',
      };
    case 'DUPLICATE_TRANSACTION_ID':
      return {
        message: 'Ten zapis został już wykonany (przycisk kliknięty drugi raz).',
        instruction: 'Odśwież listę (przeciągnij w dół albo wybierz punkt ponownie) - zmiany z pierwszego kliknięcia są już zapisane.',
      };
    case 'IN_PROGRESS':
      return {
        message: 'Ten zapis jest jeszcze w trakcie.',
        instruction: 'Odczekaj kilka sekund i odśwież listę. Nie klikaj zapisu ponownie.',
      };
    case 'DUPLICATE_ITEMS_IN_BATCH':
      return {
        message: 'Ta sama pozycja jest na liście więcej niż raz.',
        instruction: DEFAULT_INSTRUCTION,
      };
    case 'UNDO_NOT_LATEST':
      // Cofanie dotyczy zapisu widocznego na przycisku; w międzyczasie ktoś zapisał inną transakcję (audyt W6)
      return {
        message: payload?.message || 'W międzyczasie zapisano inną transakcję.',
        instruction: 'Odśwież listę (przeciągnij w dół albo wybierz punkt ponownie) - przycisk pokaże aktualny ostatni zapis. Sprawdź, czy to ten, który chcesz cofnąć.',
      };
    case 'UNDO_TRANSACTION_ID_REQUIRED':
      return {
        message: 'Telefon nie podał numeru zapisu do cofnięcia.',
        instruction: 'Odśwież listę (przeciągnij w dół albo wybierz punkt ponownie) i spróbuj ponownie.',
      };
    case 'UNDO_ITEM_FAILED':
      // Jedna z kurtek nie dała się przywrócić - całe cofnięcie wycofane, historia zapisu nienaruszona
      return {
        message: payload?.message || 'Jednej z kurtek nie dało się przywrócić.',
        instruction: 'Nic nie zostało zmienione - historia zapisu jest nienaruszona. Zgłoś to administratorowi systemu.',
      };
    case 'INCOMING_ITEM_NOT_ACCEPTABLE':
      // Serwer podaje po polsku, której kurtki nie może przyjąć i dlaczego (brak towaru / rozmiaru / punktu / przepisania)
      return {
        message: failure.error || payload?.error || 'Jednej z kurtek nie da się przyjąć na stan.',
        instruction: DEFAULT_INSTRUCTION,
      };
    case 'TARGET_USER_NOT_FOUND':
      return {
        message: 'Nie znaleziono wybranego punktu (konto mogło zostać usunięte albo zmienione).',
        instruction: 'Wybierz punkt jeszcze raz z listy i spróbuj ponownie.',
      };
    case 'SELECTED_USER_REQUIRED':
      return {
        message: 'Nie wybrano punktu, do którego mają trafić kurtki z magazynu.',
        instruction: 'Wybierz punkt z listy i spróbuj ponownie.',
      };
    case 'WAREHOUSE_USER_MISSING':
      return {
        message: 'W systemie nie ma konta MAGAZYN.',
        instruction: 'Sprawdź konta w zakładce Użytkownicy.',
      };
    case 'INVALID_REQUEST':
      return {
        message: 'Nie wybrano żadnej kurtki z magazynu do przeniesienia.',
        instruction: DEFAULT_INSTRUCTION,
      };
    case 'MISSING_TRANSACTION_ID':
    case 'INVALID_PRINT_SCOPE':
      return {
        message: 'Telefon wysłał niepełne dane zapisu.',
        instruction: 'Odśwież listę (przeciągnij w dół albo wybierz punkt ponownie) i spróbuj ponownie.',
      };
    default:
      return null;
  }
};

const hasPolishText = (text) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(String(text || ''));

// status - kod HTTP (albo 'NETWORK_ERROR'), payload - sparsowana odpowiedź serwera (albo null), rawText - surowa treść
export const batchErrorToPolish = (status, payload, rawText = '') => {
  const code = payload?.code || payload?.failure?.code || payload?.failure?.type || payload?.type;
  const known = fromCode(code, payload);
  if (known) return known;

  // Komunikat serwera, który już jest po polsku (np. wydanie z magazynu przed przyjęciem) - pokazujemy bez zmian
  const serverText = payload?.failure?.error || payload?.failure?.message || payload?.error || payload?.message || rawText;
  if (hasPolishText(serverText)) {
    return { message: serverText, instruction: DEFAULT_INSTRUCTION };
  }

  if (status === 'NETWORK_ERROR') {
    return {
      message: 'Brak odpowiedzi serwera (zerwane połączenie albo serwer nie działa).',
      instruction: 'Sprawdź internet i odśwież listę - sprawdź na liście, czy zapis się wykonał, zanim klikniesz ponownie.',
    };
  }
  if (status === 404) {
    return { message: 'Nie znaleziono danych do tej operacji (mogły zostać już przetworzone albo cofnięte).', instruction: REFRESH_INSTRUCTION };
  }
  if (status === 401 || status === 403) {
    return { message: 'Brak uprawnień albo sesja wygasła.', instruction: 'Zaloguj się ponownie jako administrator i spróbuj jeszcze raz.' };
  }
  if (Number(status) >= 500) {
    return { message: 'Błąd serwera podczas zapisu.', instruction: DEFAULT_INSTRUCTION };
  }
  return { message: 'Nieznany błąd zapisu.', instruction: DEFAULT_INSTRUCTION };
};

export default batchErrorToPolish;
