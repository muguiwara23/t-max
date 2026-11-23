// Base de datos local (SQLite) del iPad. Nada de esto sale del dispositivo.
import * as SQLite from 'expo-sqlite';

import type { ChannelRow, GroupRow, ProgrammeRow } from './mapping';

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
  await db.execAsync('DELETE FROM programmes; DELETE FROM channels; DELETE FROM groups; DELETE FROM sources; DELETE FROM user_channels; DELETE FROM settings;');
}
