// Mis programas: programas guardados desde la guía con aviso local del iPad.
import { getDb } from './db';
import { REMIND_BEFORE_MS } from './dvr-model';
import type { ProgrammeRow } from './mapping';
import type { ChannelItem } from './queries';
import { cancelNotify, notifyAt } from '../platform/notify';

export interface Reminder {
  id: string;
  channel_key: string;
  channel_name: string;
  source_id: string;
  title: string;
  description: string | null;
  start: number;
  end: number;
  notif_id: string | null;
  created: number;
}

const idOf = (channelKey: string, start: number) => `${channelKey}@${start}`;

export async function listReminders(includePast = false): Promise<Reminder[]> {
  const db = await getDb();
  return db.getAllAsync<Reminder>(
    `SELECT * FROM reminders ${includePast ? '' : 'WHERE end > ?'} ORDER BY start`,
    includePast ? [] : [Date.now()],
  );
}

export async function reminderKeys(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM reminders WHERE end > ?', [Date.now()]);
  return new Set(rows.map((r) => r.id));
}

export const reminderId = idOf;

/** Guarda el programa y programa el aviso. Devuelve false si iOS no dio permiso de notificaciones. */
export async function addReminder(ch: ChannelItem, p: ProgrammeRow): Promise<{ ok: boolean; notified: boolean }> {
  const db = await getDb();
  const id = idOf(ch.key, p.start);
  const when = Math.max(p.start - REMIND_BEFORE_MS, Date.now() + 5000);
  const notif = p.start > Date.now()
    ? await notifyAt(when, `Empieza: ${p.title}`, `${ch.name} · toca para verlo`, { type: 'reminder', channelKey: ch.key }).catch(() => null)
    : null;
  await db.runAsync(
    `INSERT OR REPLACE INTO reminders (id, channel_key, channel_name, source_id, title, description, start, end, notif_id, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ch.key, ch.name, ch.source_id, p.title, p.description, p.start, p.end, notif, Date.now()],
  );
  return { ok: true, notified: !!notif };
}

export async function removeReminder(id: string): Promise<void> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ notif_id: string | null }>('SELECT notif_id FROM reminders WHERE id = ?', [id]);
  await cancelNotify(r?.notif_id);
  await db.runAsync('DELETE FROM reminders WHERE id = ?', [id]);
}

/** Limpia los que ya terminaron hace más de un día. */
export async function pruneReminders(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reminders WHERE end < ?', [Date.now() - 86400000]);
}

/** Tras importar un respaldo: volver a programar los avisos futuros en este iPad. */
export async function rescheduleReminders(): Promise<void> {
  const db = await getDb();
  for (const r of await listReminders()) {
    if (r.start <= Date.now()) continue;
    await cancelNotify(r.notif_id);
    const id = await notifyAt(r.start - REMIND_BEFORE_MS, `Empieza: ${r.title}`, `${r.channel_name} · toca para verlo`, { type: 'reminder', channelKey: r.channel_key }).catch(() => null);
    await db.runAsync('UPDATE reminders SET notif_id = ? WHERE id = ?', [id, r.id]);
  }
}
