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
/** Se revisa cada 15 s; a cada portal se le manda la señal según su propio watchdog_timeout. */
const TICK_MS = 15_000;
const lastPing = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;

const EVENT_TEXT = {
  handshake: 'Sesión nueva con el portal',
  renewed: 'El portal rechazó la sesión; se renovó',
  'watchdog-fail': 'La señal de vida al portal falló',
  'link-retry': 'El portal dio un enlace inválido; se pidió otro con sesión nueva',
  'do-auth': 'El portal pidió usuario y contraseña; se enviaron',
} as const;

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function stalkerFor(source: Source, secrets: SourceSecrets): StalkerClient {
  const sig = JSON.stringify([source.config.server, source.config.timezone, secrets.mac, secrets.serialNumber, secrets.deviceId1, secrets.deviceId2, secrets.signature, secrets.signature2, secrets.portalLogin, secrets.portalPassword]);
  const hit = clients.get(source.id);
  if (hit && hit.sig === sig) return hit.client;
  const client = new StalkerClient(fetchHttp, {
    portalUrl: source.config.server ?? '',
    mac: secrets.mac ?? '',
    // El portal valida la zona con PHP: usar la del iPad (IANA), nunca vacía.
    timezone: source.config.timezone || deviceTimezone(),
    serialNumber: secrets.serialNumber,
    deviceId1: secrets.deviceId1,
    deviceId2: secrets.deviceId2,
    signature: secrets.signature,
    signature2: secrets.signature2,
    login: secrets.portalLogin,
    password: secrets.portalPassword,
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
  const now = Date.now();
  for (const id of ids) {
    const c = clients.get(id)?.client;
    if (!c) continue;
    if (now - (lastPing.get(id) ?? 0) < c.watchdogSeconds * 1000 * 0.9) continue;
    lastPing.set(id, now);
    void c.watchdog(true);
  }
}

/** Un reproductor empezó/dejó de mostrar un canal Stalker. */
export function stalkerPlaying(token: string, sourceId: string | null): void {
  if (sourceId) playing.set(token, sourceId);
  else playing.delete(token);
  if (playing.size > 0 && !timer) timer = setInterval(tick, TICK_MS);
  if (playing.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}
