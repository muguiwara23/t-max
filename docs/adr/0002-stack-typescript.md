# ADR-0002: TypeScript como lenguaje principal

**Estado:** Aceptado (sujeto a la prueba de viabilidad en iPad)
**Fecha:** 2026-11-22
**Decide:** Arturo

## Contexto

Arturo no programa; Claude escribe y mantiene todo el código. Cuantos menos lenguajes e implementaciones duplicadas, menos errores y menos divergencia entre plataformas. Roku obliga a usar BrightScript, sin alternativa.

## Decisión

- **Dominio compartido en TypeScript** (`packages/core`): modelos, parser M3U, parser XMLTV en streaming, clientes Xtream y Stalker, emparejado de EPG, búsqueda y orden.
- **iPhone/iPad:** React Native con Expo (prebuild, sin servicios EAS) y un módulo nativo de reproducción (ver ADR-0003).
- **Tizen y webOS:** una sola web app TypeScript, con adaptadores por plataforma para el reproductor, el almacenamiento y el mando.
- **Roku:** BrightScript + SceneGraph. El dominio se reimplementa aquí y se valida contra los mismos fixtures dorados.

## Opciones consideradas

### Opción A: Flutter (especificación original)

| Dimensión | Evaluación |
|---|---|
| Implementaciones del dominio | 3 (Dart, TypeScript, BrightScript) |
| iOS + TS en `.ts` directo | Requiere plugin nativo igualmente |
| TVs | Flutter-Tizen y Flutter-webOS solo en modelos recientes |
| Futuro Apple TV | Sin soporte oficial de Flutter |

### Opción B: TypeScript + React Native (elegida)

| Dimensión | Evaluación |
|---|---|
| Implementaciones del dominio | 2 (TypeScript, BrightScript) |
| iOS | Módulo nativo con libmpv; existe precedente (expo-mpv, Streamyfin) |
| TVs | Web app nativa de la plataforma, sin capas extra |
| Futuro | React Native tvOS para Apple TV; Android posible con el mismo código |

## Trade-offs

- En B no se comparte la interfaz entre iOS y las TVs, solo la lógica. Es aceptable: una interfaz táctil y una de mando de 3 metros son distintas de todos modos.
- React Native añade un puente JS↔nativo para el reproductor. El riesgo se mide en la Fase 0.

## Consecuencias

- `packages/core` debe ser TypeScript puro sin APIs de Node ni del navegador (red, almacenamiento y reloj se inyectan) para que corra en Hermes (React Native), en las web apps de las TVs y en las pruebas.
- Los fixtures de `contracts/` son la referencia común entre TypeScript y BrightScript.

## Acciones

1. [ ] Monorepo con npm workspaces cuando empiece el primer código.
2. [ ] Prueba de viabilidad en iPad (ver ADR-0003) antes de fijar React Native.
