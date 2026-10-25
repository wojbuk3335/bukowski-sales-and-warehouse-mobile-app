// Korekty (25.10.2026): serwer dolicza do czekającej korekty punkty, w których kurtka jest na stanie
// (stockLocations: [{ symbol, count }]). Tu wspólny napis „P (2 szt.), T (1 szt.)”; pusty, gdy nigdzie nie ma albo stary serwer.
export const stockLocationsText = (stockLocations) => (Array.isArray(stockLocations) && stockLocations.length
  ? stockLocations.map(({ symbol, count }) => `${symbol} (${count} szt.)`).join(', ')
  : '');
