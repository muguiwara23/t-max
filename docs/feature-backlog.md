# Inventario de funciones

Funciones que se esperan de un reproductor IPTV completo, descritas en palabras propias. Prioridad: **MVP**, **v1** (después del MVP) o **Futuro**.

## Fuentes y listas

| Función | Prioridad |
|---|---|
| Añadir fuente Xtream (servidor, usuario, contraseña) | MVP |
| Añadir lista M3U por URL | MVP |
| Añadir portal Stalker (URL del portal + MAC) | MVP en iOS y Roku; resto según POC |
| Lista M3U desde archivo local | v1 |
| Varias fuentes a la vez, con nombre, activar/desactivar y orden | MVP |
| Actualizar fuente manualmente y al abrir la app | MVP |
| Editar la URL de una fuente sin perder favoritos | v1 |
| Fuente solo de VOD (sin canales en vivo) | v1 |
| Limpiar prefijos y sufijos de nombres de canal (ej. "MX:", "HD") | v1 |
| Mensajes de error claros (formato, red, autenticación) | MVP |

## Guía EPG

| Función | Prioridad |
|---|---|
| Fuentes XMLTV (`.xml` y `.xml.gz`) asignadas a cada lista | MVP |
| EPG nativa de Xtream/Stalker cuando no hay XMLTV | MVP |
| Varias fuentes EPG con prioridad | v1 |
| Emparejado por `tvg-id`, luego por nombre normalizado, y asignación manual | MVP (manual en v1) |
| Desplazamiento horario por fuente | MVP |
| Días pasados y futuros a conservar | MVP |
| Actualización automática por intervalo | v1 |
| Elegir logos de la lista o de la EPG | v1 |
| Vista de guía en cuadrícula | MVP |
| Guía superpuesta sobre el reproductor | v1 |

## TV en vivo y navegación

| Función | Prioridad |
|---|---|
| Lista de canales por grupo, con número, logo y programa actual | MVP |
| Categorías especiales: Todos, Favoritos, Recientes | MVP |
| Búsqueda por nombre y número | MVP |
| Cambio de canal arriba/abajo y por número con el mando | MVP |
| Volver al canal anterior | MVP |
| Panel de información al cambiar de canal (actual / siguiente) | MVP |
| Lista de canales superpuesta sin salir del reproductor | MVP |
| Encender el último canal al abrir la app (opcional) | v1 |
| Número de recientes y retardo antes de contar un canal como reciente | v1 |

## Organización

| Función | Prioridad |
|---|---|
| Favoritos: añadir, quitar y reordenar | MVP |
| Ocultar canales o grupos sin borrarlos; vista para recuperarlos | MVP |
| Orden global (por lista, nombre o número) y orden manual por grupo | v1 |
| Crear grupos propios, copiar y mover canales | v1 |
| Renombrar canales y grupos, con opción de restaurar el original | v1 |
| Mostrar los grupos nuevos de la fuente como visibles u ocultos | v1 |

## Reproductor

| Función | Prioridad |
|---|---|
| Play, pausa y estados (cargando, buffering, error) | MVP |
| Pistas de audio; preferir audio surround | MVP / v1 |
| Subtítulos y closed captions | MVP |
| Retardo de audio por canal o global | v1 |
| Tamaño de buffer configurable | v1 |
| Decodificador por software como alternativa | v1 (según motor) |
| Passthrough de audio | Futuro (según plataforma) |
| Pantalla negra o última imagen al cambiar de canal | v1 |
| Ajuste automático de frecuencia (AFR) | Futuro (según plataforma) |
| Abrir en un reproductor externo | Futuro (iOS: VLC/Infuse) |
| Picture-in-Picture | v1 iOS (por verificar con libmpv) |

## Catch-up / timeshift

| Función | Prioridad |
|---|---|
| Ver programas pasados cuando la fuente lo anuncia | v1 |
| Icono de catch-up en canales compatibles | v1 |
| Retroceder en el directo con catch-up | v1 |
| Volver al directo | v1 |

## VOD

| Función | Prioridad |
|---|---|
| Películas y series por categorías (Xtream/Stalker) | v1 |
| Ficha: póster, sinopsis, año, duración | v1 |
| Temporadas y episodios | v1 |
| Continuar viendo e historial | v1 |

## Mis programas

| Función | Prioridad |
|---|---|
| Guardar un programa desde la guía o desde "A continuación" | v1 |
| Aviso cuando empieza y salto al canal (iOS: notificación del sistema; TV: con la app abierta) | v1 |
| Lista de programas guardados, editar y borrar | v1 |

## DVR (grabación en el servidor de Dispatcharr; ver ADR-0008)

| Función | Prioridad |
|---|---|
| Grabar el programa actual, por duración o hasta que termine | Futuro |
| Programar grabaciones desde la guía, con margen antes y después | Futuro |
| Carpeta de grabaciones, lista y borrado | Futuro |
| Aviso de que grabar consume una conexión extra del servidor | Futuro |

## Multiview (fuera del MVP, sin bloquear la arquitectura)

| Función | Prioridad |
|---|---|
| Ver 2 a 4 canales a la vez y elegir cuál suena | Futuro (iPad primero) |

## Control parental

| Función | Prioridad |
|---|---|
| PIN local; bloquear canales y grupos | v1 |

## Respaldo

| Función | Prioridad |
|---|---|
| Exportar e importar configuración a un archivo local | v1 |
| Restaurar valores predeterminados | v1 |
| Borrar todos los datos y credenciales | MVP |

## Interfaz

| Función | Prioridad |
|---|---|
| Diseño propio (dirección visual: Arturo) | MVP |
| Tema oscuro, alto contraste y foco siempre visible en TV | MVP |
| Español e inglés | MVP |
| Opciones de densidad: nombres en dos líneas, mostrar números, resaltar el canal actual | v1 |
| Transparencia y tiempo de ocultado de los paneles | v1 |
