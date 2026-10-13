/**
 * Wysyłki: realizacja w mobile - data lokalna (bez przesunięcia o dzień) i komunikat wg faktycznie wysłanych powiadomień.
 */
/* global test, expect */
import { localDateString, orderCompletionMessage } from '../utils/orderCompletionMessage';

test('data wysyłki z lokalnego dnia telefonu, także tuż po północy', () => {
  expect(localDateString(new Date(2026, 9, 14, 0, 30))).toBe('2026-10-14');
  expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});

test('mail wysłany, SMS nie: ostrzeżenie i informacja, że realizacja zapisana', () => {
  const text = orderCompletionMessage({ email: 'sent', sms: 'failed' });
  expect(text).toContain('Mail do klienta: wysłany');
  expect(text).toContain('SMS do klienta: nie udało się wysłać');
  expect(text).toContain('Realizacja jest zapisana');
});

test('wszystko wysłane: bez ostrzeżeń; stary backend bez informacji: tylko „zrealizowane”', () => {
  expect(orderCompletionMessage({ email: 'sent', sms: 'sent' })).not.toContain('⚠️');
  expect(orderCompletionMessage(undefined)).toBe('✅ Zamówienie zostało zrealizowane!');
});
