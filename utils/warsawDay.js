// Dzień kalendarzowy w Polsce ('YYYY-MM-DD') dla zapisanej daty (S16, 25.10.2026).
// Dobieranie i przepisania liczyły dzień po UTC: przepisanie zrobione o 00:30 w nocy (polskiego czasu) ma w UTC
// jeszcze poprzedni dzień i lądowało pod wczorajszą datą. Liczymy dzień polski - bez Intl, żeby działało tak samo
// w telefonie (Hermes), w przeglądarce i w testach.
// Polska: UTC+1 (zima) / UTC+2 (lato); czas letni od ostatniej niedzieli marca 01:00 UTC do ostatniej niedzieli października 01:00 UTC.
const lastSundayUtc = (year, monthIndex) => {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return Date.UTC(year, monthIndex, lastDay.getUTCDate() - lastDay.getUTCDay(), 1, 0, 0);
};

export const warsawOffsetHours = (date) => {
  const time = date.getTime();
  const year = date.getUTCFullYear();
  return time >= lastSundayUtc(year, 2) && time < lastSundayUtc(year, 9) ? 2 : 1;
};

export const warsawDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + warsawOffsetHours(date) * 3600000).toISOString().slice(0, 10);
};

export const warsawToday = () => warsawDay(new Date());
