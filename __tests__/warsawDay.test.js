// S16: dzień pozycji Dobierania po czasie polskim (bez Intl - ta sama logika w panelu i telefonie)
import { warsawDay, warsawOffsetHours } from '../utils/warsawDay';

describe('warsawDay', () => {
  test('po północy polskiego czasu to już nowy dzień, choć UTC ma jeszcze wczoraj', () => {
    expect(warsawDay('2026-07-25T22:30:00.000Z')).toBe('2026-07-26'); // lato: 00:30 CEST
    expect(warsawDay('2026-01-25T23:30:00.000Z')).toBe('2026-01-26'); // zima: 00:30 CET
    expect(warsawDay('2026-01-25T22:30:00.000Z')).toBe('2026-01-25'); // zima: 23:30 CET - jeszcze 25.
    expect(warsawDay(new Date('2026-10-25T12:00:00.000Z'))).toBe('2026-10-25');
  });

  test('zmiana czasu: ostatnia niedziela marca 01:00 UTC → +2, ostatnia niedziela października 01:00 UTC → +1', () => {
    expect(warsawOffsetHours(new Date('2026-03-29T00:59:59.000Z'))).toBe(1);
    expect(warsawOffsetHours(new Date('2026-03-29T01:00:00.000Z'))).toBe(2);
    expect(warsawOffsetHours(new Date('2026-10-25T00:59:59.000Z'))).toBe(2);
    expect(warsawOffsetHours(new Date('2026-10-25T01:00:00.000Z'))).toBe(1);
  });

  test('zła data → null', () => {
    expect(warsawDay('nie-data')).toBeNull();
    expect(warsawDay(undefined)).toBeNull();
  });
});
