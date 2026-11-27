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

## Roku: página para configurar desde el celular (v0.2)

- El Roku abre un servidor HTTP propio en el puerto 8888, **solo mientras T-Max está abierto** y solo alcanzable desde la red local (no hay proxy ni servidor externo).
- Sirve una única página para **agregar** fuentes; nunca muestra contraseñas ni URLs guardadas (solo tipo y nombre).
- Guardar exige el PIN de 4 dígitos que se ve en la TV (Ajustes) y cambia en cada arranque; tras 5 PIN incorrectos se bloquea 1 minuto.
- HTTP sin cifrar dentro de la red local: quien comparta la Wi-Fi podría ver los datos en tránsito. Es la misma exposición que ya tienen las fuentes Xtream/M3U en `http://`.

## Actualizaciones (0.7 / Roku 0.3)

- **Sin servidor propio.** El flujo manual "Publicar versión" crea un Release en este repositorio público con los archivos y un `versions.json`.
- **Revisión:** cada app descarga ese `versions.json` como máximo una vez al día (y con "Buscar ahora"). No se envía ningún dato del usuario; GitHub ve la IP como en cualquier descarga. Solo se aceptan enlaces que apunten a `github.com/muguiwara23/t-max/`.
- **Android:** baja el `.apk` y abre el instalador del sistema; la persona confirma "Instalar". Los `.apk` se firman con la llave propia de T-Max (secretos `TMAX_KEYSTORE_*` de GitHub); la llave nunca entra al repositorio. Sin esos secretos se firma con la llave de depuración de React Native (pública: no protege contra suplantación).
- **iPhone/iPad:** solo aviso y enlace; se firma con Flarestore como siempre.
- **Enviar a Roku:** desde el celular, en la misma red, se sube el `.zip` al instalador de desarrollador del Roku (`http://IP/plugin_install`, Digest con usuario `rokudev`). La IP y la contraseña de desarrollador se guardan en el almacén cifrado del aparato (SecureStore).
