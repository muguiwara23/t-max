# ADR-0005: Desarrollo limpio y reglas del repositorio público

**Estado:** Aceptado
**Fecha:** 2026-11-22

## Contexto

La idea del proyecto nació de usar un reproductor IPTV comercial para Android. Se tomó una lista de sus funciones como referencia de qué debe hacer un buen reproductor. El código de ese producto es propiedad de su autor, está escrito para Android y no se ejecuta en ninguna de las plataformas objetivo.

## Decisión

1. **Se replican funciones y comportamientos, no código.** Las funciones se describen en palabras propias en `docs/feature-backlog.md` y se implementan desde cero.
2. No se copian, traducen ni portan código decompilado, recursos, textos, layouts, iconos ni nombres internos de ningún producto de terceros.
3. La identidad visual es propia (la define Arturo).
4. Para protocolos sin especificación oficial (Xtream, Stalker), se usa documentación pública del comportamiento del protocolo y se valida contra servidores propios, no contra código de terceros.
5. **Nada privado entra al repo público:**
   - Credenciales, tokens, MACs registradas, URLs reales de proveedores o del Dispatcharr de Arturo.
   - Las fuentes reales se configuran solo en el dispositivo.
   - Las pruebas contra servidores reales se ejecutan en local y sus resultados van a `test-results/local/` (ignorado por git).
6. Los fixtures usan dominios reservados (`.test`, `.invalid`, `example.com`) y datos inventados.

## Consecuencias

- La especificación original, que describe el análisis de un APK de terceros, no se sube al repo. Se mantiene en local.
- Cada PR o commit se revisa en busca de secretos antes de subir.
