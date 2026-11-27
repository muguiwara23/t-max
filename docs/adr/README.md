# Registro de decisiones (ADR)

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-alcance-y-plataformas.md) | Alcance y plataformas objetivo | Aceptado |
| [0002](0002-stack-typescript.md) | TypeScript como lenguaje principal (React Native + web app TV + BrightScript) | Aceptado, sujeto al POC iPad |
| [0003](0003-motor-de-reproduccion-y-formatos.md) | Motor de reproducción y negociación de formatos (TS vs HLS) | Aceptado en iOS |
| [0004](0004-compilacion-y-distribucion.md) | GitHub Actions, repo público, IPA sin firmar → Flarestore | Aceptado |
| [0005](0005-desarrollo-limpio-y-repo-publico.md) | Desarrollo limpio y reglas del repositorio público | Aceptado (enmienda: código abierto) |
| [0006](0006-tipos-de-fuente.md) | Xtream, M3U y Stalker | Aceptado, Stalker condicionado |
| [0007](0007-sistema-visual-portable.md) | Sistema visual portable (tokens únicos, sin desenfoque, foco lima) | Aceptado |
| [0008](0008-secciones-navegacion-mis-programas-dvr.md) | Secciones, navegación de una lista, Mis programas y DVR en el dispositivo | Aceptado |
| [0009](0009-metadatos-peliculas-series.md) | Datos de Películas y Series: proveedor primero, TMDB opcional | Aceptado |
| [0010](0010-cliente-roku.md) | Cliente Roku: nodo Video, TS con `streamFormat: "ts"`, configuración desde el celular | Propuesto (POC) |
| [0011](0011-cliente-tv.md) | T-Max TV: app aparte para TV con React Native TV, comparte datos con la del celular | Aceptado (paso 1) |

Formato: Contexto → Decisión → Opciones → Consecuencias → Acciones. Las decisiones no se borran: se marcan como "Reemplazada por ADR-XXXX".
