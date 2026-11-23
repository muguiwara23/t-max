// Películas y series: lecturas del catálogo local, fichas del proveedor y avance del usuario.
import { XtreamClient, type SeriesDetail, type VodMovieDetail } from '@tmax/core';

import { fetchHttp } from '../platform/http';
import { getDb } from './db';
import { getSecrets, listSources, type Source } from './sources';
import { isCompleted, type VodItemRow, type VodKind } from './vod-mapping';

export const VOD_ALL = '__all';
export const VOD_FAV = '__fav';

export interface VodCategory {
  id: string;
  name: string;
  count: number;
}

export interface VodItem extends VodItemRow {
  favorite: boolean;
  position: number;
  duration: number;
  completed: boolean;
}

export interface UserVod {
  key: string;
  kind: 'movie' | 'episode' | 'series';
  position: number;
  duration: number;
  completed: boolean;
  favorite: boolean;
  updated: number;
  parent_key: string | null;
  title: string | null;
  subtitle: string | null;
  poster: string | null;
  extra: string | null;
}

type UserVodDb = Omit<UserVod, 'completed' | 'favorite'> & { completed: number; favorite: number };
const fromUser = (r: UserVodDb): UserVod => ({ ...r, completed: !!r.completed, favorite: !!r.favorite });

/** Fuentes activas que tienen películas o series de este tipo. */
export async function vodSources(kind: VodKind): Promise<Source[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ source_id: string }>('SELECT DISTINCT source_id FROM vod_items WHERE kind = ?', [kind]);
  const ids = new Set(rows.map((r) => r.source_id));
  return (await listSources()).filter((s) => s.enabled && ids.has(s.id));
}

const ITEM_SELECT = `SELECT v.*, COALESCE(u.favorite, 0) AS favorite, COALESCE(u.position, 0) AS position,
  COALESCE(u.duration, 0) AS duration, COALESCE(u.completed, 0) AS completed
  FROM vod_items v JOIN sources s ON s.id = v.source_id AND s.enabled = 1
  LEFT JOIN user_vod u ON u.key = v.key`;

type ItemDb = VodItemRow & { favorite: number; position: number; duration: number; completed: number };
const fromItem = (r: ItemDb): VodItem => ({ ...r, favorite: !!r.favorite, completed: !!r.completed });

export async function listVodCategories(kind: VodKind, sourceId: string | null): Promise<VodCategory[]> {
  const db = await getDb();
  const p: (string | number)[] = [kind];
  const rows = await db.getAllAsync<VodCategory>(
    `SELECT c.id, c.name, COUNT(v.key) AS count
       FROM vod_categories c JOIN sources s ON s.id = c.source_id AND s.enabled = 1
       LEFT JOIN vod_items v ON v.category_id = c.id
      WHERE c.kind = ?${sourceId ? ' AND c.source_id = ?' : ''}
      GROUP BY c.id HAVING count > 0 ORDER BY s.sort, c.sort`,
    sourceId ? [...p, sourceId] : p,
  );
  return rows;
}

export async function listVodItems(kind: VodKind, sourceId: string | null, categoryId: string, limit: number, offset: number): Promise<VodItem[]> {
  const db = await getDb();
  const where: string[] = ['v.kind = ?'];
  const p: (string | number)[] = [kind];
  if (sourceId) {
    where.push('v.source_id = ?');
    p.push(sourceId);
  }
  if (categoryId === VOD_FAV) where.push('u.favorite = 1');
  else if (categoryId !== VOD_ALL) {
    where.push('v.category_id = ?');
    p.push(categoryId);
  }
  const rows = await db.getAllAsync<ItemDb>(`${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.sort, v.sort LIMIT ? OFFSET ?`, [...p, limit, offset]);
  return rows.map(fromItem);
}

