// Base de datos local (SQLite) del iPad. Nada de esto sale del dispositivo.
import * as SQLite from 'expo-sqlite';

import type { ChannelRow, GroupRow, ProgrammeRow } from './mapping';
import type { VodCategoryRow, VodItemRow } from './vod-mapping';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sources (
     id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
     sort INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL DEFAULT '{}', account TEXT,
     last_refresh INTEGER, last_result TEXT, last_error TEXT, stats TEXT);
   CREATE TABLE IF NOT EXISTS groups (
     id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, source_group_id TEXT NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_groups_source ON groups(source_id);
   CREATE TABLE IF NOT EXISTS channels (
     id TEXT PRIMARY KEY NOT NULL, key TEXT NOT NULL, source_id TEXT NOT NULL, source_channel_id TEXT NOT NULL,
     group_id TEXT, name TEXT NOT NULL, number INTEGER, logo TEXT, epg_id TEXT, catchup_days INTEGER NOT NULL DEFAULT 0,
     stream_url TEXT, cmd TEXT, sort INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(group_id, sort);
   CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source_id);
   CREATE TABLE IF NOT EXISTS programmes (
     source_id TEXT NOT NULL, epg_id TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, title TEXT NOT NULL, description TEXT);
   CREATE INDEX IF NOT EXISTS idx_prog ON programmes(source_id, epg_id, start);
   CREATE TABLE IF NOT EXISTS user_channels (
     key TEXT PRIMARY KEY NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, fav_sort INTEGER, last_watched INTEGER);`,
  // v2: preferencias de grupos del usuario. No se tocan al actualizar la fuente.
  `CREATE TABLE IF NOT EXISTS user_groups (
     source_id TEXT NOT NULL, source_group_id TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, manual_sort INTEGER,
     PRIMARY KEY (source_id, source_group_id));`,
  // v3: películas y series (catálogo de la fuente) + avance/favoritos del usuario (no se tocan al actualizar).
  `CREATE TABLE IF NOT EXISTS vod_categories (
     id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, kind TEXT NOT NULL, source_category_id TEXT NOT NULL,
     name TEXT NOT NULL, sort INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_vodcat_source ON vod_categories(source_id, kind, sort);
   CREATE TABLE IF NOT EXISTS vod_items (
     key TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, kind TEXT NOT NULL, source_item_id TEXT NOT NULL,
     category_id TEXT, title TEXT NOT NULL, poster TEXT, rating TEXT, year INTEGER, ext TEXT, sort INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_vod_cat ON vod_items(category_id, sort);
   CREATE INDEX IF NOT EXISTS idx_vod_source ON vod_items(source_id, kind, sort);
   CREATE TABLE IF NOT EXISTS user_vod (
     key TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, position REAL NOT NULL DEFAULT 0, duration REAL NOT NULL DEFAULT 0,
     completed INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0,
     parent_key TEXT, title TEXT, subtitle TEXT, poster TEXT, extra TEXT);
   CREATE INDEX IF NOT EXISTS idx_uvod_parent ON user_vod(parent_key);
   CREATE INDEX IF NOT EXISTS idx_uvod_updated ON user_vod(updated);`,
  // v4: Mis programas (avisos) y DVR (grabaciones en el iPad).
  `CREATE TABLE IF NOT EXISTS reminders (
     id TEXT PRIMARY KEY NOT NULL, channel_key TEXT NOT NULL, channel_name TEXT NOT NULL, source_id TEXT NOT NULL,
     title TEXT NOT NULL, description TEXT, start INTEGER NOT NULL, end INTEGER NOT NULL, notif_id TEXT, created INTEGER NOT NULL);
   CREATE UNIQUE INDEX IF NOT EXISTS idx_rem_prog ON reminders(channel_key, start);
   CREATE TABLE IF NOT EXISTS recordings (
     id TEXT PRIMARY KEY NOT NULL, channel_key TEXT NOT NULL, channel_name TEXT NOT NULL, source_id TEXT NOT NULL,
     title TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
     file TEXT, bytes INTEGER, error TEXT, in_photos INTEGER NOT NULL DEFAULT 0, notif_id TEXT, created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_rec_start ON recordings(status, start);`,
];

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('tmax.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      let v = row?.user_version ?? 0;
      while (v < MIGRATIONS.length) {
        await db.execAsync(MIGRATIONS[v]!);
        v++;
        await db.execAsync(`PRAGMA user_version = ${v}`);
      }
      return db;
    })();
  }
  return dbPromise;
}

/** Inserta muchas filas en lotes (pocas llamadas al puente nativo). */
async function insertMany<T extends object>(db: SQLite.SQLiteDatabase, table: string, cols: (keyof T & string)[], rows: T[]): Promise<void> {
  const per = Math.max(1, Math.floor(900 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const batch = rows.slice(i, i + per);
    const ph = batch.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const params: SQLite.SQLiteBindValue[] = [];
    for (const r of batch) for (const c of cols) params.push((r as Record<string, unknown>)[c] as SQLite.SQLiteBindValue);
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES ${ph}`, params);
  }
}

export async function replaceSourceContent(
  sourceId: string,
  groups: GroupRow[],
  channels: ChannelRow[],
  programmes: ProgrammeRow[] | null,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM groups WHERE source_id = ?', [sourceId]);
    await db.runAsync('DELETE FROM channels WHERE source_id = ?', [sourceId]);
    await insertMany(db, 'groups', ['id', 'source_id', 'source_group_id', 'name', 'sort'], groups);
    await insertMany(
      db,
      'channels',
      ['id', 'key', 'source_id', 'source_channel_id', 'group_id', 'name', 'number', 'logo', 'epg_id', 'catchup_days', 'stream_url', 'cmd', 'sort'],
      channels,
    );
    if (programmes) {
      await db.runAsync('DELETE FROM programmes WHERE source_id = ?', [sourceId]);
      await insertMany(db, 'programmes', ['source_id', 'epg_id', 'start', 'end', 'title', 'description'], programmes);
    }
  });
}

export async function replaceVodContent(sourceId: string, categories: VodCategoryRow[], items: VodItemRow[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM vod_categories WHERE source_id = ?', [sourceId]);
    await db.runAsync('DELETE FROM vod_items WHERE source_id = ?', [sourceId]);
    await insertMany(db, 'vod_categories', ['id', 'source_id', 'kind', 'source_category_id', 'name', 'sort'], categories);
    await insertMany(db, 'vod_items', ['key', 'source_id', 'kind', 'source_item_id', 'category_id', 'title', 'poster', 'rating', 'year', 'ext', 'sort'], items);
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

export async function wipeAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM programmes; DELETE FROM channels; DELETE FROM groups; DELETE FROM sources; DELETE FROM user_channels; DELETE FROM user_groups; DELETE FROM settings; ' +
      'DELETE FROM vod_categories; DELETE FROM vod_items; DELETE FROM user_vod; DELETE FROM reminders; DELETE FROM recordings;');
}
