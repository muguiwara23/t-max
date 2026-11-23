// Registro de diagnóstico local (últimos 200 eventos). Nunca sale del iPad salvo que tú lo compartas.
// Todo pasa por redact(): sin contraseñas, MAC completas ni tokens.
import { redact } from '@tmax/core';

import { getSetting, setSetting } from './db';

export interface DiagEvent {
  at: number;
  kind: 'play' | 'error' | 'reconnect' | 'stalker' | 'dvr' | 'info';
  source?: string;
  channel?: string;
  msg: string;
}

const MAX = 200;
let buf: DiagEvent[] | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<DiagEvent[]> {
  if (!buf) {
    try {
      buf = JSON.parse((await getSetting('diagLog')) ?? '[]') as DiagEvent[];
    } catch {
      buf = [];
    }
  }
  return buf;
}

export function logEvent(e: Omit<DiagEvent, 'at'>): void {
  void load().then((b) => {
    b.push({ ...e, msg: redact(e.msg), at: Date.now() });
    if (b.length > MAX) b.splice(0, b.length - MAX);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void setSetting('diagLog', JSON.stringify(b)).catch(() => {}), 2000);
  });
}

export async function readLog(): Promise<DiagEvent[]> {
  return [...(await load())].reverse();
}

export async function clearLog(): Promise<void> {
  buf = [];
  await setSetting('diagLog', '[]');
}

export function logAsText(list: DiagEvent[]): string {
  return list
    .map((e) => `${new Date(e.at).toLocaleString('es-MX')} [${e.kind}]${e.source ? ` ${e.source}` : ''}${e.channel ? ` · ${e.channel}` : ''} — ${e.msg}`)
    .join('\n');
}
