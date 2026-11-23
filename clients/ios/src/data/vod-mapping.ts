// Películas y series: conversión pura a filas locales y reglas de avance.
// Sin dependencias de React Native: se prueba en Node (test/vod.test.ts).
import type { Category, Episode, SeriesSummary, VodMovie } from '@tmax/core';

export type VodKind = 'movie' | 'series';

export interface VodCategoryRow {
  id: string;
  source_id: string;
  kind: VodKind;
  source_category_id: string;
  name: string;
  sort: number;
}

export interface VodItemRow {
  /** `<fuente>:<m|s>:<id del proveedor>`; también es la clave de avance y favoritos. */
  key: string;
  source_id: string;
  kind: VodKind;
  source_item_id: string;
  category_id: string | null;
  title: string;
  poster: string | null;
  rating: string | null;
  year: number | null;
  ext: string | null;
  sort: number;
}

export const movieKey = (sourceId: string, id: string) => `${sourceId}:m:${id}`;
export const seriesKey = (sourceId: string, id: string) => `${sourceId}:s:${id}`;
export const episodeKey = (sourceId: string, id: string) => `${sourceId}:e:${id}`;

function cats(sourceId: string, kind: VodKind, list: Category[]): VodCategoryRow[] {
  const p = kind === 'movie' ? 'm' : 's';
  return list.map((c, i) => ({ id: `${sourceId}:${p}c:${c.id}`, source_id: sourceId, kind, source_category_id: c.id, name: c.name, sort: i }));
}

export function mapVod(
  sourceId: string,
  movieCats: Category[],
  movies: VodMovie[],
  seriesCats: Category[],
  series: SeriesSummary[],
): { categories: VodCategoryRow[]; items: VodItemRow[] } {
  const categories = [...cats(sourceId, 'movie', movieCats), ...cats(sourceId, 'series', seriesCats)];
  const items: VodItemRow[] = [];
  const seen = new Set<string>();
  movies.forEach((m, i) => {
    const key = movieKey(sourceId, m.sourceItemId);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      key, source_id: sourceId, kind: 'movie', source_item_id: m.sourceItemId,
      category_id: m.categoryId ? `${sourceId}:mc:${m.categoryId}` : null,
      title: m.title, poster: m.poster, rating: cleanRating(m.rating), year: m.year, ext: m.containerExtension, sort: i,
    });
  });
  series.forEach((s, i) => {
    const key = seriesKey(sourceId, s.sourceItemId);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      key, source_id: sourceId, kind: 'series', source_item_id: s.sourceItemId,
      category_id: s.categoryId ? `${sourceId}:sc:${s.categoryId}` : null,
      title: s.title, poster: s.poster, rating: cleanRating(s.rating), year: s.year, ext: null, sort: i,
    });
  });
  return { categories, items };
}

/** "0", "", "N/A" no son calificaciones. */
export function cleanRating(r: string | null): string | null {
  if (!r) return null;
  const n = Number.parseFloat(r.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return (Math.round(n * 10) / 10).toString();
}

/** Visto si pasó el 95 % o quedan menos de 2 minutos de algo largo. */
export function isCompleted(position: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  return position / duration >= 0.95 || (duration > 600 && duration - position < 120);
}

/** Posición desde la que conviene continuar (null = empezar desde el inicio). */
export function resumeFrom(position: number | null | undefined, duration: number | null | undefined): number | null {
  if (!position || position < 30) return null;
  if (duration && isCompleted(position, duration)) return null;
  return Math.max(0, position - 5);
}

/** 1:05:09 / 4:07 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "1 h 52 min" / "48 min" */
export function humanDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const episodeLabel = (e: Pick<Episode, 'season' | 'episode'>) => `T${e.season} · E${e.episode}`;

/** Episodios en orden de reproducción (temporada, episodio). */
export function orderEpisodes<T extends Pick<Episode, 'season' | 'episode'>>(eps: T[]): T[] {
  return [...eps].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

export interface EpisodeProgress {
  position: number;
  duration: number;
  completed: boolean;
  updated: number;
}

/**
 * Qué episodio ofrecer en "Continuar": el último que se vio si quedó a medias;
 * si se terminó, el siguiente; si no hay avance, el primero.
 */
export function continueEpisode<T extends Pick<Episode, 'season' | 'episode' | 'sourceItemId'>>(
  eps: T[],
  progress: (e: T) => EpisodeProgress | undefined,
): { episode: T; resume: boolean } | null {
  const ordered = orderEpisodes(eps);
  if (ordered.length === 0) return null;
  let last: { i: number; p: EpisodeProgress } | null = null;
  ordered.forEach((e, i) => {
    const p = progress(e);
    if (p && (!last || p.updated > last.p.updated)) last = { i, p };
  });
  if (!last) return { episode: ordered[0]!, resume: false };
  const { i, p } = last as { i: number; p: EpisodeProgress };
  if (!p.completed && resumeFrom(p.position, p.duration) !== null) return { episode: ordered[i]!, resume: true };
  const next = ordered[i + 1];
  return next ? { episode: next, resume: false } : { episode: ordered[i]!, resume: false };
}
