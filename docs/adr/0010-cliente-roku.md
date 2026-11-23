# ADR-0010: Cliente Roku

**Estado:** Propuesto — se confirma con el POC en el Roku Express HD de Arturo
**Fecha:** 2026-11-23

## Contexto

- Roku no admite código nativo: el único reproductor posible es el nodo `Video` del sistema (el mismo que usa cualquier app de Roku; ahí está el HDR10 que se vio en otras apps).
- El equipo de Arturo es un **Roku Express HD** (1080p, procesador básico, poca memoria).
- La documentación de Roku solo menciona TS dentro de HLS. Pero el port de AerioTV para Roku (GPL-3.0-or-later) comprobó en un Streaming Stick 4K que **MPEG-TS en vivo sí se reproduce** con `streamFormat: "ts"` (H.264 + AAC ADTS); el valor `"mpegts"` no es válido y el Roku lo ignora (`docs/LIVE-READER-FIX-0.3.22.md` de ese proyecto).
- El port de Nuvio para Roku (GPL-3.0) resolvió dos cosas útiles: un mini servidor **dentro del propio Roku** (`roStreamSocket`, puerto local) para configurar desde el celular, y películas `.ts` con adelantar armando una lista HLS por rangos de bytes.

## Decisión

1. Cliente en **BrightScript + SceneGraph**, carpeta `clients/roku`. El núcleo TypeScript no corre en Roku: los clientes Xtream/M3U/Stalker se reescriben en BrightScript siguiendo los mismos contratos (`contracts/`).
2. **Formato en vivo por fuente:** `ts` (`streamFormat: "ts"`) por omisión, `m3u8` (HLS) como alternativa, elegible por fuente. Se decide el valor por omisión con el POC.
3. **Memoria:** canales por categoría y guía por canal (Xtream `get_short_epg`, Stalker `get_short_epg`), nunca el XMLTV completo. Caché en `cachefs:`/`tmp:`; el registro (límite 32 KB) solo para fuentes y preferencias pequeñas.
4. **Configurar desde el celular:** página local servida por el Roku en la red de casa (sin servidores externos: cumple la regla 3). También se podrá importar el respaldo del iPad.
5. Mismas secciones y diseño (ADR-0007/0008): TV en vivo con Favoritos/Recientes, Guía por canal, Películas, Series, Ajustes. Sin DVR (Roku no puede grabar). Mis programas solo con la app abierta.
6. **Reutilización (ADR-0005):** se pueden tomar piezas de AerioTV-Roku (GPL-3.0-or-later) y NuvioTVSmart-Roku (GPL-3.0) con su aviso en `AVISOS-DE-TERCEROS.md`; nada de sus logos ni nombres.

## Opciones consideradas

| Opción | Por qué no |
|---|---|
| Solo HLS (`.m3u8`) | Dispatcharr y muchos proveedores entregan TS por Xtream; obligaría a cambiar el servidor |
| Proxy TS→HLS fuera del Roku | Prohibido (regla 3: sin servidores) |
| Lista XMLTV completa | Demasiada memoria para un Express HD |

## Consecuencias

- Doble implementación de los clientes de fuentes (TS y BrightScript); los fixtures de `contracts/` son la prueba común.
- Instalación manual por modo desarrollador (un canal a la vez por Roku).

## Acciones

1. [ ] Resultados del POC (`poc/roku`) en el Express HD: `.ts` sin formato / `ts` / `.m3u8`, tiempos y memoria.
2. [ ] Fijar el formato por omisión y abrir `clients/roku`.
3. [ ] Página local de configuración desde el celular.
