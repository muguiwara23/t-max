# @tmax/core

Lógica compartida de T-Max en TypeScript puro. La usan la app de iPhone/iPad y la web app de Samsung/LG. Roku la reimplementa en BrightScript y la valida contra los mismos `contracts/fixtures`.

**Todo corre en el dispositivo.** El núcleo no hace peticiones por su cuenta: cada plataforma le pasa un `HttpClient`, y las peticiones van directo a las fuentes del usuario. No hay servidores, cuentas ni telemetría. Una prueba (`test/no-network.test.ts`) lo verifica en cada cambio.

| Módulo | Qué hace |
|---|---|
| `m3u.ts` | Parser M3U/M3U8 por trozos (listas enormes sin cargarlas completas) |
| `xmltv.ts` | Parser XMLTV por trozos, con ventana de tiempo, zonas horarias e inferencia de fin |
| `xtream.ts` | Cliente Xtream: cuenta, en vivo, películas, series, fichas, URLs, catch-up y elección TS/M3U8 |
| `stalker.ts` | Cliente Stalker/Ministra: handshake, cabeceras MAG, canales y `create_link` |
| `epg-match.ts` | Emparejado de canales con la guía: por id y luego por nombre normalizado |
| `redact.ts` | Quita contraseñas, tokens y MAC de URLs, cabeceras y logs |
| `errors.ts` | Errores estables (`AppError`) según `contracts/json-schema/app-error.schema.json` |

```bash
npm ci          # en la raíz del repo
npm run typecheck
npm test        # 28 pruebas contra contracts/fixtures
```
