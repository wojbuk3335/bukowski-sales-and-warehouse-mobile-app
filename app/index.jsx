import { Redirect } from "expo-router";

// Bez ekranu powitalnego (2.11.2026): dawniej logo i przycisk „Zaloguj się”, który tylko prowadził do logowania -
// jeden zbędny klik przy każdym otwarciu. Ekran logowania sam wpuszcza zalogowanego (ważna sesja) albo pokazuje
// szybkie logowanie / formularz. Aktualizacja OTA sprawdzana jest w głównym layoucie (AppUpdater), więc nie zależy od ekranu.
const Index = () => <Redirect href="/(auth)/sign-in" />;

export default Index;