export async function searchVod(kind: VodKind, sourceId: string | null, q: string): Promise<VodItem[]> {
  const db = await getDb();
  const like = `%${q.trim().replace(/[%_\\]/g, '\\$&')}%`;
  const rows = await db.getAllAsync<ItemDb>(
    `${ITEM_SELECT} WHERE v.kind = ?${sourceId ? ' AND v.source_id = ?' : ''} AND v.title LIKE ? ESCAPE '\\' ORDER BY v.title LIMIT 300`,
    sourceId ? [kind, sourceId, like] : [kind, like],
  );
  return rows.map(fromItem);
}

export async function getVodItem(key: string): Promise<VodItem | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ItemDb>(`${ITEM_SELECT} WHERE v.key = ?`, [key]);
  return r ? fromItem(r) : null;
}

/**
 * "Continuar viendo": películas a medias y, de cada serie, el último episodio tocado
 * (terminado o no; la ficha de la serie decide si ofrece ese o el siguiente).
 */
export async function continueWatching(kind: VodKind, sourceId: string | null, max = 20): Promise<UserVod[]> {
  const db = await getDb();
  const prefix = sourceId ? `${sourceId.replace(/[%_\\]/g, '\\$&')}:%` : '%';
  const rows = await db.getAllAsync<UserVodDb>(
    `SELECT u.* FROM user_vod u
      WHERE u.kind = ? AND u.updated > 0 AND u.key LIKE ? ESCAPE '\\'
      ORDER BY u.updated DESC LIMIT 200`,
    [kind === 'movie' ? 'movie' : 'episode', prefix],
  );
  const enabled = new Set((await listSources()).filter((s) => s.enabled).map((s) => s.id));
  const out: UserVod[] = [];
  const seen = new Set<string>();
  for (const r of rows.map(fromUser)) {
    if (!enabled.has(r.key.split(':')[0]!)) continue;
    if (kind === 'movie') {
      if (r.completed || r.position < 30) continue;
    } else {
      const parent = r.parent_key ?? r.key;
      if (seen.has(parent)) continue;
      seen.add(parent);
    }
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

export async function userVodFor(keys: string[]): Promise<Map<string, UserVod>> {
  const out = new Map<string, UserVod>();
  if (keys.length === 0) return out;
  const db = await getDb();
  for (let i = 0; i < keys.length; i += 500) {
    const part = keys.slice(i, i + 500);
    const rows = await db.getAllAsync<UserVodDb>(`SELECT * FROM user_vod WHERE key IN (${part.map(() => '?').join(',')})`, part);
    for (const r of rows) out.set(r.key, fromUser(r));
  }
  return out;
}

export interface ProgressInput {
  key: string;
  kind: 'movie' | 'episode';
  position: number;
  duration: number;
  parentKey?: string | null;
  title: string;
  subtitle?: string | null;
  poster?: string | null;
  /** JSON con lo necesario para reanudar sin abrir la ficha (id, extensión, temporada…). */
  extra?: string | null;
  /** Forzar "visto" (p. ej. el reproductor llegó al final). */
  ended?: boolean;
}

export async function saveProgress(p: ProgressInput): Promise<void> {
  const db = await getDb();
  const completed = p.ended || isCompleted(p.position, p.duration) ? 1 : 0;
  await db.runAsync(
    `INSERT INTO user_vod (key, kind, position, duration, completed, favorite, updated, parent_key, title, subtitle, poster, extra)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET position = excluded.position, duration = excluded.duration, completed = excluded.completed,
       updated = excluded.updated, parent_key = excluded.parent_key, title = excluded.title, subtitle = excluded.subtitle,
       poster = COALESCE(excluded.poster, user_vod.poster), extra = COALESCE(excluded.extra, user_vod.extra)`,
    [p.key, p.kind, p.position, p.duration, completed, Date.now(), p.parentKey ?? null, p.title, p.subtitle ?? null, p.poster ?? null, p.extra ?? null],
  );
}

/** Marcar como visto / no visto a mano. */
export async function setWatched(key: string, kind: 'movie' | 'episode', watched: boolean, info: { title: string; parentKey?: string | null; subtitle?: string | null; poster?: string | null; extra?: string | null }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO user_vod (key, kind, position, duration, completed, favorite, updated, parent_key, title, subtitle, poster, extra)
     VALUES (?, ?, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET completed = excluded.completed, position = 0, updated = excluded.updated`,
    [key, kind, watched ? 1 : 0, watched ? Date.now() : 0, info.parentKey ?? null, info.title, info.subtitle ?? null, info.poster ?? null, info.extra ?? null],
  );
}

/** Quitar de "Continuar viendo" sin borrar favoritos. */
export async function forgetProgress(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await getDb();
  await db.runAsync(`UPDATE user_vod SET position = 0, updated = 0 WHERE key IN (${keys.map(() => '?').join(',')})`, keys);
}

export async function toggleVodFavorite(item: Pick<VodItemRow, 'key' | 'kind' | 'title' | 'poster'>, on: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO user_vod (key, kind, favorite, title, poster) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET favorite = excluded.favorite`,
    [item.key, item.kind, on ? 1 : 0, item.title, item.poster],
  );
}

// ---- Fichas y URLs: directo contra el servidor Xtream del usuario ----

async function clientFor(sourceId: string): Promise<XtreamClient> {
  const source = (await listSources()).find((s) => s.id === sourceId);
  if (!source || source.type !== 'xtream') throw new Error('La fuente de este título ya no existe.');
  const secrets = await getSecrets(source.id);
  return new XtreamClient(fetchHttp, { server: source.config.server ?? '', username: source.config.username ?? '', password: secrets.password ?? '' });
}

// Caché en memoria mientras la app está abierta: abrir la misma ficha dos veces no repite la petición.
const movieCache = new Map<string, VodMovieDetail>();
const seriesCache = new Map<string, { at: number; detail: SeriesDetail }>();

export async function movieDetail(item: Pick<VodItemRow, 'key' | 'source_id' | 'source_item_id'>): Promise<VodMovieDetail> {
  const hit = movieCache.get(item.key);
  if (hit) return hit;
  const d = await (await clientFor(item.source_id)).vodInfo(item.source_item_id);
  movieCache.set(item.key, d);
  return d;
}

export async function seriesDetail(item: Pick<VodItemRow, 'key' | 'source_id' | 'source_item_id'>): Promise<SeriesDetail> {
  const hit = seriesCache.get(item.key);
  if (hit && Date.now() - hit.at < 30 * 60000) return hit.detail;
  const d = await (await clientFor(item.source_id)).seriesInfo(item.source_item_id);
  seriesCache.set(item.key, { at: Date.now(), detail: d });
  return d;
}

export async function movieUrl(sourceId: string, id: string, ext: string | null): Promise<string> {
  return (await clientFor(sourceId)).movieUrl(id, ext);
}

export async function episodeUrl(sourceId: string, id: string, ext: string | null): Promise<string> {
  return (await clientFor(sourceId)).episodeUrl(id, ext);
}

// ---- Lo que el reproductor necesita para reproducir y guardar avance ----

export interface VodPlayItem {
  key: string;
  kind: 'movie' | 'episode';
  sourceId: string;
  streamId: string;
  ext: string | null;
  title: string;
  subtitle?: string | null;
  poster?: string | null;
  parentKey?: string | null;
  durationSec?: number | null;
}

export interface VodPlayRequest {
  queue: VodPlayItem[];
  index: number;
  /** Segundo desde el que empezar el primer elemento (null = desde el inicio). */
  startAt: number | null;
}

export function playUrl(it: VodPlayItem): Promise<string> {
  return it.kind === 'movie' ? movieUrl(it.sourceId, it.streamId, it.ext) : episodeUrl(it.sourceId, it.streamId, it.ext);
}

/** Quitar una serie entera de "Continuar viendo" (todos sus episodios). */
export async function forgetSeriesProgress(parentKey: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE user_vod SET updated = 0 WHERE parent_key = ?', [parentKey]);
}
