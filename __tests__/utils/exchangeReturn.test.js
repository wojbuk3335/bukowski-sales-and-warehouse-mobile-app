// Zwrot od klienta przy wymianie: rozpoznanie i stan „dopisane do MAGAZYNU”
import { isExchangeReturn, isExchangeReturnAccepted } from '../../utils/exchangeReturn';

describe('exchangeReturn', () => {
  test('zwrot po polu exchangeReturnFor albo po productId EXCHANGE_RETURN_; zwykłe przepisanie i wymiana - nie', () => {
    expect(isExchangeReturn({ exchangeReturnFor: 'x', transfer_to: 'MAGAZYN' })).toBe(true);
    expect(isExchangeReturn({ productId: 'EXCHANGE_RETURN_abc', transfer_to: 'MAGAZYN' })).toBe(true);
    expect(isExchangeReturn({ productId: '6aded60aeeb01985704c9217', transfer_to: 'T' })).toBe(false);
    expect(isExchangeReturn({ productId: '6aded60aeeb01985704c9217', transfer_to: 'Wymiana' })).toBe(false);
    expect(isExchangeReturn(null)).toBe(false);
  });

  test('„dopisane” dopiero po przyjęciu w MAGAZYNIE, mimo że odpis z punktu jest od razu', () => {
    expect(isExchangeReturnAccepted({ exchangeReturnFor: 'x', blueProcessed: true, yellowProcessed: false })).toBe(false);
    expect(isExchangeReturnAccepted({ exchangeReturnFor: 'x', blueProcessed: true, yellowProcessed: true })).toBe(true);
    expect(isExchangeReturnAccepted({ productId: 'p', blueProcessed: true, yellowProcessed: true })).toBe(false);
  });
});
