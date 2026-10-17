// Sprzedaż w kilku walutach: ile klient już zapłacił (w PLN) i ile ma jeszcze dopłacić w wybranej walucie.
// Kursy z API (/currency-rates): buyRate = kurs do przeliczeń (własny z panelu albo kantoru).
// Waluty „za 100” (np. HUF) mają kurs za 100 jednostek.

const toNumber = (value) => {
  const number = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
};

// Kurs 1 jednostki waluty w PLN; null = brak kursu
export const plnPerUnit = (code, currencyRates) => {
  if (!code || code === "PLN") return 1;
  const rate = (currencyRates || []).find((item) => item?.currency?.code === code);
  const value = Number(rate?.buyRate);
  if (!rate || !Number.isFinite(value) || value <= 0) return null;
  const per100 = String(rate.currency?.name || "").includes("za 100");
  return per100 ? value / 100 : value;
};

/**
 * price: cena w PLN; payments: [{ price, currency }] (gotówka i karta razem).
 * Zwraca { paidPln, remainingPln (ujemne = reszta), missingRates: [kody walut bez kursu] }.
 */
export const computePaymentBalance = ({ price, payments, currencyRates }) => {
  const missingRates = [];
  const paidPln = (payments || []).reduce((sum, payment) => {
    const amount = toNumber(payment?.price);
    if (amount <= 0) return sum;
    const unit = plnPerUnit(payment.currency || "PLN", currencyRates);
    if (unit === null) {
      if (!missingRates.includes(payment.currency)) missingRates.push(payment.currency);
      return sum;
    }
    return sum + amount * unit;
  }, 0);
  return { paidPln, remainingPln: toNumber(price) - paidPln, missingRates };
};

// Kwota w PLN przeliczona na walutę; null = brak kursu
export const plnToCurrency = (pln, code, currencyRates) => {
  const unit = plnPerUnit(code, currencyRates);
  return unit === null ? null : pln / unit;
};

export const formatMoney = (value) => (Math.round(value * 100) / 100).toFixed(2);
