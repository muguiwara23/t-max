// Respaldo completo de T-Max en un archivo JSON: fuentes (con sus contraseñas, tal cual), ajustes generales
// y por fuente, grupos ocultos y su orden, favoritos y recientes, avance de películas/series, Mis programas
// y grabaciones programadas. No incluye canales, guía ni catálogos: se vuelven a descargar al actualizar.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';

import { getDb } from './db';
import { invalidatePrefs } from './prefs';
import { rescheduleReminders } from './reminders';
import { getSecrets, listSources, type SourceSecrets } from './sources';

const FORMAT = 'tmax-backup';
const VERSION = 1;

type Row = Record<string, unknown>;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  sources: (Row & { secrets: SourceSecrets })[];
  settings: Row[];
  user_groups: Row[];
  user_channels: Row[];
  user_vod: Row[];
  reminders: Row[];
  recordings: Row[];
}

const secretKey = (id: string) => `tmax.src.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export async function buildBackup(appVersion: string): Promise<BackupFile> {
  const db = await getDb();
  const all = (sql: string) => db.getAllAsync<Row>(sql);
  const sources = await all('SELECT id, type, name, enabled, sort, config, account FROM sources ORDER BY sort');
  const withSecrets = [];
  for (const s of sources) withSecrets.push({ ...s, secrets: await getSecrets(String(s.id)) });
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: `T-Max ${appVersion}`,
    sources: withSecrets,
    settings: await all('SELECT key, value FROM settings'),
    user_groups: await all('SELECT * FROM user_groups'),
    user_channels: await all('SELECT * FROM user_channels'),
    user_vod: await all('SELECT * FROM user_vod'),
    reminders: await all('SELECT id, channel_key, channel_name, source_id, title, description, start, end, created FROM reminders WHERE end > strftime(\'%s\',\'now\') * 1000'),
    recordings: await all("SELECT id, channel_key, channel_name, source_id, title, start, end, kind, status, created FROM recordings WHERE status = 'scheduled'"),
  };
}

/** Crea el archivo y abre la hoja de Compartir (Archivos, AirDrop, Mail…). */
export async function exportBackup(appVersion: string): Promise<{ sources: number }> {
  const data = await buildBackup(appVersion);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const f = new File(Paths.cache, `T-Max-respaldo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`);
  if (f.exists) f.delete();
  f.create();
  f.write(JSON.stringify(data, null, 1));
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Guardar respaldo de T-Max' });
  return { sources: data.sources.length };
}

export function parseBackup(text: string): BackupFile {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un respaldo de T-Max (no es JSON válido).');
  }
  const b = j as Partial<BackupFile>;
  if (!b || b.format !== FORMAT || typeof b.version !== 'number') throw new Error('El archivo no es un respaldo de T-Max.');
  if (b.version > VERSION) throw new Error('Este respaldo es de una versión más nueva de T-Max. Actualiza la app primero.');
  for (const k of ['sources', 'settings', 'user_groups', 'user_channels', 'user_vod', 'reminders', 'recordings'] as const) {
    if (!Array.isArray(b[k])) (b as Record<string, unknown>)[k] = [];
  }
  return b as BackupFile;
}

/** Elegir el archivo. null = el usuario canceló. */
export async function pickBackup(): Promise<BackupFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', 'public.text', '*/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const text = await new File(r.assets[0].uri).text();
  return parseBackup(text);
}

const COLS: Record<string, string[]> = {
  sources: ['id', 'type', 'name', 'enabled', 'sort', 'config', 'account'],
  settings: ['key', 'value'],
  user_groups: ['source_id', 'source_group_id', 'hidden', 'manual_sort'],
  user_channels: ['key', 'favorite', 'fav_sort', 'last_watched'],
  user_vod: ['key', 'kind', 'position', 'duration', 'completed', 'favorite', 'updated', 'parent_key', 'title', 'subtitle', 'poster', 'extra'],
  reminders: ['id', 'channel_key', 'channel_name', 'source_id', 'title', 'description', 'start', 'end', 'created'],
  recordings: ['id', 'channel_key', 'channel_name', 'source_id', 'title', 'start', 'end', 'kind', 'status', 'created'],
};

/**
 * Reemplaza todo lo de este iPad por el respaldo. Las grabaciones ya hechas y sus archivos no se tocan.
 * Después hay que actualizar las fuentes para volver a bajar canales, guía y catálogos.
 */
export async function restoreBackup(b: BackupFile): Promise<{ sources: string[] }> {
  const db = await getDb();
  // Secretos viejos fuera del Keychain.
  for (const s of await listSources()) await SecureStore.deleteItemAsync(secretKey(s.id)).catch(() => {});
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      `DELETE FROM programmes; DELETE FROM channels; DELETE FROM groups; DELETE FROM sources; DELETE FROM settings;
       DELETE FROM user_channels; DELETE FROM user_groups; DELETE FROM vod_categories; DELETE FROM vod_items; DELETE FROM user_vod;
       DELETE FROM reminders; DELETE FROM recordings WHERE status = 'scheduled';`,
    );
    for (const [table, cols] of Object.entries(COLS)) {
      const rows = (b as unknown as Record<string, Row[]>)[table] ?? [];
      for (const r of rows) {
        const vals = cols.map((c) => {
          const v = r[c];
          if (v === undefined || v === null) return null;
          if (typeof v === 'object') return JSON.stringify(v);
          return typeof v === 'number' || typeof v === 'string' ? v : String(v);
        });
        if (table === 'sources' && (!r.id || !r.type)) continue;
        await db.runAsync(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);
      }
    }
  });
  for (const s of b.sources) {
    if (s.id && s.secrets) await SecureStore.setItemAsync(secretKey(String(s.id)), JSON.stringify(s.secrets));
  }
  invalidatePrefs();
  await rescheduleReminders().catch(() => {});
  return { sources: b.sources.map((s) => String(s.name ?? s.id)) };
}
