import { createContext, useContext, useEffect, useState } from "react";
import * as Navigation from "@react-navigation/native";

// Czy ekran jest na wierzchu (zakładka aktywna, nic nie leży nad nim w stosie). Jak useIsFocused z React Navigation,
// ale bezpieczne poza nawigatorem (testy, komponenty pomocnicze) - wtedy zawsze „tak”.
// Zakładki i ekrany stosu nie odmontowują się po zejściu z wierzchu, więc bez tej bramki odświeżanie na żywo,
// odpytywanie serwera i przeliczenia szły dalej pod spodem, np. pod otwartą Historią.
const FallbackContext = createContext(undefined);
const NavigationContext = Navigation.NavigationContext || FallbackContext;

export default function useScreenFocused() {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => (navigation ? navigation.isFocused() : true));

  useEffect(() => {
    if (!navigation) return undefined;
    setFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener("focus", () => setFocused(true));
    const unsubscribeBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  return navigation ? focused : true;
}
