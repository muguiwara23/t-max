# ADR-0009: De dónde salen los datos de Películas y Series

**Estado:** Aceptado
**Fecha:** 2026-11-22

## Contexto

Las fichas de películas y series necesitan póster, fondo, sinopsis, año, duración, género, reparto y calificación. Arturo preguntó si esos datos vienen de TMDB o de otro lado.

## Decisión

Los datos se toman en este orden:

1. **Del proveedor (siempre primero).** Xtream entrega la ficha con `get_vod_info` (películas) y `get_series_info` (series). Normalmente trae sinopsis, reparto, director, género, fecha, duración, calificación, póster y fondo, y muchas veces el `tmdb_id`. Stalker entrega datos parecidos. Con Dispatcharr, la calidad depende de cómo tenga configurado sus metadatos.
2. **TMDB como complemento opcional**, directo desde el dispositivo, solo si el usuario pone **su propia clave de API de TMDB** en Ajustes:
   - Rellena lo que falte (sinopsis en español, fondos de mejor calidad, reparto con fotos, tráiler).
   - Si el proveedor trae `tmdb_id`, se usa directo. Si no, se busca por título y año normalizados.
   - TMDB es gratis para uso no comercial con atribución: en Ajustes → Acerca de va su logo y el aviso "This product uses the TMDB API but is not endorsed or certified by TMDB".
3. **M3U sin metadatos:** solo nombre, logo y grupo de la lista. Con clave TMDB se puede enriquecer por título.

No hay servidor intermedio: la petición va del dispositivo a TMDB, igual que a las fuentes del usuario.

## Consecuencias

- Las respuestas se guardan en caché local con caducidad (por ejemplo, 30 días) para no repetir peticiones.
- En Roku la caché va en `cachefs:` / memoria, nunca en el registro (límite de 32 KB).
- La clave de TMDB se guarda como secreto (`SecureStore`) y se redacta en los logs.
