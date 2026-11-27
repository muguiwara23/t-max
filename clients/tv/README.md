# T-Max TV

App de T-Max para **Android TV** (Apple TV más adelante) con React Native TV. Ver `docs/adr/0011-cliente-tv.md`.

- Comparte con la app del celular `clients/ios/src` (datos, reproductor, tipografía) mediante `@shared/…`.
- Pantallas propias para el control remoto en `src/`.
- Compilar: Actions → **App Android TV (T-Max TV)** → artefacto `T-Max-TV-apk`.
- Local: `npm install`, `npm run typecheck`, `EXPO_TV=1 npx expo export --platform android`.

Estado (paso 1): inicio con grupos y canales (con lo que pasa ahora), reproductor a pantalla completa
(Arriba/Abajo = canal, OK = info, Atrás = salir) y agregar fuentes con el control. Sin probar todavía en una TV real.
