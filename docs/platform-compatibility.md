# Compatibilidad por plataforma

> Nada aquí está **probado** todavía. Cada fila pasa a `go`, `conditional` o `no-go` solo con una prueba reproducible en el equipo real: modelo, firmware, formato exacto del stream, pasos y resultado.

## Estado actual — Fase 0

| Plataforma | Estado | `.ts` directo | HLS | Stalker | Instalación | Equipo de prueba |
|---|---|---|---|---|---|---|
| iPhone / iPad | **go** — POC superado en iPad (ver abajo) | Esperado sí (libmpv) | Sí | Esperado sí | `.ipa` sin firmar → Flarestore | iPad, iPhone 12 Pro (iOS 27) |
| Samsung Tizen | Pendiente POC | Por verificar (AVPlay) | Por verificar | Riesgo: cabeceras | Tizen CLI + certificado de la TV | Por definir |
| LG webOS | Pendiente POC | Por verificar / mpegts.js | Por verificar | Riesgo: cabeceras; plan B: servicio JS | Developer Mode + ares-cli | Por definir |
| Roku | Pendiente POC | Probablemente no; algunos modelos sí | Sí | Esperado sí | Modo desarrollador, un canal a la vez | Por definir |
| Apple TV | Fuera del alcance actual | — | — | — | — | — |

## Restricciones conocidas de cada modo desarrollador

- **LG webOS:** la sesión de Developer Mode dura un máximo de 1000 horas. Si no se renueva desde la app Developer Mode, las apps instaladas se borran. Hay reportes de sesiones que se desactivan antes de tiempo.
- **Roku:** solo un canal instalado a mano a la vez. El registro (`roRegistry`) tiene un límite de 32 KB comprimidos.
- **Samsung Tizen:** el certificado de autor y distribuidor va ligado al DUID de cada TV.
- **iOS:** la duración de la firma depende del certificado de Flarestore.

## Plantilla de resultado de POC

```markdown
### <Plataforma> — <fecha>
- Equipo: <modelo>, firmware <versión>
- SDK / herramientas: <versiones>
- Streams probados: <tipo, contenedor, códecs, resolución> (sin URLs reales)
- Resultado: go | conditional | no-go
- Limitaciones: …
- Métricas: inicio de reproducción, cambio de canal, memoria
- Siguiente acción: …
```

## Resultados

### iPad — 2026-11-22 (POC `a11a93d`)
- Equipo: iPad, iPadOS 27.2
- Motor: libmpv (expo-mpv 0.1.27 / MPVKit 0.41.0), Xcode 26.3
- Fuente: Xtream (Dispatcharr), canal en vivo `.ts` directo

| Prueba | Resultado |
|---|---|
| Instalación con Flarestore | OK |
| Canal en vivo `.ts` directo — H.264 960x540 25 fps, AAC 2.0 | **OK** — primer cuadro en 1554 ms, decodificación por hardware (VideoToolbox), sin rebuffering |
| Pistas de audio | Detectadas (1) |
| Mismo canal en `.m3u8` | OK (reportado por Arturo) |
| Zapping repetido | OK, fluido (reportado) |
| Pérdida de paquetes en la red | Se recupera rápido; los cortes son de la red, no del reproductor (reportado) |
| Resto de la lista (segundo plano, rotación, uso prolongado, stream Apple Advanced) | OK (reportado) |
| Segundo perfil Xtream | OK (reportado) |

**Decisión: go.** El riesgo principal (MPEG-TS por HTTP en Apple) queda resuelto con libmpv. Las métricas detalladas solo se registraron para TS; el resto lo reportó Arturo tras probarlo en su iPad.
