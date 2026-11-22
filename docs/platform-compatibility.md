# Compatibilidad por plataforma

> Nada aquí está **probado** todavía. Cada fila pasa a `go`, `conditional` o `no-go` solo con una prueba reproducible en el equipo real: modelo, firmware, formato exacto del stream, pasos y resultado.

## Estado actual — Fase 0

| Plataforma | Estado | `.ts` directo | HLS | Stalker | Instalación | Equipo de prueba |
|---|---|---|---|---|---|---|
| iPhone / iPad | Pendiente POC | Esperado sí (libmpv) | Sí | Esperado sí | `.ipa` sin firmar → Flarestore | iPad, iPhone 12 Pro (iOS 27) |
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
