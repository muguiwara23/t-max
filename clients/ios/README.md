# T-Max para iPhone / iPad

App React Native (Expo SDK 57) con reproducción por **libmpv** (`expo-mpv` / MPVKit) y el núcleo compartido `@tmax/core`.

**Todo corre en el dispositivo:** fuentes, canales y guía en SQLite local; contraseñas y MAC en el Keychain. El iPad habla directo con las fuentes del usuario. No hay cuentas, servidores de T-Max ni telemetría.

## v0.2

- Ajustes → Fuentes: Xtream, M3U y Stalker (agregar, activar, actualizar, editar, borrar).
- TV en vivo: Grupos → canales → Atrás; Favoritos y Recientes; búsqueda por nombre o número; vista previa; ficha "Ahora" y "A continuación".
- Guía por canales con línea de "ahora" y desplazamiento por horas.
- Reproductor a pantalla completa: canal anterior/siguiente, pausa, audio, subtítulos y lista de canales.
- Ajustes → Reproductor: formato TS / M3U8 / automático. Acerca de: borrar todos los datos.

## v0.3

- **Películas y Series** (fuentes Xtream): el catálogo se descarga al actualizar la fuente y se guarda en el iPad.
  - Pestañas por fuente, "Continuar viendo", categorías, Favoritos, cuadrícula de pósters y búsqueda.
  - Ficha de película y de serie con datos del proveedor (se piden al abrirla). Temporadas, episodios y avance por episodio.
- Reproductor de películas/episodios: barra de tiempo, –10 s / +30 s, audio, subtítulos, siguiente episodio; guarda dónde te quedaste (visto al 95 %).
- Stalker: la sesión del portal se renueva cada 20 min o cuando el portal la rechaza.
- Pendiente: películas/series de Stalker y M3U; metadatos TMDB opcionales (ADR-0009).

## Obtener el `.ipa`

GitHub → Actions → **App iOS (T-Max)** → la ejecución verde más reciente → artefacto **T-Max-ipa-sin-firmar**. Firmar con Flarestore.

## Desarrollo

```bash
npm ci
npm run typecheck
npm test
npx expo export --platform ios   # verifica el empaquetado JS
```
