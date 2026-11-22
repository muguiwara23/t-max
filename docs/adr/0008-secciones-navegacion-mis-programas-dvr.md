# ADR-0008: Secciones, navegación, Mis programas y DVR

**Estado:** Aceptado (DVR por plataforma)
**Fecha:** 2026-11-22
**Decide:** Arturo

## Contexto

Arturo revisó la primera maqueta y definió la estructura de la app. Es igual en todas las plataformas.

## Decisión

### Secciones

1. **TV en vivo.** Incluye Favoritos y Recientes como listas al inicio de los grupos, y un botón **Guía** para ver la cuadrícula EPG.
2. **Películas**
3. **Series**
4. **Mis programas:** programas guardados desde la guía. Avisa cuando empiezan y lleva al canal.
5. **DVR:** grabaciones.
6. **Ajustes**

La búsqueda está en la barra superior de cada sección.

### Navegación de listas

- Se ve **una sola lista a la vez**: primero los grupos; al entrar a uno, sus canales ocupan esa columna.
- **Atrás** regresa a los grupos.
- Esto es igual con dedo, teclado o mando.

### Mis programas (recordatorios)

| Plataforma | Comportamiento |
|---|---|
| iPhone/iPad | Notificación local del sistema; al tocarla abre el canal. Funciona con la app cerrada. |
| Tizen, webOS, Roku | Solo con la app abierta: aviso en pantalla con "Ver ahora", o cambio automático si el usuario lo activó. Estas plataformas no permiten tareas en segundo plano a una app instalada en modo desarrollador. |

Los recordatorios se guardan en el dispositivo.

### DVR: grabación en el propio dispositivo

Decisión de Arturo: **la grabación se guarda en el dispositivo**, no en el servidor. El stream `.ts` se escribe tal cual a un archivo, sin convertirlo, mientras llega por la red.

| Plataforma | Viabilidad | Condiciones |
|---|---|---|
| iPhone/iPad | **Sí** | Con la app abierta (también mientras ves otro canal). iOS suspende las apps en segundo plano, así que una grabación programada solo se hace si la app está abierta a esa hora. Los archivos quedan en la app y son visibles en la app Archivos. |
| Samsung Tizen | Por verificar | Depende de que la web app pueda escribir en almacenamiento USB o interno. Se prueba en la Fase 0. |
| LG webOS | Por verificar | Posible con un servicio JS de la app escribiendo en USB. Se prueba en la Fase 0. |
| Roku | **No** | Roku no ofrece almacenamiento persistente para video. La sección DVR se oculta. |

Reglas comunes:

- Grabar mientras ves otro canal usa **dos conexiones** del proveedor. La app revisa `max_connections` y avisa antes de grabar si no alcanza.
- Margen configurable antes y después del programa (de la EPG).
- Aviso de espacio libre antes de empezar.

## Consecuencias

- La grabación local se prueba primero en iPad (rápido de validar con libmpv/descarga directa del `.ts`).
- El modelo `Reminder` (recordatorio) se agrega a `contracts/` cuando se implemente Mis programas.
