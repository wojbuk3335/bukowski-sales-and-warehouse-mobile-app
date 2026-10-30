// Kurtka oddana przez klienta przy wymianie (26.10.2026): przepisanie punkt wymiany → MAGAZYN, które serwer od razu
// oznacza jako odpisane z punktu (blueProcessed), bo kurtki nigdy nie było na stanie punktu. Do MAGAZYNU trafia
// dopiero po przyjęciu w Dobieraniu (yellowProcessed) - do tego czasu „czeka na dopisanie”, nie „Przetworzone”.
export const isExchangeReturn = (transfer) => !!transfer?.exchangeReturnFor
  || String(transfer?.productId || '').startsWith('EXCHANGE_RETURN_');

// Zwrot od Cudzicha (30.10.2026): przesunięcie P → MAGAZYN zapisane przy zwrocie kurtki - tak samo jak zwrot z wymiany
// (niebieska noga od razu, przyjęcie w Dobieraniu MAGAZYNU)
export const isCudzichReturn = (transfer) => !!transfer?.cudzichReturnFor
  || String(transfer?.productId || '').startsWith('CUDZICH_RETURN_');

// Kurtka w drodze do MAGAZYNU, która nigdy nie była na stanie punktu (zwrot z wymiany albo od Cudzicha)
export const isReturnToWarehouse = (transfer) => isExchangeReturn(transfer) || isCudzichReturn(transfer);

// Czy zwrot jest już dopisany do MAGAZYNU
export const isExchangeReturnAccepted = (transfer) => isExchangeReturn(transfer) && transfer?.yellowProcessed === true;
