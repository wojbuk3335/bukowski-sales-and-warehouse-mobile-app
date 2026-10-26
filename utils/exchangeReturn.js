// Kurtka oddana przez klienta przy wymianie (26.10.2026): przepisanie punkt wymiany → MAGAZYN, które serwer od razu
// oznacza jako odpisane z punktu (blueProcessed), bo kurtki nigdy nie było na stanie punktu. Do MAGAZYNU trafia
// dopiero po przyjęciu w Dobieraniu (yellowProcessed) - do tego czasu „czeka na dopisanie”, nie „Przetworzone”.
export const isExchangeReturn = (transfer) => !!transfer?.exchangeReturnFor
  || String(transfer?.productId || '').startsWith('EXCHANGE_RETURN_');

// Czy zwrot jest już dopisany do MAGAZYNU
export const isExchangeReturnAccepted = (transfer) => isExchangeReturn(transfer) && transfer?.yellowProcessed === true;
