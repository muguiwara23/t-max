// Un solo cliente Stalker por fuente en toda la app (sincronización y reproducción).
// Si cada parte pidiera su propio token con la misma MAC, el portal invalidaría el anterior.
// Además manda la "señal de vida" (watchdog) mientras haya un canal de esa fuente en pantalla.
import { StalkerClient } from '@tmax/core';
import { AppState } from 'react-native';

import { fetchHttp } from '../platform/http';
import { logEvent } from './diag';
import type { Source, SourceSecrets } from './sources';

const clients = new Map<string, { client: StalkerClient; sig: string; name: string }>();
/** Reproductores de canales Stalker en uso: token → fuente. */
const playing = new Map<string, string>();
const WATCHDOG_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

const EVENT_TEXT = {
  handshake: 'Sesión nueva con el portal',
  renewed: 'El portal rechazó la sesión; se renovó',
  'watchdog-fail': 'La señal de vida al portal falló',
  'link-retry': 'El portal dio un enlace inválido; se pidió otro con sesión nueva',
} as const;

export function stalkerFor(source: Source, secrets: SourceSecrets): StalkerClient {
  const sig = `${source.config.server ?? ''}|${secrets.mac ?? ''}|${source.config.timezone ?? ''}`;
  const hit = clients.get(source.id);
  if (hit && hit.sig === sig) return hit.client;
  const client = new StalkerClient(fetchHttp, {
    portalUrl: source.config.server ?? '',
    mac: secrets.mac ?? '',
    timezone: source.config.timezone,
    onEvent: (e) => logEvent({ kind: 'stalker', source: source.name, msg: EVENT_TEXT[e] }),
  });
  clients.set(source.id, { client, sig, name: source.name });
  return client;
}

export function forgetStalker(sourceId?: string): void {
  if (sourceId) clients.delete(sourceId);
  else clients.clear();
}

function tick(): void {
  if (AppState.currentState === 'background' && playing.size === 0) return;
  const ids = new Set(playing.values());
  for (const id of ids) void clients.get(id)?.client.watchdog(true);
}

/** Un reproductor empezó/dejó de mostrar un canal Stalker. */
export function stalkerPlaying(token: string, sourceId: string | null): void {
  if (sourceId) playing.set(token, sourceId);
  else playing.delete(token);
  if (playing.size > 0 && !timer) timer = setInterval(tick, WATCHDOG_MS);
  if (playing.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}
