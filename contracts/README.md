# Contratos de datos

La referencia común de todos los clientes (TypeScript y BrightScript). Si una implementación no reproduce estos resultados, está mal la implementación, no el fixture. Si el fixture está mal, se corrige aquí primero.

## `json-schema/`

JSON Schema (draft 2020-12) de los modelos: `PlaylistSource`, `Channel`, `ChannelGroup`, `EpgSource`, `Programme`, `VodItem`, `PlaybackBookmark`, `CapabilityReport`, `AppError` y `M3uEntry` (salida cruda del parser).

Regla clave: **los secretos nunca viven en el modelo.** Contraseñas, MACs y URLs con credenciales se guardan en `SecureStore` y el modelo solo lleva una referencia `secret:<id>`.

Pendientes: `AppSettings` y `BackupManifest`.

## `fixtures/`

Datos inventados. Todos los dominios son `*.test` y las credenciales son falsas (`demo_user` / `demo_pass`, MAC `00:1A:79:00:00:00`).

| Fixture | Qué prueba |
|---|---|
| `m3u/basic.m3u` | BOM UTF-8, CRLF, comas y comillas dentro de nombres y atributos, comillas simples, valores sin comillas, `#EXTVLCOPT`, catch-up, entrada sin URL, duración positiva, espacios sobrantes |
| `m3u/malformed.m3u` | Sin cabecera, comilla sin cerrar, URL sin `#EXTINF`, duración inválida, `#EXTINF` sin coma, esquema no soportado |
| `xmltv/basic.xml` | Zonas `-0600`, `+0000`, `+0530` y sin zona; programa sin `stop`; solape; canal sin nombre; canal no declarado; entidades XML; descripción larga |
| `xtream/*` | Login (con `allowed_output_formats`), login rechazado, categorías, canales (con `stream_id` numérico **y** de texto), VOD, series y episodios |
| `stalker/*` | Handshake, perfil, géneros, canales, `create_link` y las cabeceras esperadas (sin y con redacción) |
| `models/*` | Ejemplos válidos de cada esquema |

Los `.expected.json` contienen el resultado exacto esperado. Fueron verificados con un parser de referencia independiente.

### Reglas del parser M3U (resumen)

1. BOM opcional; CRLF y LF equivalentes.
2. Atributos `clave="valor"`, `clave='valor'` o `clave=valor` (termina en espacio o coma). Las claves se pasan a minúsculas.
3. El nombre es todo lo que sigue a la primera coma fuera de comillas, sin espacios al inicio ni al final.
4. Comilla sin cerrar → aviso `UNTERMINATED_QUOTE`; se conservan los atributos anteriores y el nombre es lo que sigue a la última coma.
5. Las etiquetas `#…` entre `#EXTINF` y la URL se adjuntan a la entrada (`extraTags`).
6. Una URL sin `#EXTINF` se acepta como entrada con nombre igual a la URL (`BARE_URL`).
7. Esquemas aceptados: `http`, `https`, `rtmp`, `rtsp`, `udp`, `rtp`. Otros se ignoran (`UNSUPPORTED_SCHEME`).

### Reglas XMLTV (resumen)

Ver el campo `rules` en `xmltv/basic.expected.json`.

## Validación

```bash
# (cuando exista packages/core) npm test  — corre los fixtures dorados
```
