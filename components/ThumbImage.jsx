import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';

// Miniatura zdjęcia z serwera; gdy się nie wczyta (brak miniatury, obcy serwer), raz przełącza się na oryginał.
// Dzięki temu zdjęcie nie znika, nawet jeśli wersji /thumb/ nie da się pobrać (zgłoszenie 25.10.2026).
const ThumbImage = ({ uri, fallbackUri, ...imageProps }) => {
  const [current, setCurrent] = useState(uri);
  useEffect(() => { setCurrent(uri); }, [uri]);
  if (!current) return null;
  return (
    <Image
      {...imageProps}
      source={{ uri: current }}
      onError={() => {
        if (fallbackUri && current !== fallbackUri) setCurrent(fallbackUri);
      }}
    />
  );
};

export default ThumbImage;
