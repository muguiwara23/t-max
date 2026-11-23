# Avisos de terceros

T-Max es software libre (GPL-3.0). Algunas partes se basan en proyectos de código abierto con licencias compatibles.
Cada entrada indica qué se tomó, de dónde y bajo qué licencia (ver `docs/adr/0005-desarrollo-limpio-y-repo-publico.md`).

## IPTVnator — MIT

- **Origen:** https://github.com/4gray/iptvnator
- **Qué se tomó (adaptado a TypeScript sin dependencias):** flujo de inicio de sesión Stalker (handshake con `prehash`,
  `get_profile` con identidad MAG250 completa y `metrics`, `do_auth` para portales con usuario), parámetros del perfil
  del decodificador, codificación del parámetro `cmd`, cabeceras/cookie (`SN`, `__cfduid`), derivación de `device_id`,
  detección de respuestas de rechazo y de conflicto de aparato, y la cadencia del watchdog según `watchdog_timeout`.
- **Dónde:** `packages/core/src/stalker.ts`.

```
MIT License

Copyright (c) 2019-2026 4gray

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Componentes de terceros incluidos al compilar

- **libmpv / MPVKit** (LGPL-2.1+ / GPL según configuración), **FFmpeg** (LGPL/GPL), **expo-mpv** (GPL-3.0): reproductor del iPad.
