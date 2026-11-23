# Reglas del proyecto T-Max

Lee esto antes de tocar el repositorio.

## Contexto

- Dueño: Arturo. No programa; Claude escribe el código. Explica cada paso en español, pide confirmación antes de cambios grandes y presenta el plan completo antes de ejecutar.
- Uso personal/familiar con instalación manual. No hay publicación en tiendas.
- **El repositorio es PÚBLICO.** Todo lo que entra aquí lo puede ver cualquiera.

## Prohibido

1. Código, recursos, textos, layouts, iconos o assets de apps **cerradas o decompiladas** (p. ej. TiviMate), y logos, nombres o marca de cualquier otra app (Nuvio, AerioTV, IPTVnator…).
   - **Sí se permite** reutilizar código de proyectos de **código abierto** con licencia compatible con GPL-3.0 (MIT, BSD, Apache-2.0, LGPL, GPL-3.0; AGPL-3.0 solo en archivos marcados como tales). Condiciones: conservar su aviso de copyright, registrarlo en `AVISOS-DE-TERCEROS.md`, citar el origen en un comentario del archivo y en el mensaje del commit.
   - Antes de reutilizar, verificar la licencia en el repositorio original (no fiarse de lo que diga un tercero).
2. Credenciales, URLs con usuario/contraseña, MACs reales de portales, tokens o dominios reales de proveedores — en código, fixtures, logs, issues o commits. Usar dominios `*.test` / `*.invalid` y datos inventados.
3. Backend propio, proxy, analítica, crash reporting remoto, Firebase/Supabase o similares.
4. Eludir DRM o controles de acceso.
5. Actualizar SDKs o dependencias mayores sin correr la matriz de pruebas.
6. Marcar una función o plataforma como "compatible" sin prueba en dispositivo real.

## Estructura

- `docs/` — arquitectura, ADRs, compatibilidad, seguridad, backlog.
- `contracts/` — JSON Schema, fixtures sintéticos y casos dorados que todos los clientes deben pasar.
- `packages/core` — dominio en TypeScript puro (sin dependencias): parsers M3U/XMLTV, clientes Xtream/Stalker, emparejado EPG, redacción. La red se inyecta (`HttpClient`); el núcleo nunca llama a `fetch` ni a servidores.
- `poc/` — pruebas de viabilidad desechables (Fase 0). No son la app final.
- `clients/ios` — app React Native (Expo) para iPhone/iPad; consume `@tmax/core` vía `file:` y Metro (`metro.config.js`).
- `clients/` — (futuro) `tv-web` (Tizen + webOS), `roku` (BrightScript).

No crear carpetas vacías para fases futuras.

## Compilación

- Todo se compila en GitHub Actions (repo público → runners estándar gratuitos).
- iOS se entrega como `.ipa` **sin firmar**; Arturo lo firma con Flarestore.

## Commits

- Mensajes en español, cortos y descriptivos.
- Revisar `git diff --cached` en busca de secretos antes de cada commit.
