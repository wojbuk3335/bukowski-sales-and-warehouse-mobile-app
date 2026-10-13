// Realizacja zamówienia: data wysyłki w lokalnej strefie i komunikat wg FAKTYCZNIE wysłanych powiadomień
// (notifications: { email, sms } = 'sent' | 'test' | 'failed' | 'skipped' | 'invalid_phone').

// YYYY-MM-DD z lokalnej daty telefonu - toISOString() dawał dzień wcześniej przed 2:00 w nocy
export const localDateString = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

export const orderCompletionMessage = (notifications = {}) => {
  const { email, sms } = notifications || {};
  const lines = ['✅ Zamówienie zostało zrealizowane!'];
  if (email === 'sent') lines.push('✉️ Mail do klienta: wysłany.');
  if (email === 'failed') lines.push('⚠️ Mail do klienta: nie udało się wysłać.');
  if (email === 'skipped') lines.push('✉️ Mail do klienta: pominięty (brak adresu e-mail).');
  if (sms === 'sent') lines.push('📱 SMS do klienta: wysłany.');
  if (sms === 'test') lines.push('📱 SMS do klienta: sprawdzony w trybie testowym (nie wysłano).');
  if (sms === 'failed') lines.push('⚠️ SMS do klienta: nie udało się wysłać.');
  if (sms === 'invalid_phone') lines.push('⚠️ SMS do klienta: nieprawidłowy numer telefonu.');
  if (email === 'failed' || sms === 'failed' || sms === 'invalid_phone') {
    lines.push('Realizacja jest zapisana - problem dotyczy tylko powiadomień.');
  }
  return lines.join('\n\n');
};

export default orderCompletionMessage;
