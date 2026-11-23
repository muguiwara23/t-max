# T-Max para iPhone / iPad

App React Native (Expo SDK 57) con reproducción por **libmpv** (`expo-mpv` / MPVKit) y el núcleo compartido `@tmax/core`.

**Todo corre en el dispositivo:** fuentes, canales y guía en SQLite local; contraseñas y MAC en el Keychain. El iPad habla directo con las fuentes del usuario. No hay cuentas, servidores de T-Max ni telemetría.

## v0.2

- Ajustes → Fuentes: Xtream, M3U y Stalker (agregar, activar, actualizar, editar, borrar).
- TV en vivo: Grupos → canales → Atrás; Favoritos y Recientes; búsqueda por nombre o número; vista previa; ficha "Ahora" y "A continuación".
- Guía por canales con línea de "ahora" y desplazamiento por horas.
- Reproductor a pantalla completa: canal anterior/siguiente, pausa, audio, subtítulos y lista de canales.
- Ajustes → Reproductor: formato TS / M3U8 / automático. Acerca de: borrar todos los datos.

## Obtener el `.ipa`

GitHub → Actions → **App iOS (T-Max)** → la ejecución verde más reciente → artefacto **T-Max-ipa-sin-firmar**. Firmar con Flarestore.

## Desarrollo

```bash
npm ci
npm run typecheck
npm test
npx expo export --platform ios   # verifica el empaquetado JS
```
