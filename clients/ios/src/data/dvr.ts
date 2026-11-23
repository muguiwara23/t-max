// DVR del iPad: grabaciones en la base local, archivos en Documentos/dvr y copia final a la galería de Fotos.
// La grabación la hace mpv (propiedad stream-record) guardando el flujo tal como llega, sin recodificar.
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';

import { getDb, getSetting } from './db';
import { PHOTOS_EXTS, overlaps, recordingFileName, type RecStatus } from './dvr-model';
import type { ProgrammeRow } from './mapping';
import type { ChannelItem } from './queries';
import { cancelNotify, notifyAt, notifyNow } from '../platform/notify';

export interface Recording {
  id: string;
  channel_key: string;
  channel_name: string;
  source_id: string;
  title: string;
  start: number;
  end: number;
  kind: 'scheduled' | 'manual';
  status: RecStatus;
  file: string | null;
  bytes: number | null;
  error: string | null;
  in_photos: number;
  notif_id: string | null;
  created: number;
}

const newId = () => 'rec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

export function dvrDir(): Directory {
  const d = new Directory(Paths.document, 'dvr');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Ruta del sistema de archivos (mpv no entiende file://). */
export function fsPath(f: File): string {
  return decodeURI(f.uri.replace(/^file:\/\//, ''));
}

/** Contenedor de grabación: MP4 (va a Fotos) o MKV (más tolerante; se queda en la app). */
export async function recordContainer(): Promise<'mp4' | 'mkv'> {
  return (await getSetting('dvrContainer')) === 'mkv' ? 'mkv' : 'mp4';
}

export async function newRecordingFile(r: { channel_name: string; title: string; start: number }, ext: string): Promise<File> {
  const f = new File(dvrDir(), recordingFileName(r, ext, new Date().getTimezoneOffset()));
  if (f.exists) f.delete();
  return f;
}

export async function listRecordings(): Promise<Recording[]> {
  const db = await getDb();
  return db.getAllAsync<Recording>("SELECT * FROM recordings WHERE status != 'cancelled' ORDER BY start DESC");
}

export async function activeRecordings(): Promise<Recording[]> {
  const db = await getDb();
  return db.getAllAsync<Recording>("SELECT * FROM recordings WHERE kind = 'scheduled' AND status IN ('scheduled', 'recording')");
}

export async function getRecording(id: string): Promise<Recording | null> {
  const db = await getDb();
  return db.getFirstAsync<Recording>('SELECT * FROM recordings WHERE id = ?', [id]);
}

export async function updateRecording(id: string, patch: Partial<Pick<Recording, 'status' | 'file' | 'bytes' | 'error' | 'in_photos' | 'end' | 'notif_id'>>): Promise<void> {
  const db = await getDb();
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return;
  await db.runAsync(`UPDATE recordings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => patch[k] ?? null), id]);
}

/** Programas que ya tienen grabación programada (clave canal@inicio). */
export async function scheduledKeys(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ channel_key: string; start: number }>("SELECT channel_key, start FROM recordings WHERE status IN ('scheduled','recording')");
  return new Set(rows.map((r) => `${r.channel_key}@${r.start}`));
}

export async function scheduleRecording(ch: ChannelItem, p: ProgrammeRow): Promise<{ ok: boolean; reason?: string }> {
  if (p.end <= Date.now()) return { ok: false, reason: 'Ese programa ya terminó.' };
  const db = await getDb();
  const same = await db.getAllAsync<{ start: number; end: number }>(
    "SELECT start, end FROM recordings WHERE channel_key = ? AND status IN ('scheduled','recording')",
    [ch.key],
  );
  if (same.some((r) => overlaps(r, p))) return { ok: false, reason: 'Ya hay una grabación de ese canal a esa hora.' };
  const id = newId();
  const notif = await notifyAt(
    p.start - 3 * 60000,
    `En 3 min se graba: ${p.title}`,
    `${ch.name} · deja T-Max abierto para que grabe`,
    { type: 'recording', recordingId: id, channelKey: ch.key },
  ).catch(() => null);
  await db.runAsync(
    `INSERT INTO recordings (id, channel_key, channel_name, source_id, title, start, end, kind, status, notif_id, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'scheduled', ?, ?)`,
    [id, ch.key, ch.name, ch.source_id, p.title, p.start, p.end, notif, Date.now()],
  );
  return { ok: true };
}

/** Grabación de lo que estoy viendo: la controla el reproductor. */
export async function createManualRecording(ch: ChannelItem, title: string, file: File): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO recordings (id, channel_key, channel_name, source_id, title, start, end, kind, status, file, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 'recording', ?, ?)`,
    [id, ch.key, ch.name, ch.source_id, title, now, now + 6 * 3600000, file.uri, now],
  );
  return id;
}

export async function cancelRecording(id: string): Promise<void> {
  const r = await getRecording(id);
  if (!r) return;
  await cancelNotify(r.notif_id);
  await updateRecording(id, { status: 'cancelled' });
}

export async function deleteRecording(id: string): Promise<void> {
  const r = await getRecording(id);
  if (!r) return;
  await cancelNotify(r.notif_id);
  if (r.file) {
    try {
      const f = new File(r.file);
      if (f.exists) f.delete();
    } catch {
      // ya no existe
    }
  }
  const db = await getDb();
  await db.runAsync('DELETE FROM recordings WHERE id = ?', [id]);
}

function fileSize(uri: string | null): number {
  if (!uri) return 0;
  try {
    const f = new File(uri);
    return f.exists ? (f.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function recordingBytes(uri: string | null): number {
  return fileSize(uri);
}

/**
 * Termina una grabación (mpv ya cerró el archivo): revisa que tenga datos y, si es MP4/MOV,
 * la guarda en Fotos. Si Fotos la acepta, la copia del iPad se borra para no ocupar espacio dos veces.
 */
export async function finalizeRecording(id: string, opts: { reason?: string } = {}): Promise<Recording | null> {
  const r = await getRecording(id);
  if (!r) return null;
  await updateRecording(id, { status: 'saving', end: r.kind === 'manual' ? Date.now() : r.end });
  // mpv cierra el archivo de forma asíncrona: esperar a que termine de escribir.
  let bytes = 0;
  for (let i = 0; i < 6; i++) {
    await new Promise((res) => setTimeout(res, 700));
    const b = fileSize(r.file);
    if (b > 0 && b === bytes) break;
    bytes = b;
  }
  if (bytes < 64 * 1024) {
    await updateRecording(id, { status: 'failed', bytes, error: opts.reason ?? 'La grabación quedó vacía (el canal no envió datos o el formato no se pudo grabar).' });
    await notifyNow('No se pudo grabar', `${r.title} · ${r.channel_name}`);
    return getRecording(id);
  }
  const ext = (r.file ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (!PHOTOS_EXTS.includes(ext)) {
    await updateRecording(id, { status: 'done', bytes, error: opts.reason ?? null });
    await notifyNow('Grabación lista', `${r.title} · está en T-Max → DVR`);
    return getRecording(id);
  }
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) throw new Error('Sin permiso para guardar en Fotos. Actívalo en Ajustes del iPad → T-Max → Fotos.');
    await MediaLibrary.saveToLibraryAsync(r.file!);
    try {
      new File(r.file!).delete();
    } catch {
      // si no se puede borrar, se queda en la app
    }
    await updateRecording(id, { status: 'done', bytes, in_photos: 1, file: null, error: opts.reason ?? null });
    await notifyNow('Grabación guardada en Fotos', `${r.title} · ${r.channel_name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateRecording(id, { status: 'done', bytes, error: `No se pudo pasar a Fotos: ${msg}. La grabación sigue en T-Max → DVR.` });
  }
  return getRecording(id);
}

/** Reintentar el paso a Fotos de una grabación que quedó en la app. */
export async function retrySaveToPhotos(id: string): Promise<string | null> {
  const r = await getRecording(id);
  if (!r?.file) return 'La grabación ya no tiene archivo en el iPad.';
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return 'Sin permiso para guardar en Fotos. Actívalo en Ajustes del iPad → T-Max → Fotos.';
    await MediaLibrary.saveToLibraryAsync(r.file);
    try {
      new File(r.file).delete();
    } catch {
      // se queda
    }
    await updateRecording(id, { in_photos: 1, file: null, error: null });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Al abrir la app: lo que quedó "grabando" de una sesión anterior se cerró a la fuerza. */
export async function recoverInterrupted(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<Recording>("SELECT * FROM recordings WHERE status IN ('recording', 'saving')");
  for (const r of rows) {
    const bytes = fileSize(r.file);
    const ext = (r.file ?? '').split('.').pop()?.toLowerCase();
    // Un MP4 cortado de golpe no tiene índice y no se puede abrir; un MKV sí.
    if (bytes > 64 * 1024 && ext === 'mkv') await updateRecording(r.id, { status: 'done', bytes, error: 'Se cortó porque la app se cerró.' });
    else await updateRecording(r.id, { status: 'failed', bytes, error: 'La app se cerró durante la grabación.' });
  }
  // Programadas que nunca arrancaron porque la app estuvo cerrada.
  await db.runAsync("UPDATE recordings SET status = 'missed', error = 'T-Max no estaba abierto a esa hora.' WHERE status = 'scheduled' AND end < ?", [Date.now()]);
}

/** Tras un corte de señal: lo grabado se guarda como una parte y el resto se graba como otra. */
export async function continueRecording(r: Recording): Promise<void> {
  if (r.end <= Date.now()) return;
  const db = await getDb();
  const part = /\(parte (\d+)\)$/.exec(r.title);
  const n = part ? Number(part[1]) + 1 : 2;
  const title = `${r.title.replace(/\s*\(parte \d+\)$/, '')} (parte ${n})`;
  await db.runAsync(
    `INSERT INTO recordings (id, channel_key, channel_name, source_id, title, start, end, kind, status, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'scheduled', ?)`,
    [newId(), r.channel_key, r.channel_name, r.source_id, title, Date.now(), r.end, Date.now()],
  );
}
