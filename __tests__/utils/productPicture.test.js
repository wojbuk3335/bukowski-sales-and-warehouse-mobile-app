// Miniatura zdjęcia w Dobieraniu (telefon): karta produktu po nazwie, a po zmianie nazwy - po kodzie
import { findGoodForItem, itemPictureUrl, pictureUrl } from '../../utils/productPicture';

const BASE = 'https://bukowskiapp.pl';
const GOODS = [
  { _id: 'g1', fullName: 'Ada CZERWONY', code: '0017003000003', category: 'Kurtki kożuchy futra', picture: 'ada.jpg' },
  { _id: 'g2', fullName: 'Torebka X', code: '0000600013219', category: 'Torebki', picture: 'http://localhost:3000/images/t.jpg' },
  { _id: 'g3', fullName: 'Bez zdjęcia', code: '0000600010560', category: 'Torebki', picture: '' },
];

describe('productPicture (mobile)', () => {
  test('po nazwie albo po kodzie (kurtka: 5 pierwszych cyfr)', () => {
    expect(findGoodForItem(GOODS, { fullName: { fullName: 'ADA czerwony' } })._id).toBe('g1');
    expect(findGoodForItem(GOODS, { fullName: 'Stara nazwa', barcode: '0017008000006' })._id).toBe('g1');
    expect(findGoodForItem(GOODS, { fullName: 'Stara torebka', barcode: '0000600013219' })._id).toBe('g2');
    expect(findGoodForItem(GOODS, { fullName: 'Nieznana', barcode: '0009999999999' })).toBeNull();
  });

  test('adres zdjęcia: plik → /images, localhost → serwer, brak → null', () => {
    expect(itemPictureUrl(GOODS, { fullName: 'Ada CZERWONY' }, BASE)).toBe('https://bukowskiapp.pl/images/ada.jpg');
    expect(itemPictureUrl(GOODS, { fullName: 'Torebka X' }, BASE)).toBe('https://bukowskiapp.pl/images/t.jpg');
    expect(itemPictureUrl(GOODS, { fullName: 'Bez zdjęcia' }, BASE)).toBeNull();
    expect(pictureUrl('/images/a.jpg', BASE)).toBe('https://bukowskiapp.pl/images/a.jpg');
  });
});
