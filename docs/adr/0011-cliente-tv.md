# ADR-0011: T-Max TV, app aparte para TV con React Native TV

**Estado:** Aceptada (paso 1 en curso) · **Fecha:** 2026-11-27 · **Decide:** Arturo

## Contexto
La app del celular (Expo + React Native) se instala en Android TV, pero sus pantallas están hechas
para el dedo. Arturo quiere una experiencia de TV muy fluida con el control, con atajos propios
de las apps de IPTV para TV (OK = lista, izquierda = grupos, números, atrás…). Se mantiene la regla 1:
se imitan **comportamientos** de uso, nunca diseño, textos, recursos ni código de apps cerradas.

## Decisión
App aparte `clients/tv` ("T-Max TV", paquete `com.muguiwara23.tmax.tv`) con `react-native-tvos`
en la versión que corresponde al Expo del proyecto (SDK 57 → `0.86.3-0`) y `@react-native-tvos/config-tv`.
- **Comparte** sin copiar la capa de datos, el reproductor (`ui/Video`) y la tipografía de
  `clients/ios/src` (alias `@shared/…` en Metro; Metro nunca toma paquetes de `clients/ios/node_modules`).
- **Pantallas propias** para control remoto en `clients/tv/src`.
- Se compila con su flujo manual **App Android TV (T-Max TV)**; se sumará a "Publicar versión".

## Opciones consideradas
- **A. Modo TV dentro de la misma app:** menos trabajo, pero el foco del control es menos fino y no sirve para Apple TV.
- **B. App aparte con React Native TV (elegida):** mejor manejo del foco y animaciones; la misma base servirá para Apple TV.

## Consecuencias
- Un `.apk` más por versión; puede convivir con la app del celular en el mismo aparato.
- Apple TV queda pendiente: `expo-mpv` declara solo iOS en su podspec; habrá que adaptarlo.
- Cambios en `clients/ios/src/data` afectan a ambas apps (es la intención); el flujo de TV corre los tipos de los dos.

## Pasos
1. Base (proyecto, datos compartidos, inicio mínimo, reproductor básico, flujo de compilación).
2. Reproductor con los atajos del control.
3. Pantallas de TV completas (guía, películas/series, ajustes, configurar desde el celular).
4. Actualizaciones (Release + aviso).
5. Apple TV.
