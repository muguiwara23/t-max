# T-Max para Roku

BrightScript + SceneGraph (ver `docs/adr/0010-cliente-roku.md`). Todo corre en el Roku: habla directo con tus fuentes.

## v0.2

- Mismo diseño que la app de iPhone/iPad: barra lateral con íconos, esquinas redondeadas, acento lima.
- **TV en vivo**: grupos → canales con logo, número y lo que pasa ahora. OK = vista previa en el recuadro; OK otra vez (o ▶) = pantalla completa; Atrás regresa a la vista previa sin cortar el canal.
- **Guía**: ahora / después por canal (Xtream y Stalker, pedido al servidor). M3U sin guía por ahora.
- **Pantalla completa**: Arriba/Abajo = cambiar canal, OK = info, `*` = audio y subtítulos.
- **Películas y Series** (Xtream): categorías, portadas, buscador, ficha, temporadas y episodios, "Continuar viendo", marcar como visto (`*` en un episodio), siguiente episodio automático.
- **Configurar desde el celular**: Ajustes muestra `http://IP-DEL-ROKU:8888` y un PIN; desde el navegador del celular se agregan fuentes Xtream, M3U o Stalker. Solo red local; nunca muestra contraseñas guardadas; 5 PIN incorrectos = bloqueo de 1 minuto.
- Íconos y esquinas: dibujados por `scripts/roku-images.py` (propios).
- Probado en Roku Express HD: TV en vivo de la v0.1. Lo nuevo de la v0.2 está pendiente de probar en el Roku.

## v0.1 (anterior)

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
