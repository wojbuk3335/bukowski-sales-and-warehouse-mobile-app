/**
 * Wysyłki: komunikat po złożeniu zamówienia mówi prawdę o mailach (audyt 13.10.2026, problem 1).
 */
/* global test, expect */
import { orderEmailMessage } from '../utils/orderEmailMessage';

test('oba maile wysłane', () => {
  const text = orderEmailMessage({ customer: 'sent', business: 'sent' });
  expect(text).toContain('Email z potwierdzeniem został wysłany do klienta.');
  expect(text).toContain('Powiadomienie zostało wysłane do sklepu.');
  expect(text).not.toContain('⚠️');
});

test('poczta nie działa: ostrzeżenie, ale zamówienie zapisane', () => {
  const text = orderEmailMessage({ customer: 'failed', business: 'failed' });
  expect(text).toContain('Nie udało się wysłać maila z potwierdzeniem do klienta.');
  expect(text).toContain('Zamówienie jest zapisane');
  expect(text).not.toContain('został wysłany do klienta');
});

test('klient bez e-maila: nic o mailu do klienta', () => {
  const text = orderEmailMessage({ customer: 'skipped', business: 'sent' });
  expect(text).not.toMatch(/klient/i);
  expect(text).toContain('Powiadomienie zostało wysłane do sklepu.');
});

test('stary backend bez informacji o mailach: tylko „złożone”, bez obietnic', () => {
  expect(orderEmailMessage(undefined)).toBe('Zamówienie zostało złożone!');
});
