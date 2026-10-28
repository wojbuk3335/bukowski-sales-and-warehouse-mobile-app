// Wybór etykiet przed przetwarzaniem w Dobieraniu (28.10.2026) - ta sama logika w telefonie i w panelu
import { buildLabelChoices, toggleChoice, setAllChoices, pickedItems, pickedCount, labelTitle } from '../../utils/labelPick';
import { isDobieraniePoint, isCudzichUser } from '../../utils/cudzich';

const items = [
  { _id: 'w1', fullName: { fullName: 'Ada CZERWONY' }, size: { Roz_Opis: 'XL' }, barcode: '0010701300002', transfer_to: 'P' },
  { _id: 's1', fullName: 'Amanda CHABROWY', size: '4XL', barcode: '0100504300009', isFromSale: true, transfer_to: 'P' },
  { _id: 'w1', fullName: { fullName: 'Ada CZERWONY' }, size: { Roz_Opis: 'XL' }, barcode: '0010701300002', transfer_to: 'P' }, // ten sam towar drugi raz
];

test('domyślnie wszystkie zaznaczone, każda sztuka osobno (także ten sam towar dwa razy)', () => {
  const choices = buildLabelChoices(items);
  expect(choices).toHaveLength(3);
  expect(new Set(choices.map((c) => c.key)).size).toBe(3);
  expect(choices.every((c) => c.checked)).toBe(true);
  expect(choices.map((c) => c.title)).toEqual(['Ada CZERWONY XL', 'Amanda CHABROWY 4XL', 'Ada CZERWONY XL']);
  expect(choices[0].code).toBe('0010701300002');
  expect(choices[0].point).toBe('P');
  expect(pickedCount(choices)).toBe(3);
});

test('odznaczenie jednej metki: drukują się pozostałe, odznaczona nie; „odznacz wszystkie” = przetwarzanie bez drukowania', () => {
  let choices = buildLabelChoices(items);
  choices = toggleChoice(choices, choices[1].key);
  expect(pickedCount(choices)).toBe(2);
  expect(pickedItems(choices).map((item) => item._id)).toEqual(['w1', 'w1']);
  choices = toggleChoice(choices, choices[1].key);
  expect(pickedCount(choices)).toBe(3);
  choices = setAllChoices(choices, false);
  expect(pickedItems(choices)).toEqual([]);
  expect(pickedCount(setAllChoices(choices, true))).toBe(3);
});

test('nazwa bez rozmiaru i nieznana nazwa', () => {
  expect(labelTitle({ fullName: 'Torebka 12' })).toBe('Torebka 12');
  expect(labelTitle({})).toBe('Nieznana nazwa');
  expect(buildLabelChoices(null)).toEqual([]);
});

// Audyt 28.10.2026: lista punktów w Dobieraniu w telefonie jak w panelu (dawniej `!u.isAdmin` nic nie odfiltrowywało)
test('punkty do Dobierania: bez admina, domu i Cudzicha; MAGAZYN i punkty zostają', () => {
  expect(isDobieraniePoint({ symbol: 'P', role: 'user' })).toBe(true);
  expect(isDobieraniePoint({ symbol: 'MAGAZYN', role: 'magazyn' })).toBe(true);
  expect(isDobieraniePoint({ symbol: 'ADM', role: 'admin' })).toBe(false);
  expect(isDobieraniePoint({ symbol: 'dom', role: 'dom' })).toBe(false);
  expect(isDobieraniePoint({ symbol: 'CUDZICH', role: 'cudzich' })).toBe(false);
  expect(isCudzichUser({ symbol: 'C2', sellingPoint: 'Cudzcih 2' })).toBe(true);
  expect(isCudzichUser({ symbol: 'SOP', sellingPoint: 'Sopot' })).toBe(false);
});
