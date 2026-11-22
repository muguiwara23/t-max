# Seguridad y privacidad

## Principios

- Sin cuenta, sin backend, sin telemetría, sin publicidad.
- La app solo hace peticiones de red a las fuentes que el usuario añadió.
- Los datos viven en el dispositivo y se pueden borrar todos desde Ajustes.

## Secretos

Se consideran secretos: contraseñas Xtream, MACs y tokens de Stalker, URLs con credenciales embebidas y cabeceras de autenticación.

| Plataforma | Almacenamiento seguro |
|---|---|
| iOS | Keychain |
| Tizen / webOS | Por definir en la Fase 0; si solo existe IndexedDB, cifrar con WebCrypto y documentar que la protección es menor |
| Roku | `roRegistry` (cifrado y aislado por desarrollador) |

## Redacción obligatoria

Ningún log, error, diagnóstico exportado o captura debe contener secretos. `core` expone una función `redact()` que:

- Reemplaza `username` y `password` en URLs Xtream (`/live/<user>/<pass>/…` y en query) por `***`.
- Oculta cabeceras `Authorization` y `Cookie`.
- Muestra la MAC enmascarada (`00:1A:79:**:**:**`).

Hay pruebas unitarias que verifican que ningún fixture con credenciales falsas aparezca sin redactar en los logs.

## Repositorio público

Ver ADR-0005. Antes de cada commit se revisa que no haya credenciales, dominios reales de proveedores ni datos personales.

## Copias de seguridad

- Archivo local versionado y cifrado (AES-256-GCM con una clave derivada de la contraseña del usuario, usando una librería auditada).
- Por defecto, el respaldo excluye los secretos; el usuario puede incluirlos de forma explícita.
- Nunca se envían a ningún servidor.

## Control parental

- PIN local, guardado como hash con sal.
- Bloquea canales o grupos.
