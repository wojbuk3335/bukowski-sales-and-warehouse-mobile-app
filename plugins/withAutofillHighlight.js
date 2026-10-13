// Kolor podświetlenia pól wypełnionych automatycznie (np. hasło z Bitwardena) na Androidzie.
// Domyślnie system rysuje zielonkawą/żółtą nakładkę, która nie pasuje do motywów aplikacji -
// tutaj delikatny niebieski kolor aplikacji (15% krycia).
//
// Zmiana natywna: działa dopiero w nowym buildzie (EAS build), nie przez aktualizację OTA.
const fs = require('fs');
const path = require('path');
const { withAndroidStyles, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');

const DRAWABLE_NAME = 'autofill_highlight';
const HIGHLIGHT_COLOR = '#260D6EFD'; // ARGB: 15% krycia, #0D6EFD

const withAutofillDrawable = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${DRAWABLE_NAME}.xml`),
        `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n  <solid android:color="${HIGHLIGHT_COLOR}" />\n</shape>\n`
      );
      return cfg;
    },
  ]);

const withAutofillStyle = (config) =>
  withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:autofilledHighlight',
      value: `@drawable/${DRAWABLE_NAME}`,
    });
    return cfg;
  });

module.exports = (config) => withAutofillStyle(withAutofillDrawable(config));
