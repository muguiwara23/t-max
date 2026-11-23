// Lecturas para las pantallas. Solo fuentes activas; los grupos ocultos por el usuario no aparecen.
import { getDb, getSetting, setSetting } from './db';
import { sortGroups, type ChannelRow, type GroupSortMode, type ProgrammeRow } from './mapping';

export const FAVORITES = '__fav';
export const RECENTS = '__recent';
export const ALL = '__all';

export interface GroupItem {
  id: string;
  name: string;
  count: number;
  special?: boolean;
  source_id?: string;
  source_group_id?: string;
  hidden?: boolean;
  providerSort?: number;
  manualSort?: number | null;
}

export interface SourceSection {
  sourceId: string;
  sourceName: string;
  mode: GroupSortMode;
  groups: GroupItem[];
}

export interface ChannelItem extends ChannelRow {
  favorite: boolean;
  source_type: 'xtream' | 'm3u' | 'stalker';
}

/** `null` = todas las fuentes. */
export type SourceFilter = string | null;

const srcCond = (f: SourceFilter, alias = 'c') => (f ? ` AND ${alias}.source_id = ?` : '');
const srcParam = (f: SourceFilter) => (f ? [f] : []);

const HIDDEN_JOIN = `LEFT JOIN groups gg ON gg.id = c.group_id
  LEFT JOIN user_groups ug ON ug.source_id = gg.source_id AND ug.source_group_id = gg.source_group_id`;
const NOT_HIDDEN = `COALESCE(ug.hidden, 0) = 0`;

export async function getGroupSortMode(sourceId: string): Promise<GroupSortMode> {
  const v = await getSetting(`groupSort:${sourceId}`);
  return v === 'name' || v === 'manual' ? v : 'provider';
}

export async function setGroupSortMode(sourceId: string, mode: GroupSortMode): Promise<void> {
  await setSetting(`groupSort:${sourceId}`, mode);
}

export async function listGroups(filter: SourceFilter, opts: { includeHidden?: boolean } = {}): Promise<{ pinned: GroupItem[]; all: GroupItem; sections: SourceSection[] }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string; name: string; count: number; source_id: string; source_group_id: string; providerSort: number;
    hidden: number; manualSort: number | null; source_name: string; source_sort: number;
  }>(
    `SELECT g.id, g.name, COUNT(c.id) AS count, g.source_id, g.source_group_id, g.sort AS providerSort,
            COALESCE(ug.hidden, 0) AS hidden, ug.manual_sort AS manualSort, s.name AS source_name, s.sort AS source_sort
       FROM groups g
       JOIN sources s ON s.id = g.source_id AND s.enabled = 1
       JOIN channels c ON c.group_id = g.id
       LEFT JOIN user_groups ug ON ug.source_id = g.source_id AND ug.source_group_id = g.source_group_id
      WHERE 1 = 1 ${srcCond(filter, 'g')}
      GROUP BY g.id ORDER BY s.sort, g.sort`,
    srcParam(filter),
  );
  const bySource = new Map<string, SourceSection>();
  for (const r of rows) {
    let sec = bySource.get(r.source_id);
    if (!sec) {
      sec = { sourceId: r.source_id, sourceName: r.source_name, mode: await getGroupSortMode(r.source_id), groups: [] };
      bySource.set(r.source_id, sec);
    }
    if (r.hidden && !opts.includeHidden) continue;
    sec.groups.push({ ...r, hidden: !!r.hidden });
  }
  const sections = [...bySource.values()].map((s) => ({ ...s, groups: sortGroups(s.groups as Required<GroupItem>[], s.mode) }));

  const base = `FROM channels c JOIN sources s ON s.id = c.source_id AND s.enabled = 1 ${HIDDEN_JOIN}`;
  const fav = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM user_channels u JOIN channels c ON c.key = u.key JOIN sources s ON s.id = c.source_id AND s.enabled = 1 WHERE u.favorite = 1 ${srcCond(filter)}`,
    srcParam(filter),
  );
  const rec = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM user_channels u JOIN channels c ON c.key = u.key JOIN sources s ON s.id = c.source_id AND s.enabled = 1 WHERE u.last_watched IS NOT NULL ${srcCond(filter)}`,
    srcParam(filter),
  );
  const all = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n ${base} WHERE ${NOT_HIDDEN} ${srcCond(filter)}`, srcParam(filter));
  return {
    pinned: [
      { id: FAVORITES, name: 'Favoritos', count: fav?.n ?? 0, special: true },
      { id: RECENTS, name: 'Recientes', count: Math.min(rec?.n ?? 0, 30), special: true },
    ],
    all: { id: ALL, name: 'Todos', count: all?.n ?? 0, special: true },
    sections,
  };
}

const CHANNEL_COLS = `c.*, s.type AS source_type, COALESCE(u.favorite, 0) AS favorite`;
const CHANNEL_FROM = `FROM channels c JOIN sources s ON s.id = c.source_id AND s.enabled = 1 LEFT JOIN user_channels u ON u.key = c.key ${HIDDEN_JOIN}`;

function fix(rows: (Omit<ChannelItem, 'favorite'> & { favorite: number })[]): ChannelItem[] {
  return rows.map((r) => ({ ...r, favorite: !!r.favorite }));
}

export async function channelsIn(groupId: string, filter: SourceFilter): Promise<ChannelItem[]> {
  const db = await getDb();
  const p = srcParam(filter);
  if (groupId === FAVORITES) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE u.favorite = 1 ${srcCond(filter)} ORDER BY u.fav_sort, c.sort`, p));
  }
  if (groupId === RECENTS) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE u.last_watched IS NOT NULL ${srcCond(filter)} ORDER BY u.last_watched DESC LIMIT 30`, p));
  }
  if (groupId === ALL) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE ${NOT_HIDDEN} ${srcCond(filter)} ORDER BY s.sort, c.sort LIMIT 5000`, p));
  }
  return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE c.group_id = ? ORDER BY c.sort`, [groupId]));
}

export async function searchChannels(q: string, filter: SourceFilter): Promise<ChannelItem[]> {
  const db = await getDb();
  const t = q.trim();
  if (!t) return [];
  if (/^\d+$/.test(t)) {
    return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE c.number = ? AND ${NOT_HIDDEN} ${srcCond(filter)} ORDER BY s.sort LIMIT 50`, [Number(t), ...srcParam(filter)]));
  }
  return fix(await db.getAllAsync(`SELECT ${CHANNEL_COLS} ${CHANNEL_FROM} WHERE c.name LIKE ? AND ${NOT_HIDDEN} ${srcCond(filter)} ORDER BY s.sort, c.sort LIMIT 200`, [`%${t}%`, ...srcParam(filter)]));
}

export async function setGroupHidden(sourceId: string, sourceGroupId: string, hidden: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO user_groups (source_id, source_group_id, hidden) VALUES (?, ?, ?)
     ON CONFLICT(source_id, source_group_id) DO UPDATE SET hidden = excluded.hidden`,
    [sourceId, sourceGroupId, hidden ? 1 : 0],
  );
}

/** Guarda el orden manual completo de los grupos de una fuente. */
export async function saveManualOrder(sourceId: string, sourceGroupIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < sourceGroupIds.length; i++) {
      await db.runAsync(
        `INSERT INTO user_groups (source_id, source_group_id, manual_sort) VALUES (?, ?, ?)
         ON CONFLICT(source_id, source_group_id) DO UPDATE SET manual_sort = excluded.manual_sort`,
        [sourceId, sourceGroupIds[i]!, i],
      );
    }
  });
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
