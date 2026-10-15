// Okienko „Potwierdzenie daty przetwarzania” (Dobierz, partia samych pomarańczowych z magazynu):
// wybór domyślnej daty i etykiety dni. Daty biznesowe jako 'YYYY-MM-DD' w czasie lokalnym.

const POLISH_WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

const pad = (number) => String(number).padStart(2, '0');

const formatYmdLocal = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Date → 'YYYY-MM-DD' (lokalnie); string/ISO → pierwsze 10 znaków; brak → ''
export const normalizeYmd = (value) => {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : formatYmdLocal(value);
  return String(value).slice(0, 10);
};

const parseYmdLocal = (value) => {
  const [year, month, day] = normalizeYmd(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const shiftYmd = (value, days) => {
  const date = parseYmdLocal(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return formatYmdLocal(date);
};

// '2026-10-14' -> '14.10.2026 (środa)'
export const formatDayLabel = (value) => {
  const date = parseYmdLocal(value);
  if (!date) return normalizeYmd(value);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} (${POLISH_WEEKDAYS[date.getDay()]})`;
};

// Domyślny wybór: zwykle data z kalendarza ('calendar'); wyjątek „rano dobieram za wczoraj”
// (kalendarz = dzisiaj i ostatni wydruk = wczoraj) → 'lastPrinted'.
export const pickDefaultOrangeDate = ({ calendarDate, lastPrintedDate, today = new Date() }) => {
  const calendar = normalizeYmd(calendarDate);
  const lastPrinted = normalizeYmd(lastPrintedDate);
  const todayYmd = normalizeYmd(today);

  if (calendar && calendar === todayYmd && lastPrinted && lastPrinted === shiftYmd(todayYmd, -1)) {
    return 'lastPrinted';
  }
  return 'calendar';
};
