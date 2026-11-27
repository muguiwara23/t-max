// Firma del .apk de Android. Si el flujo de GitHub entrega la llave propia de T-Max
// (variables TMAX_KEYSTORE…, desde los secretos del repositorio), se firma con ella: así
// las actualizaciones se instalan encima y nadie más puede hacer una "actualización" válida.
// Sin esas variables se sigue usando la llave de depuración de React Native (como hasta 0.6).
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            // T-Max: llave propia desde variables de entorno (secretos de GitHub).
            if (System.getenv("TMAX_KEYSTORE")) {
                storeFile file(System.getenv("TMAX_KEYSTORE"))
                storePassword System.getenv("TMAX_KEYSTORE_PASSWORD")
                keyAlias System.getenv("TMAX_KEY_ALIAS")
                keyPassword System.getenv("TMAX_KEY_PASSWORD")
            }
        }`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes('TMAX_KEYSTORE')) return c;
    // 1) agregar la configuración "release" dentro de signingConfigs { … }
    g = g.replace(/signingConfigs\s*\{/, (m) => m + RELEASE_SIGNING);
    // 2) en buildTypes.release usar la llave propia si existe
    const i = g.search(/buildTypes\s*\{/);
    const r = g.indexOf('release {', i);
    const s = g.indexOf('signingConfig signingConfigs.debug', r);
    if (i < 0 || r < 0 || s < 0) throw new Error('android-signing: no se encontró buildTypes.release en build.gradle');
    g = g.slice(0, s) + 'signingConfig System.getenv("TMAX_KEYSTORE") ? signingConfigs.release : signingConfigs.debug' + g.slice(s + 'signingConfig signingConfigs.debug'.length);
    c.modResults.contents = g;
    return c;
  });
};
