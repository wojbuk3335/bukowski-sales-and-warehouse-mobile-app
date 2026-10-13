// Odpowiedzi serwera: gdy zamiast JSON-a przyjdzie np. strona HTML z błędem 502 (serwer pośredniczący),
// nie pokazujemy sprzedawcy „JSON Parse error”, tylko zrozumiały komunikat.

// Treść odpowiedzi jako obiekt; {} gdy brak treści albo to nie jest JSON
export const readJson = async (response) => {
  if (!response || typeof response.json !== 'function') return {};
  try {
    const data = await response.json();
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    return {};
  }
};

// Komunikat błędu dla odpowiedzi !ok: najpierw komunikat z serwera, potem ogólny wg kodu
export const serverErrorMessage = (response, data, fallback) => {
  if (data && typeof data.message === 'string' && data.message.trim()) return data.message;
  const status = Number(response?.status) || 0;
  if (status >= 500 || status === 0) {
    return status
      ? `Serwer chwilowo nie odpowiada (błąd ${status}) - spróbuj za chwilę.`
      : 'Serwer chwilowo nie odpowiada - spróbuj za chwilę.';
  }
  return fallback || `Nieoczekiwana odpowiedź serwera (błąd ${status}).`;
};

// Przekroczony czas oczekiwania albo brak połączenia (żądanie mogło dotrzeć do serwera albo nie)
export const isConnectionError = (error) => {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('limit czasu')
    || message.includes('network request failed')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('aborted');
};
