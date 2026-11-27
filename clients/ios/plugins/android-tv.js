// Android TV: aparece en el menú de la tele (LEANBACK_LAUNCHER), con su banner, y no exige pantalla táctil.
// La misma app sirve para teléfonos, tablets y TV.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require(require.resolve('expo/config-plugins', { paths: [process.cwd(), __dirname] }));

function withBanner(config) {
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(c.modRequest.projectRoot, 'assets/tv-banner.png'), path.join(dir, 'tv_banner.png'));
      return c;
    },
  ]);
}

module.exports = function withAndroidTv(config) {
  config = withBanner(config);
  return withAndroidManifest(config, (c) => {
    const m = c.modResults.manifest;
    m['uses-feature'] = m['uses-feature'] || [];
    const want = [
      ['android.software.leanback', 'false'],
      ['android.hardware.touchscreen', 'false'],
    ];
    for (const [name, required] of want) {
      if (!m['uses-feature'].some((f) => f.$['android:name'] === name)) {
        m['uses-feature'].push({ $: { 'android:name': name, 'android:required': required } });
      }
    }
    const app = m.application[0];
    app.$['android:banner'] = '@drawable/tv_banner';
    const main = app.activity.find((a) => (a['intent-filter'] || []).some((f) => (f.action || []).some((x) => x.$['android:name'] === 'android.intent.action.MAIN')));
    if (main) {
      const filter = main['intent-filter'].find((f) => (f.action || []).some((x) => x.$['android:name'] === 'android.intent.action.MAIN'));
      filter.category = filter.category || [];
      if (!filter.category.some((x) => x.$['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER')) {
        filter.category.push({ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } });
      }
    }
    return c;
  });
};
