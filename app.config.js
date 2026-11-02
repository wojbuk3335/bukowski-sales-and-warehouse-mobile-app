// Jeden kod, dwie aplikacje na Androida:
// - publiczna Bukowski_2026 w Google Play: com.bukowski.inventory2026.mobile2026 (app.json)
// - prywatna aplikacja Workspace (bukowskiapp.eu), z której korzystają pracownicy:
//   com.bukowski.inventory2026Company.mobile2026 (APP_VARIANT=company, profil EAS production-company)
// Obie mają tę samą wersję, runtimeVersion i kanał EAS Update, więc jedno `eas update` aktualizuje obie.
const COMPANY_ANDROID_PACKAGE = 'com.bukowski.inventory2026Company.mobile2026';

// Buildy ze sklepu (profile production / production-company) bez uprawnień, których aplikacja nie używa,
// a które dokładają biblioteki (2.11.2026, audyt bezpieczeństwa): mikrofon (expo-camera - skanujemy tylko kody,
// bez nagrywania), nakładki na inne aplikacje (expo-dev-client - potrzebne tylko w buildzie deweloperskim),
// zapis do pamięci (nieużywany; od Androida 11 i tak bez skutku). Build deweloperski zostawiamy bez zmian,
// żeby menu deweloperskie działało.
const STORE_BUILD_PROFILES = ['production', 'production-company'];
const BLOCKED_PERMISSIONS_IN_STORE_BUILDS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

module.exports = ({ config }) => {
  const storeBuild = STORE_BUILD_PROFILES.includes(process.env.EAS_BUILD_PROFILE);
  const android = {
    ...config.android,
    ...(process.env.APP_VARIANT === 'company' ? { package: COMPANY_ANDROID_PACKAGE } : {}),
    ...(storeBuild ? { blockedPermissions: BLOCKED_PERMISSIONS_IN_STORE_BUILDS } : {}),
  };
  return { ...config, android };
};
