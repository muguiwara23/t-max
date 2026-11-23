// Fuentes del usuario: datos generales en SQLite, secretos en el Keychain (expo-secure-store).
import * as SecureStore from 'expo-secure-store';

import { getDb, wipeAll } from './db';

export type SourceType = 'xtream' | 'm3u' | 'stalker';

export interface SourceConfig {
  /** Xtream: servidor. M3U: (vacío, la URL va en secretos). Stalker: URL del portal. */
  server?: string;
  username?: string;
  epgUrl?: string;
  timezone?: string;
}

export interface SourceSecrets {
  password?: string;
  m3uUrl?: string;
  epgUrlSecret?: string;
  mac?: string;
}

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  enabled: boolean;
  config: SourceConfig;
  account: { allowedFormats: string[]; maxConnections: number | null } | null;
  lastRefresh: number | null;
  lastResult: 'ok' | 'partial' | 'error' | null;
  lastError: string | null;
  stats: { channels: number; groups: number; epgChannels: number; programmes: number } | null;
}

interface SourceRowDb {
  id: string;
  type: SourceType;
  name: string;
  enabled: number;
  config: string;
  account: string | null;
  last_refresh: number | null;
  last_result: Source['lastResult'];
  last_error: string | null;
  stats: string | null;
}

const secretKey = (id: string) => `tmax.src.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;

function fromRow(r: SourceRowDb): Source {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    enabled: !!r.enabled,
    config: JSON.parse(r.config || '{}'),
    account: r.account ? JSON.parse(r.account) : null,
    lastRefresh: r.last_refresh,
    lastResult: r.last_result,
    lastError: r.last_error,
    stats: r.stats ? JSON.parse(r.stats) : null,
  };
}

export async function listSources(): Promise<Source[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SourceRowDb>('SELECT * FROM sources ORDER BY sort, name');
  return rows.map(fromRow);
}

export async function getSecrets(id: string): Promise<SourceSecrets> {
  const raw = await SecureStore.getItemAsync(secretKey(id));
  return raw ? (JSON.parse(raw) as SourceSecrets) : {};
}

function newId(): string {
  return 'src-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export async function saveSource(input: { id?: string; type: SourceType; name: string; config: SourceConfig; secrets: SourceSecrets }): Promise<string> {
  const db = await getDb();
  const id = input.id ?? newId();
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM sources WHERE id = ?', [id]);
  if (existing) {
    await db.runAsync('UPDATE sources SET name = ?, config = ? WHERE id = ?', [input.name, JSON.stringify(input.config), id]);
  } else {
    const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) AS m FROM sources');
    await db.runAsync('INSERT INTO sources (id, type, name, enabled, sort, config) VALUES (?, ?, ?, 1, ?, ?)', [
      id,
      input.type,
      input.name,
      (max?.m ?? -1) + 1,
      JSON.stringify(input.config),
    ]);
  }
  await SecureStore.setItemAsync(secretKey(id), JSON.stringify(input.secrets));
  return id;
}

export async function setSourceEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE sources SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

export async function recordRefresh(
  id: string,
  r: { result: 'ok' | 'partial' | 'error'; error?: string | null; account?: Source['account']; stats?: Source['stats'] },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE sources SET last_refresh = ?, last_result = ?, last_error = ?, account = COALESCE(?, account), stats = COALESCE(?, stats) WHERE id = ?',
    [Date.now(), r.result, r.error ?? null, r.account ? JSON.stringify(r.account) : null, r.stats ? JSON.stringify(r.stats) : null, id],
  );
}

export async function deleteSource(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM programmes WHERE source_id = ?', [id]);
    await db.runAsync('DELETE FROM channels WHERE source_id = ?', [id]);
    await db.runAsync('DELETE FROM groups WHERE source_id = ?', [id]);
    await db.runAsync('DELETE FROM sources WHERE id = ?', [id]);
    await db.runAsync("DELETE FROM user_channels WHERE key LIKE ? ESCAPE '\\'", [id.replace(/[%_\\]/g, '\\$&') + ':%']);
    await db.runAsync('DELETE FROM user_groups WHERE source_id = ?', [id]);
  });
  await SecureStore.deleteItemAsync(secretKey(id));
}

export async function wipeEverything(): Promise<void> {
  const sources = await listSources();
  for (const s of sources) await SecureStore.deleteItemAsync(secretKey(s.id));
  await wipeAll();
}
