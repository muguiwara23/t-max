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

- Archivo JSON local (`tmax-backup` v1) que el usuario guarda con la hoja de Compartir de iOS (Archivos, AirDrop…). Nunca se envía a ningún servidor.
- **Decisión de Arturo (2026-11-22):** el respaldo incluye contraseñas y MAC **en texto normal** para poder pasarlo entre dispositivos sin pasos extra. La app lo advierte antes de exportar.
- Cifrado opcional con contraseña del usuario (AES-256-GCM) queda en el backlog.
- Nunca se suben respaldos reales al repositorio; los de prueba usan datos inventados.

## Control parental

- PIN local, guardado como hash con sal.
- Bloquea canales o grupos.
