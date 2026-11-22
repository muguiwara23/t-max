# ADR-0003: Motor de reproducción y estrategia de formatos

**Estado:** Aceptado para iOS (POC en iPad superado el 2026-11-22); pendiente en Tizen, webOS y Roku
**Fecha:** 2026-11-22

## Contexto

Es el riesgo técnico principal del proyecto. Los canales en vivo de Xtream y Stalker llegan casi siempre como **MPEG-TS por HTTP** (`.ts` directo), no como HLS:

- AVPlayer (Apple) solo reproduce TS dentro de HLS.
- Roku documenta TS como contenedor no soportado fuera de HLS (algunos modelos lo reproducen).
- En Tizen y webOS depende del reproductor del sistema y de la versión.

Muchos servidores Xtream ofrecen el mismo canal en `.ts` y en `.m3u8`, y lo anuncian en `user_info.allowed_output_formats` al iniciar sesión.

## Decisión

### Motor por plataforma

| Plataforma | Motor principal | Plan B |
|---|---|---|
| iPhone/iPad | **libmpv vía MPVKit** (compilación LGPL), envuelto en un módulo nativo de React Native | VLCKit |
| Tizen | AVPlay (Samsung) | HTML5 `<video>` |
| webOS | HTML5 media del sistema | mpegts.js (convierte TS a fMP4 por MSE) si el modelo soporta MSE |
| Roku | Nodo `Video` del sistema | Ninguno: Roku no permite código nativo |

libmpv **no** es posible en Roku (no admite código nativo) ni en las web apps de Tizen/webOS (no cargan librerías nativas). Existen ports de libmpv a WebAssembly, pero orientados a audio; no son viables para vídeo en vivo en una TV.

### Negociación de formato

`core` decide qué URL pedir según las capacidades declaradas por cada `PlayerAdapter`:

1. Si el adaptador reproduce TS directo → pedir `.ts` (menor latencia y menos carga en el servidor).
2. Si no → pedir `.m3u8` cuando el servidor lo anuncia.
3. Si el servidor solo ofrece TS y el adaptador no lo soporta → error claro: "Este canal no es compatible con este dispositivo", sin intentos a ciegas.

El usuario puede forzar el formato por fuente.

### Dispatcharr

Probar si un "Output Profile" asignado a un usuario Xtream específico puede entregar HLS para Roku.

## Opciones para iOS

| Dimensión | AVPlayer | **MPVKit (libmpv)** | VLCKit |
|---|---|---|---|
| TS directo | No | Sí | Sí |
| Formatos/códecs | Limitado | Muy amplio (FFmpeg) | Muy amplio |
| Integración con React Native | Módulos maduros | expo-mpv; precedente en Streamyfin | Módulos existentes, calidad irregular |
| PiP / AirPlay | Nativo | Requiere salida AVFoundation (fork) — por verificar | Por verificar |
| Licencia | Sistema | LGPL (o GPL) | LGPL |
| Mantenimiento | Apple | El README de mpvkit avisa que se mantiene con poca frecuencia | VideoLAN |

## Consecuencias

- `PlayerAdapter.getCapabilities()` debe declarar contenedores, protocolos y códecs por separado.
- Fixture de vídeo: un `.ts` y un HLS sintéticos generados con ffmpeg (`testsrc` + tono), sin contenido de terceros.
- Si MPVKit falla en la Fase 0 (estabilidad, consumo de batería o integración), se cambia a VLCKit y se actualiza este ADR.

## Acciones

1. [ ] POC iPad: reproducir `.ts` y `.m3u8` del Dispatcharr con MPVKit.
2. [ ] Medir tiempo de inicio, cambio de canal, CPU y temperatura en el iPad.
3. [ ] Probar pistas de audio/subtítulos y PiP.
