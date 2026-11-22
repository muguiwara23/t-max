# ADR-0006: Tipos de fuente — Xtream, M3U y Stalker

**Estado:** Aceptado (Stalker condicionado por plataforma)
**Fecha:** 2026-11-22

## Contexto

Arturo usa Xtream (Dispatcharr) como fuente principal, pero la app debe funcionar con cualquier proveedor. Se piden tres tipos de fuente.

## Decisión

Cada fuente se implementa como un `SourceProvider` en `core`, con la misma interfaz: `authenticate`, `listCategories`, `listChannels`, `listVod`, `listSeries`, `getEpg`, `resolvePlaybackUrl`.

| Tipo | Autenticación | Riesgo principal |
|---|---|---|
| **Xtream** | Usuario/contraseña en query (`player_api.php`) | Variantes entre servidores; credenciales en URL (redactarlas en logs) |
| **M3U/M3U8** | Ninguna o en la URL | Listas enormes; atributos no estándar; VOD sin estructura |
| **Stalker/Ministra** | MAC + handshake → token Bearer; cabeceras de decodificador | Cabeceras restringidas en web apps de TV |

### Stalker en detalle

Un portal Stalker espera:

- User-Agent de decodificador MAG.
- Cookie con `mac`, idioma y zona horaria.
- `Authorization: Bearer <token>` tras el handshake.
- Una llamada `create_link` por canal para obtener la URL real, que suele caducar.

En iOS (red nativa) y Roku (`roUrlTransfer.AddHeader`) se pueden enviar todas estas cabeceras. En las web apps de Tizen y webOS, el motor web puede bloquear `Cookie` y `User-Agent` en peticiones de JavaScript. Se verifica en la Fase 0. Salidas posibles:

- webOS: un servicio JS en segundo plano dentro de la app (corre fuera del navegador).
- Tizen: revisar privilegios de la web app; si no hay salida, Stalker queda "no disponible" en Tizen.
- Probar si el portal acepta la MAC por query/User-Agent sin cookie.

## Consecuencias

- La MAC es un secreto: se guarda en almacenamiento seguro y nunca aparece en logs.
- El estado de Stalker se publica por plataforma en `platform-compatibility.md`.
