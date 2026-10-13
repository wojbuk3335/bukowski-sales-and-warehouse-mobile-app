// Komunikat po złożeniu zamówienia - na podstawie tego, co backend FAKTYCZNIE wysłał
// (emails: { customer, business }: 'sent' | 'failed' | 'skipped';
//  sms: 'sent' | 'test' | 'failed' | 'invalid_phone' | 'skipped'). Zamówienie jest zapisane niezależnie od maili i SMS-a.
export const orderEmailMessage = (emails, sms) => {
  const lines = ['Zamówienie zostało złożone!'];
  if (sms === 'sent') lines.push('SMS z potwierdzeniem został wysłany do klienta.');
  if (sms === 'test') lines.push('SMS sprawdzony w trybie testowym (nie wysłano).');
  if (sms === 'failed') lines.push('⚠️ Nie udało się wysłać SMS-a do klienta.');
  if (sms === 'invalid_phone') lines.push('⚠️ SMS nie wysłany - sprawdź numer telefonu klienta.');
  if (!emails) return lines.join('\n\n');
  if (emails.customer === 'sent') lines.push('Email z potwierdzeniem został wysłany do klienta.');
  if (emails.customer === 'failed') lines.push('⚠️ Nie udało się wysłać maila z potwierdzeniem do klienta.');
  if (emails.business === 'sent') lines.push('Powiadomienie zostało wysłane do sklepu.');
  if (emails.business === 'failed') lines.push('⚠️ Nie udało się wysłać powiadomienia do sklepu.');
  if (emails.customer === 'failed' || emails.business === 'failed' || sms === 'failed' || sms === 'invalid_phone') {
    lines.push('Zamówienie jest zapisane - problem dotyczy tylko powiadomień.');
  }
  return lines.join('\n\n');
};

export default orderEmailMessage;
