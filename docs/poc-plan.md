# Plan de la Fase 0 — pruebas de viabilidad

Cada POC es un proyecto mínimo y desechable. El objetivo es responder `go / conditional / no-go` con evidencia, no construir la app. Los resultados se registran en `platform-compatibility.md`.

## Streams de prueba

1. **Sintéticos** (en el repo, generados con ffmpeg en CI): `testsrc` + tono, en `.ts`, HLS y MP4; H.264/AAC, más una variante HEVC y otra con dos pistas de audio y subtítulos.
2. **Reales** (solo en local, nunca en el repo): canales del Dispatcharr de Arturo en `.ts` y `.m3u8`, y un portal Stalker si hay uno disponible.

## POC 1 — iPhone / iPad (primero)

| Paso | Criterio de éxito |
|---|---|
| App React Native mínima compilada en GitHub Actions → `.ipa` sin firmar | Instala y abre tras firmar con Flarestore |
| Módulo nativo con MPVKit | Reproduce `.ts` directo y `.m3u8` |
| Cambio de canal ×20 | Sin fugas de memoria ni bloqueos; tiempo medido |
| Pistas de audio y subtítulos | Se listan y se pueden cambiar |
| App en segundo plano y de vuelta | Reanuda o se recupera sin crash |
| PiP | Funciona, o se documenta que no |
| Cliente Xtream y Stalker reales (en local) | Login, lista de canales y reproducción |

**Necesita:** iPad o iPhone, cuenta de Flarestore. Nada más.

## POC 2 — Samsung Tizen

Web app mínima con AVPlay: `.ts`, `.m3u8`, pistas, mando, IndexedDB, petición a Stalker con cabeceras.

**Necesita:** TV Samsung (anotar el año y la versión de Tizen), Tizen Studio o CLI en la PC, cuenta de Samsung para el certificado.

## POC 3 — LG webOS

Web app mínima: HTML5 `<video>` con `.ts` y `.m3u8`; mpegts.js si hace falta; Magic Remote; IndexedDB; Stalker desde la web app y desde un servicio JS.

**Necesita:** TV LG (anotar la versión de webOS), app Developer Mode, `ares-cli` en la PC (Node.js).

## POC 4 — Roku

Canal SceneGraph mínimo: nodo `Video` con `.m3u8` y prueba de `.ts`; descarga de lista M3U pequeña; medir memoria y tiempos; `roRegistry`; Stalker con `roUrlTransfer`; probar un Output Profile HLS de Dispatcharr.

**Necesita:** cualquier Roku en modo desarrollador (no requiere herramientas en la PC: se sube un `.zip` desde el navegador).

## Herramientas en la PC con Windows

Por ahora no hace falta instalar nada: todo compila en GitHub Actions. Solo para instalar en las TVs:

| Herramienta | Para | Cuándo |
|---|---|---|
| Git (o GitHub Desktop) | Tener el repo en `Documents\T-Max` | Opcional |
| Node.js LTS + `@webos-tools/cli` | Instalar en LG | POC 3 |
| Tizen Studio CLI | Certificado e instalación en Samsung | POC 2 |
