# T-Max para Roku

BrightScript + SceneGraph (ver `docs/adr/0010-cliente-roku.md`). Todo corre en el Roku: habla directo con tus fuentes.

## v0.1

- Fuentes Xtream, M3U y Stalker (se escriben con el teclado del Roku o de la app Roku del celular).
- TV en vivo: Grupos → canales → Atrás, Favoritos (botón `*`), cambio de fuente con `*` en la lista de grupos.
- Video a pantalla completa: Arriba/Abajo = canal anterior/siguiente; reconexión automática si se corta.
- Xtream en `.ts` (`streamFormat: "ts"`) por omisión; M3U8 elegible por fuente en Ajustes.
- Stalker con identidad MAG250 (prehash, perfil completo, cmd sin doble codificación) y señal de vida.
- Pendiente: Guía, Películas/Series, configurar desde el celular. Sin probar en un Roku real.

## Instalar

Igual que el POC (`poc/roku/README.md`): modo desarrollador → `http://IP-DEL-ROKU` → Upload → Install.
Compilar: `scripts/build-roku.sh` o el flujo manual **App Roku (T-Max)** en Actions.
Probar lógica sin Roku: simulador `brs-engine` (`npx brs-node`), sin video real.
