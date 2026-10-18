import { formatOrderDeposit, orderMatchScore, orderProductName, sortPickupOrders } from '../utils/pickupOrders';

describe('zamówienia do wydania przy sprzedaży', () => {
  const adelaXL = { orderId: 'ORD-1', product: { name: 'ADELA', color: 'CZARNY', size: 'XL' }, realizationDate: '2026-10-20' };
  const adelaM = { orderId: 'ORD-2', product: { name: 'ADELA', color: 'CZARNY', size: 'M' }, realizationDate: '2026-10-18' };
  const amanda = { orderId: 'ORD-3', product: { name: 'AMANDA', color: 'BRĄZ', size: 'L' }, realizationDate: '2026-10-15' };

  test('opis zaliczki: jedna waluta, kilka walut, brak', () => {
    expect(formatOrderDeposit({ deposit: 300, depositCurrency: 'PLN' })).toBe('300.00 zł');
    expect(formatOrderDeposit({ deposit: 100, depositCurrency: 'EUR' })).toBe('100.00 EUR');
    expect(formatOrderDeposit({ deposit: 630, depositCurrency: 'PLN', deposits: [{ amount: 100, currency: 'EUR' }, { amount: 200, currency: 'PLN' }] }))
      .toBe('100.00 EUR + 200.00 zł');
    expect(formatOrderDeposit({ deposit: 0 })).toBe('brak');
  });

  test('nazwa produktu z zamówienia', () => {
    expect(orderProductName(adelaXL)).toBe('ADELA CZARNY XL');
  });

  test('dopasowanie do zeskanowanej kurtki: model, kolor, rozmiar', () => {
    expect(orderMatchScore(adelaXL, 'Adela Czarny XL')).toBe(4);
    expect(orderMatchScore(adelaM, 'Adela Czarny XL')).toBe(3);
    expect(orderMatchScore(amanda, 'Adela Czarny XL')).toBe(0);
    expect(orderMatchScore(adelaXL, '')).toBe(0);
  });

  test('kolejność: pasujące najpierw, potem najbliższy termin', () => {
    expect(sortPickupOrders([amanda, adelaM, adelaXL], 'ADELA CZARNY XL').map((order) => order.orderId)).toEqual(['ORD-1', 'ORD-2', 'ORD-3']);
    expect(sortPickupOrders([adelaXL, amanda, adelaM], '').map((order) => order.orderId)).toEqual(['ORD-3', 'ORD-2', 'ORD-1']);
  });
});
