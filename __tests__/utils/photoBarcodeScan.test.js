// Odczyt kodu ze zdjęcia: oryginał, potem przetworzone wersje (pomniejszenie, wycinki, obroty)
const mockManipulateAsync = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

const { buildPhotoVariants, isPhotoProcessingAvailable, scanPhotoWithVariants } = require('../../utils/photoBarcodeScan');

describe('photoBarcodeScan', () => {
  beforeEach(() => {
    mockManipulateAsync.mockReset();
    mockManipulateAsync.mockImplementation((uri, actions) => Promise.resolve({ uri: `${uri}#${JSON.stringify(actions)}` }));
  });

  test('obróbka zdjęć dostępna, gdy biblioteka jest w aplikacji', () => {
    expect(isPhotoProcessingAvailable()).toBe(true);
  });

  test('kod na oryginale: jedna próba, bez obróbki', async () => {
    const scan = jest.fn().mockResolvedValue([{ data: '0040408300005', type: 'code128' }]);
    const { result, attempts } = await scanPhotoWithVariants({ uri: 'file:///a.jpg', width: 4000, height: 3000, scan });
    expect(result.data).toBe('0040408300005');
    expect(attempts).toBe(1);
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  test('kod dopiero na wycinku ze środka: kolejne próby aż do skutku', async () => {
    const scan = jest.fn()
      .mockResolvedValueOnce([])  // oryginał
      .mockResolvedValueOnce([])  // pomniejszone
      .mockResolvedValueOnce([{ data: '0040408300005', type: 'code128' }]); // środek
    const { result, attempts } = await scanPhotoWithVariants({ uri: 'file:///a.jpg', width: 4000, height: 3000, scan });
    expect(result.data).toBe('0040408300005');
    expect(attempts).toBe(3);
    expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
    expect(mockManipulateAsync.mock.calls[1][1][0].crop).toEqual({ originX: 600, originY: 750, width: 2800, height: 1500 });
  });

  test('brak kodu na żadnej wersji: null i liczba prób', async () => {
    const scan = jest.fn().mockResolvedValue([]);
    const { result, attempts } = await scanPhotoWithVariants({ uri: 'file:///a.jpg', width: 4000, height: 3000, scan });
    expect(result).toBeNull();
    expect(attempts).toBe(1 + buildPhotoVariants(4000, 3000).length);
  });

  test('pomniejszenie tylko dużych zdjęć; bez wymiarów brak wariantów', () => {
    expect(buildPhotoVariants(4000, 3000)[0]).toEqual([{ resize: { width: 1600 } }]);
    expect(buildPhotoVariants(1200, 900)[0]).toEqual([]);
    expect(buildPhotoVariants(0, 0)).toEqual([]);
  });
});
