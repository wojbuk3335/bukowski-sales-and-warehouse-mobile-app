// Odczyt kodu kreskowego ze zdjęcia z galerii - automatycznie kilka prób.
//
// Na żywo kamera ma dziesiątki klatek na sekundę, a zdjęcie jedną szansę: kod pod kątem, mały na dużym zdjęciu
// albo obrócony bywa nieczytelny. Dlatego przygotowujemy kilka wersji zdjęcia (pomniejszone, wycinki ze środka,
// obrócone) i odczytujemy po kolei, aż któraś się uda.
//
// Obróbka zdjęć (expo-image-manipulator) jest natywna - działa od wersji aplikacji, w której jest wbudowana.
// Na starszych wersjach (aktualizacja OTA) biblioteki nie ma: wtedy jedna próba na oryginale, jak dotąd.

let ImageManipulator = null;
try {
  // eslint-disable-next-line global-require
  const mod = require("expo-image-manipulator");
  if (mod?.manipulateAsync) ImageManipulator = mod;
} catch (error) {
  ImageManipulator = null;
}

export const isPhotoProcessingAvailable = () => Boolean(ImageManipulator);

// Lista kroków obróbki: każda wersja zdjęcia to osobna próba odczytu
export const buildPhotoVariants = (width, height) => {
  if (!width || !height) return [];
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const resize = scale < 1 ? [{ resize: { width: Math.round(width * scale) } }] : [];
  const crop = (fw, fh) => ({
    crop: {
      originX: Math.round((width * (1 - fw)) / 2),
      originY: Math.round((height * (1 - fh)) / 2),
      width: Math.round(width * fw),
      height: Math.round(height * fh),
    },
  });
  return [
    resize,                                   // całe zdjęcie, pomniejszone
    [crop(0.7, 0.5)],                         // środek zdjęcia (kod zwykle w środku kadru)
    [crop(0.5, 0.35)],                        // ciasny środek - mały kod na dużym zdjęciu
    [...resize, { rotate: 90 }],              // kod pionowo
    [crop(0.7, 0.5), { rotate: 90 }],
    [...resize, { rotate: -15 }],             // lekko krzywe zdjęcie
    [...resize, { rotate: 15 }],
  ];
};

/**
 * Szuka kodu na zdjęciu: najpierw oryginał, potem przetworzone wersje.
 * scan(uri) -> Promise<lista wyników> (np. scanFromURLAsync z expo-camera).
 * Zwraca { result, attempts } albo { result: null, attempts }.
 */
export const scanPhotoWithVariants = async ({ uri, width, height, scan }) => {
  let attempts = 0;
  const firstHit = (list) => (list || []).find((item) => item?.data) || null;

  attempts += 1;
  const original = firstHit(await scan(uri));
  if (original || !ImageManipulator) return { result: original, attempts };

  for (const actions of buildPhotoVariants(width, height)) {
    try {
      const variant = await ImageManipulator.manipulateAsync(uri, actions, { compress: 1, format: ImageManipulator.SaveFormat?.JPEG || "jpeg" });
      attempts += 1;
      const hit = firstHit(await scan(variant.uri));
      if (hit) return { result: hit, attempts };
    } catch (error) {
      // ta wersja się nie udała - próbujemy następnej
    }
  }
  return { result: null, attempts };
};
