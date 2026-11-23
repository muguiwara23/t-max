# ADR-0005: Desarrollo limpio y reglas del repositorio público

**Estado:** Aceptado (enmendado el 2026-11-23)
**Fecha:** 2026-11-22

## Contexto

La idea del proyecto nació de usar un reproductor IPTV comercial para Android. Se tomó una lista de sus funciones como referencia de qué debe hacer un buen reproductor. El código de ese producto es propiedad de su autor, está escrito para Android y no se ejecuta en ninguna de las plataformas objetivo.

## Decisión

1. **Se replican funciones y comportamientos, no código.** Las funciones se describen en palabras propias en `docs/feature-backlog.md` y se implementan desde cero.
2. No se copian, traducen ni portan código decompilado, recursos, textos, layouts, iconos ni nombres internos de ningún producto de terceros.
3. La identidad visual es propia (la define Arturo).
4. Para protocolos sin especificación oficial (Xtream, Stalker), se usa documentación pública del comportamiento del protocolo y se valida contra servidores propios.

### Enmienda 2026-11-23 — código abierto

Arturo decidió aprovechar soluciones ya probadas de otros proyectos abiertos. Se permite reutilizar código de proyectos de **código abierto** con licencia compatible con la de T-Max (GPL-3.0): MIT, BSD, Apache-2.0, LGPL, GPL-3.0. El código AGPL-3.0 (p. ej. AerioTV) se puede combinar según la sección 13 de la GPL-3.0, pero esos archivos conservan su licencia AGPL y se marcan como tales.

Condiciones:
- Verificar la licencia en el repositorio original antes de usar nada.
- Conservar el aviso de copyright y registrarlo en `AVISOS-DE-TERCEROS.md`.
- Citar el origen en un comentario del archivo y en el commit.
- No se toman logos, nombres ni marca de otras apps.

Lo cerrado o decompilado (TiviMate) sigue prohibido sin excepción.
5. **Nada privado entra al repo público:**
   - Credenciales, tokens, MACs registradas, URLs reales de proveedores o del Dispatcharr de Arturo.
   - Las fuentes reales se configuran solo en el dispositivo.
   - Las pruebas contra servidores reales se ejecutan en local y sus resultados van a `test-results/local/` (ignorado por git).
6. Los fixtures usan dominios reservados (`.test`, `.invalid`, `example.com`) y datos inventados.

## Consecuencias

- La especificación original, que describe el análisis de un APK de terceros, no se sube al repo. Se mantiene en local.
- Cada PR o commit se revisa en busca de secretos antes de subir.
