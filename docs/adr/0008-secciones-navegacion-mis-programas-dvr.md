# ADR-0008: Secciones, navegación, Mis programas y DVR

**Estado:** Aceptado (DVR condicionado)
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

### DVR

Grabar en el propio dispositivo no es viable de forma general: iOS no permite grabar en segundo plano y las TVs no dan acceso a disco. Por eso:

- **Con Dispatcharr:** la grabación la hace el servidor. Dispatcharr tiene DVR y una API REST que cubre las grabaciones; T-Max solo programa, lista y reproduce. Funciona igual en todas las plataformas. Requiere configurar un token de API de Dispatcharr en Ajustes.
- **Con otros proveedores (Xtream/M3U/Stalker):** no hay API estándar de grabación. La sección DVR muestra solo las grabaciones del servidor de Dispatcharr si existe, o queda deshabilitada con una explicación.
- Grabación local en iPad con la app abierta: posible, pero queda para el futuro.

## Consecuencias

- La API REST de Dispatcharr se valida en una prueba propia antes de diseñar la sección DVR.
- El modelo `Reminder` (recordatorio) se agrega a `contracts/` cuando se implemente Mis programas.
