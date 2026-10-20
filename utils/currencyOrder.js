// Kolejność walut w oknie wyboru: najpierw te, którymi klienci płacą u nas najczęściej, potem reszta
// w kolejności z Tabeli walut. PLN zawsze na górze (domyślna). CAD i CAN to ten sam dolar kanadyjski.
const PREFERRED = ['PLN', 'EUR', 'USD', 'HUF', 'CAD', 'CAN'];

const rank = (code) => {
  const index = PREFERRED.indexOf(String(code || '').toUpperCase());
  return index === -1 ? PREFERRED.length : index;
};

export const sortCurrenciesForPicker = (list) =>
  (list || [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item?.code) - rank(b.item?.code) || a.index - b.index)
    .map(({ item }) => item);

export default sortCurrenciesForPicker;
