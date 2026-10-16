import { pickDefaultOrangeDate, formatDayLabel, normalizeYmd } from '../../utils/orangeDateChoice';

// Domyślna data w okienku „Potwierdzenie daty przetwarzania” (Dobierz, same pomarańczowe)

describe('pickDefaultOrangeDate', () => {
  test('zwykły przypadek (kalendarz w przeszłości) → data z kalendarza', () => {
    expect(pickDefaultOrangeDate({
      calendarDate: '2026-10-10',
      lastPrintedDate: '2026-10-09',
      today: '2026-10-15',
    })).toBe('calendar');
  });

  test('kalendarz = dzisiaj i ostatni wydruk = wczoraj → ostatni wydruk („rano dobieram za wczoraj”)', () => {
    expect(pickDefaultOrangeDate({
      calendarDate: '2026-10-15',
      lastPrintedDate: '2026-10-14',
      today: '2026-10-15',
    })).toBe('lastPrinted');
  });

  test('kalendarz = dzisiaj, ale ostatni wydruk = przedwczoraj → data z kalendarza', () => {
    expect(pickDefaultOrangeDate({
      calendarDate: '2026-10-15',
      lastPrintedDate: '2026-10-13',
      today: '2026-10-15',
    })).toBe('calendar');
  });

  test('przyjmuje today jako Date; przełom miesiąca liczony lokalnie', () => {
    expect(pickDefaultOrangeDate({
      calendarDate: '2026-11-01',
      lastPrintedDate: '2026-10-31',
      today: new Date(2026, 10, 1, 9, 30),
    })).toBe('lastPrinted');
  });

  test('brak ostatniego wydruku → data z kalendarza', () => {
    expect(pickDefaultOrangeDate({
      calendarDate: '2026-10-15',
      lastPrintedDate: null,
      today: '2026-10-15',
    })).toBe('calendar');
  });
});

describe('formatDayLabel', () => {
  test('formatuje YYYY-MM-DD jako DD.MM.YYYY z polską nazwą dnia tygodnia', () => {
    expect(formatDayLabel('2026-10-14')).toBe('14.10.2026 (środa)');
    expect(formatDayLabel('2026-10-18')).toBe('18.10.2026 (niedziela)');
    expect(formatDayLabel('2026-01-05T10:00:00.000Z')).toBe('05.01.2026 (poniedziałek)');
  });

  test('wartość nieparsowalna lub pusta nie wywala się', () => {
    expect(formatDayLabel('')).toBe('');
    expect(formatDayLabel(null)).toBe('');
    expect(formatDayLabel('abc')).toBe('abc');
  });
});

describe('normalizeYmd', () => {
  test('Date → lokalne YYYY-MM-DD, ISO → pierwsze 10 znaków, brak → pusty string', () => {
    expect(normalizeYmd(new Date(2026, 9, 15, 23, 59))).toBe('2026-10-15');
    expect(normalizeYmd('2026-10-15T22:30:00.000Z')).toBe('2026-10-15');
    expect(normalizeYmd(undefined)).toBe('');
  });
});
