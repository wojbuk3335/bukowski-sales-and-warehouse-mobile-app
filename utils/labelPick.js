// Wybór etykiet przed przetwarzaniem w Dobieraniu (28.10.2026): domyślnie drukują się wszystkie dobrane kurtki
// (żółte przychodzące + pomarańczowe z magazynu), ale admin może odznaczyć pojedyncze metki albo przetworzyć
// bez drukowania (np. kurtka ma już dobrą metkę). Ta sama logika jest w panelu (frontend/src/utils/labelPick.js).

const textOf = (value) => (value && typeof value === 'object' ? (value.fullName || value.Roz_Opis || '') : (value || ''));

// Nazwa i rozmiar do pokazania na liście (sprzedaż ma rozmiar jako tekst, towar z magazynu jako obiekt)
export const labelTitle = (item) => {
  const name = textOf(item?.fullName) || 'Nieznana nazwa';
  const size = textOf(item?.size);
  return size ? `${name} ${size}` : name;
};

// Lista do zaznaczania: każda pozycja = jedna kurtka (jedna metka; przy promocji drukarka i tak drukuje dwie)
export const buildLabelChoices = (items) => (Array.isArray(items) ? items : []).map((item, index) => ({
  key: `${item?._id || item?.id || 'label'}-${index}`,
  item,
  title: labelTitle(item),
  code: String(item?.barcode || item?.productId || ''),
  point: String(item?.transfer_to || ''),
  checked: true
}));

export const toggleChoice = (choices, key) => choices.map((choice) => (choice.key === key ? { ...choice, checked: !choice.checked } : choice));

export const setAllChoices = (choices, checked) => choices.map((choice) => ({ ...choice, checked }));

export const pickedItems = (choices) => choices.filter((choice) => choice.checked).map((choice) => choice.item);

export const pickedCount = (choices) => choices.filter((choice) => choice.checked).length;
