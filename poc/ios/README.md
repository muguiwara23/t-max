# POC 1 — iPhone / iPad con libmpv

App mínima y desechable para responder una pregunta: **¿React Native + libmpv (MPVKit, vía `expo-mpv`) reproduce bien canales IPTV reales en iPad, incluido `.ts` directo?**

## Qué hace

- Login Xtream (servidor, usuario, contraseña) guardado en el Keychain del dispositivo.
- Lista de canales con búsqueda y categorías.
- Formato de canal en vivo: Automático (TS si el servidor lo permite), TS o M3U8.
- URL directa para pegar cualquier stream.
- Dos streams HLS públicos de ejemplo de Apple (con varias pistas de audio y subtítulos).
- Reproductor con estado, tiempo hasta el primer cuadro, códec, resolución, decodificación HW/SW, pistas de audio y subtítulos, anterior/siguiente para medir el cambio de canal.
- **Copiar diagnóstico:** copia un informe JSON **sin credenciales** al portapapeles para compartir resultados.
- Botón para borrar todos los datos locales.

## Cómo obtener el `.ipa`

1. GitHub → **Actions** → "POC iOS (libmpv)" → la ejecución más reciente en verde.
2. Descargar el artefacto **T-Max-POC-ipa-sin-firmar** (es un `.zip` que contiene el `.ipa`).
3. Firmarlo e instalarlo con Flarestore.

También se puede lanzar a mano con **Run workflow**.

## Lista de pruebas

| # | Prueba | Resultado |
|---|---|---|
| 1 | Abre la app tras firmar | |
| 2 | Stream de Apple "Advanced": reproduce, lista audio y subtítulos, permite cambiarlos | |
| 3 | Xtream de Dispatcharr: login y lista de canales | |
| 4 | Canal en `.ts`: reproduce; tiempo de arranque | |
| 5 | Mismo canal en `.m3u8`: reproduce; tiempo de arranque | |
| 6 | Cambiar de canal 20 veces con Siguiente: sin bloqueos; tiempos | |
| 7 | Canal HEVC / 1080p / 50-60 fps (si hay): fluido, HW | |
| 8 | Mandar la app a segundo plano 1 minuto y volver | |
| 9 | Girar el iPad durante la reproducción | |
| 10 | 15 minutos seguidos: temperatura, batería, rebuffering | |

Después de cada prueba, **Copiar diagnóstico** y pegarlo en el chat.

## Desarrollo

```bash
npm ci
npm run typecheck
npm test        # cliente Xtream y redacción contra contracts/fixtures
```

El proyecto nativo (`ios/`) se genera en CI con `expo prebuild`; no se versiona.
