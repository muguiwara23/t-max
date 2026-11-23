// Lecturas para las pantallas. Solo fuentes activas.
import { getDb } from './db';
import type { ChannelRow, ProgrammeRow } from './mapping';

export const FAVORITES = '__fav';
export const RECENTS = '__recent';
export const ALL = '__all';

export interface GroupItem {
  id: string;
  name: string;
  count: number;
  special?: boolean;
}

export interface ChannelItem extends ChannelRow {
  favorite: boolean;
  source_type: 'xtream' | 'm3u' | 'stalker';
}

export async function listGroups(): Promise<{ pinned: GroupItem[]; groups: GroupItem[] }> {
  const db = await getDb();
  const groups = await db.getAllAsync<GroupItem>(
    `SELECT g.id, g.name, COUNT(c.id) AS count
       FROM groups g JOIN sources s ON s.id = g.source_id AND s.enabled = 1
       JOIN channels c ON c.group_id = g.id
      GROUP BY g.id ORDER BY s.sort, g.sort`,
  );
  const fav = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM user_channels u JOIN channels c ON c.key = u.key JOIN sources s ON s.id = c.source_id AND s.enabled = 1 WHERE u.favorite = 1`,
  );
  const rec = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM user_channels u JOIN channels c ON c.key = u.key JOIN sources s ON s.id = c.source_id AND s.enabled = 1 WHERE u.last_watched IS NOT NULL`,
  );
  const all = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM channels c JOIN sources s ON s.id = c.source_id AND s.enabled = 1`);
  return {
    pinned: [
      { id: FAVORITES, name: 'Favoritos', count: fav?.n ?? 0, special: true },
      { id: RECENTS, name: 'Recientes', count: Math.min(rec?.n ?? 0, 30), special: true },
    ],
    groups: [{ id: ALL, name: 'Todos', count: all?.n ?? 0, special: true }, ...groups],
  };
}

const CHANNEL_COLS = `c.*, s.type AS source_type, COALESCE(u.favorite, 0) AS favorite`;
const CHANNEL_FROM = `FROM channels c JOIN sources s ON s.id = c.source_id AND s.enabled = 1 LEFT JOIN user_channels u ON u.key = c.key`;

function fix(rows: (Omit<ChannelItem, 'favorite'> & { favorite: number })[]): ChannelItem[] {
  return rows.map((r) => ({ ...r, favorite: !!r.favorite }));
}

export async function channelsIn(groupId: string): Promise<ChannelItem[]> {
  const db = await getDb();
  if (groupId === FAVORITES) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE u.favorite = 1 ORDER BY u.fav_sort, c.sort`));
  }
  if (groupId === RECENTS) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE u.last_watched IS NOT NULL ORDER BY u.last_watched DESC LIMIT 30`));
  }
  if (groupId === ALL) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} ORDER BY s.sort, c.sort LIMIT 3000`));
  }
  return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE c.group_id = ? ORDER BY c.sort`, [groupId]));
}

export async function searchChannels(q: string): Promise<ChannelItem[]> {
  const db = await getDb();
  const t = q.trim();
  if (!t) return [];
  if (/^\d+$/.test(t)) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE c.number = ? ORDER BY s.sort LIMIT 50`, [Number(t)]));
  }
  return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE c.name LIKE ? ORDER BY s.sort, c.sort LIMIT 200`, [`%${t}%`]));
}

/** Programas de varios canales entre `from` y `to`, agrupados por clave de canal. */
export async function programmesFor(channels: ChannelRow[], from: number, to: number): Promise<Map<string, ProgrammeRow[]>> {
  const db = await getDb();
  const out = new Map<string, ProgrammeRow[]>();
  const bySource = new Map<string, Map<string, string[]>>();
  for (const c of channels) {
    if (!c.epg_id) continue;
    let m = bySource.get(c.source_id);
    if (!m) bySource.set(c.source_id, (m = new Map()));
    const keys = m.get(c.epg_id) ?? [];
    keys.push(c.key);
    m.set(c.epg_id, keys);
  }
  for (const [sourceId, m] of bySource) {
    const ids = [...m.keys()];
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400);
      const rows = await db.getAllAsync<ProgrammeRow>(
        `SELECT * FROM programmes WHERE source_id = ? AND epg_id IN (${part.map(() => '?').join(',')}) AND end > ? AND start < ? ORDER BY start`,
        [sourceId, ...part, from, to],
      );
      for (const r of rows) {
        for (const key of m.get(r.epg_id) ?? []) {
          const list = out.get(key) ?? [];
          list.push(r);
          out.set(key, list);
        }
      }
    }
  }
  return out;
}

export async function toggleFavorite(key: string, favorite: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO user_channels (key, favorite, fav_sort) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET favorite = excluded.favorite, fav_sort = excluded.fav_sort`,
    [key, favorite ? 1 : 0, Date.now()],
  );
}

export async function markWatched(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO user_channels (key, last_watched) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET last_watched = excluded.last_watched`,
    [key, Date.now()],
  );
}
