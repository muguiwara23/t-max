# T-Max

Reproductor IPTV multiplataforma, local-first, para uso personal y familiar.

- **Sin cuenta, sin backend, sin nube, sin telemetría.** La app solo habla con las fuentes que el usuario configura.
- **Fuentes:** Xtream Codes, M3U/M3U8 y portales Stalker/Ministra, más guías XMLTV.
- **No incluye contenido.** No trae canales, listas ni credenciales.

## Plataformas

| Orden | Plataforma | Cliente | Estado |
|---|---|---|---|
| 1 | iPhone / iPad | React Native (TypeScript) + libmpv (MPVKit) | **v0.2** en [`clients/ios`](clients/ios) (POC superado) |
| 2 | Samsung Tizen | Web app TypeScript + AVPlay | Pendiente |
| 2 | LG webOS | Web app TypeScript + HTML5 media | Pendiente |
| 3 | Roku | BrightScript + SceneGraph | Pendiente |
| Después | Apple TV | React Native tvOS + MPVKit | Fuera del alcance actual |

Android no es objetivo por ahora.

Ninguna plataforma se marca como compatible hasta tener una prueba reproducible en el equipo real. Ver [docs/platform-compatibility.md](docs/platform-compatibility.md).

## Documentación

- [Arquitectura](docs/architecture.md)
- [Decisiones (ADR)](docs/adr/)
- [Compatibilidad por plataforma](docs/platform-compatibility.md)
- [Seguridad y privacidad](docs/security-privacy.md)
- [Inventario de funciones](docs/feature-backlog.md)
- [Plan de pruebas de viabilidad (Fase 0)](docs/poc-plan.md)
- [Contratos de datos](contracts/)

## Licencia

GPL-3.0 — ver [LICENSE](LICENSE).

## Aviso

T-Max es solo un reproductor. Cada usuario es responsable de tener derecho a usar las fuentes que añade.
