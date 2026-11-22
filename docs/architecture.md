# Arquitectura

## Vista general

```text
┌────────────────────────────────────────────────────────────────┐
│ Fuentes del usuario (Xtream · M3U · Stalker · XMLTV · streams)  │
└──────────────▲─────────────────────────────────────────────────┘
               │ conexión directa desde el dispositivo (sin backend)
┌──────────────┴─────────────────────────────────────────────────┐
│ packages/core  (TypeScript puro)                                │
│  modelos · parser M3U · parser XMLTV streaming · cliente Xtream │
│  cliente Stalker · emparejado EPG · búsqueda/orden · formatos   │
│  Interfaces inyectadas: HttpClient, Storage, SecureStore, Clock │
└──────▲──────────────────────────▲──────────────────────────────┘
       │                          │
┌──────┴─────────────┐   ┌────────┴──────────────────┐   ┌──────────────────────┐
│ clients/ios        │   │ clients/tv-web            │   │ clients/roku         │
│ React Native       │   │ TS + UI de mando          │   │ BrightScript +       │
│ PlayerAdapter:     │   │ PlayerAdapter:            │   │ SceneGraph           │
│  libmpv (MPVKit)   │   │  Tizen → AVPlay           │   │ Dominio propio,      │
│ SQLite · Keychain  │   │  webOS → HTML5/mpegts.js  │   │ validado con los     │
│                    │   │ IndexedDB                 │   │ mismos fixtures      │
└────────────────────┘   └───────────────────────────┘   └──────────────────────┘
```

## Capas

1. **Contratos** (`contracts/`): JSON Schema de los modelos, fixtures sintéticos y resultados esperados. Son la fuente de verdad que comparten TypeScript y BrightScript.
2. **Dominio** (`packages/core`): reglas y parsers sin dependencias de plataforma. Todo lo que toca red, disco o tiempo entra por interfaces.
3. **Clientes**: interfaz, navegación y adaptadores de plataforma.
4. **Adaptadores**: `PlayerAdapter`, `LocalDatabase`, `SecureStore`, `FileAccess`, `RemoteInput`, `DeviceCapabilities`.

## PlayerAdapter

```ts
interface PlayerAdapter {
  getCapabilities(): PlayerCapabilities;   // contenedores, protocolos, códecs, pistas, PiP, sesiones simultáneas
  prepare(source: PlaybackRequest): Promise<void>;
  play(): void; pause(): void; stop(): void;
  seek(positionMs: number): void;          // solo si la fuente lo permite
  setVolume(v: number): void;
  selectAudioTrack(id: string): void;
  selectSubtitleTrack(id: string | null): void;
  setAudioDelay(ms: number): void;
  onState(cb: (s: PlayerState) => void): Unsubscribe;
  dispose(): void;
}
```

Cada capacidad se declara como `supported`, `unsupported` o `unknown`, con una explicación. La interfaz oculta o desactiva lo que no se soporta.

`PlaybackRequest` incluye las URLs candidatas por formato (`ts`, `m3u8`) y las cabeceras requeridas. El adaptador elige según sus capacidades (ADR-0003).

## Flujo de una fuente

1. El usuario añade la fuente → `SecureStore` guarda los secretos, `LocalDatabase` guarda el resto.
2. `SourceProvider.authenticate()` → capacidades del servidor (formatos permitidos, conexiones máximas, caducidad).
3. Sincronización incremental de categorías y canales, paginada y en segundo plano.
4. Si hay EPG, el parser XMLTV en streaming solo guarda la ventana configurada (por ejemplo, −1 / +3 días).
5. Al reproducir: `resolvePlaybackUrl()` → `PlaybackRequest` → `PlayerAdapter`.

## Almacenamiento por plataforma

| Plataforma | Datos | Secretos | Nota |
|---|---|---|---|
| iOS | SQLite | Keychain | Sin límites relevantes |
| Tizen / webOS | IndexedDB | Por verificar en la Fase 0 | Cuota del motor web variable |
| Roku | `tmp:` / `cachefs:` para caché; `roRegistry` para preferencias | `roRegistry` (cifrado) | Registro: 32 KB comprimidos en total. No cabe EPG ni catálogos completos: se descargan bajo demanda |

## Lo que no existe

Backend, cuentas, sincronización, proxy, analítica y crash reporting remoto.
