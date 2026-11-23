# ADR-0001: Alcance y plataformas objetivo

**Estado:** Aceptado
**Fecha:** 2026-11-22
**Decide:** Arturo

## Contexto

La especificación inicial pedía nueve plataformas, con Android y Android TV como MVP. El uso real es personal y familiar: la app se instala a mano y no se publica en tiendas. En Android ya existe un reproductor comercial que cubre la necesidad; el problema es que no existe nada equivalente en los demás sistemas y ese producto no se actualiza.

## Decisión

1. **Distribución:** instalación manual (sideload, modo desarrollador). No hay tiendas, certificación, cuentas de tienda ni monetización.
2. **Orden de plataformas:**
   1. iPhone / iPad
   2. Samsung Tizen y LG webOS (un solo cliente web compartido)
   3. Roku
   4. Más adelante: Apple TV
3. **Fuera del alcance actual:** Android, Android TV, Fire TV y el navegador de escritorio.
4. **Fuentes:** Xtream Codes, M3U/M3U8 y Stalker/Ministra. Fuente principal de pruebas: el Dispatcharr de Arturo (Xtream). Debe funcionar con cualquier proveedor.
5. **Grabación y multiview:** no entran al MVP, pero la arquitectura no debe impedirlos (el `PlayerAdapter` y el modelo de capacidades los contemplan desde el inicio).

## Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| A. Especificación original (Android primero, 9 plataformas) | Mercado amplio | Duplica una app que ya funciona; esfuerzo enorme |
| **B. Plataformas sin buen reproductor primero** | Resuelve el problema real; menos superficie | Las plataformas más difíciles (Roku, Apple) van temprano |

## Consecuencias

- Sin tiendas, las secciones de políticas de tienda de la especificación quedan en pausa.
- Las restricciones de cada modo desarrollador pasan a ser requisitos (ver `platform-compatibility.md`): LG borra las apps si no se renueva la sesión; Roku solo admite un canal instalado a mano.
- Hace falta hardware real de cada plataforma para emitir un `go`.

## Pendiente de revisar

- Añadir Android/Android TV si el cliente React Native lo hace casi gratis.
- Apple TV cuando el cliente iOS sea estable.

## Actualización 2026-11-23

Arturo amplió el alcance. Orden acordado:
1. iPhone (misma app que el iPad, diseño de una columna con pestañas abajo).
2. Android teléfonos y tablets (misma app React Native; `.apk` compilado en GitHub Actions con Linux).
3. Roku (cuando Arturo tenga acceso al equipo para probar).
4. Android TV y Apple TV juntos (versión TV de React Native, navegación con control remoto).
Samsung Tizen y LG webOS siguen en el plan después de estas.
