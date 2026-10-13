// Komunikat po złożeniu zamówienia - na podstawie tego, co backend FAKTYCZNIE wysłał
// (emails: { customer, business }: 'sent' | 'failed' | 'skipped'). Zamówienie jest zapisane niezależnie od maili.
export const orderEmailMessage = (emails) => {
  const lines = ['Zamówienie zostało złożone!'];
  if (!emails) return lines[0];
  if (emails.customer === 'sent') lines.push('Email z potwierdzeniem został wysłany do klienta.');
  if (emails.customer === 'failed') lines.push('⚠️ Nie udało się wysłać maila z potwierdzeniem do klienta.');
  if (emails.business === 'sent') lines.push('Powiadomienie zostało wysłane do sklepu.');
  if (emails.business === 'failed') lines.push('⚠️ Nie udało się wysłać powiadomienia do sklepu.');
  if (emails.customer === 'failed' || emails.business === 'failed') {
    lines.push('Zamówienie jest zapisane - problem dotyczy tylko poczty.');
  }
  return lines.join('\n\n');
};

export default orderEmailMessage;
