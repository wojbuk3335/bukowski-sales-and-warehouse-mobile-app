// Jeden kod, dwie aplikacje na Androida:
// - publiczna Bukowski_2026 w Google Play: com.bukowski.inventory2026.mobile2026 (app.json)
// - prywatna aplikacja Workspace (bukowskiapp.eu), z której korzystają pracownicy:
//   com.bukowski.inventory2026Company.mobile2026 (APP_VARIANT=company, profil EAS production-company)
// Obie mają tę samą wersję, runtimeVersion i kanał EAS Update, więc jedno `eas update` aktualizuje obie.
const COMPANY_ANDROID_PACKAGE = 'com.bukowski.inventory2026Company.mobile2026';

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'company') return config;
  return {
    ...config,
    android: {
      ...config.android,
      package: COMPANY_ANDROID_PACKAGE,
    },
  };
};
