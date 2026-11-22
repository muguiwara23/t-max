// Cliente Xtream Codes (player_api.php). Las respuestas varían entre servidores:
// todo se lee de forma tolerante (números como texto, campos ausentes, null).
import { AppError } from './errors.ts';
import { getJson, type HttpClient } from './http.ts';
import type {
  AccountInfo,
  Category,
  Episode,
  FormatPreference,
  LiveChannel,
  OutputFormat,
  SeriesDetail,
  SeriesSummary,
  VodMovie,
  VodMovieDetail,
} from './models.ts';

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

// ---------- utilidades tolerantes ----------
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
export function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function list(v: unknown): string[] {
  const s = toStr(v);
  return s ? s.split(/\s*[,/]\s*/).filter(Boolean) : [];
}
function yearOf(v: unknown): number | null {
  const s = toStr(v);
  const m = s ? /(19|20)\d{2}/.exec(s) : null;
  return m ? Number(m[0]) : null;
}
function firstImage(v: unknown): string | null {
  if (Array.isArray(v)) return toStr(v[0]);
  return toStr(v);
}

export function normalizeServer(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '').replace(/\/(player_api|get|xmltv)\.php.*$/i, '');
  return s;
}

// ---------- parsers (puros, probados con contracts/fixtures/xtream) ----------
export function parseAccount(json: unknown): AccountInfo {
  const root = obj(json);
  const ui = obj(root.user_info);
  if (toInt(ui.auth) !== 1) throw new AppError('AUTH_INVALID', 'El servidor rechazó el usuario o la contraseña.');
  const status = String(ui.status ?? '');
  if (/expired/i.test(status)) throw new AppError('AUTH_EXPIRED', 'La cuenta está vencida.');
  const exp = toInt(ui.exp_date);
  return {
    status,
    allowedFormats: arr(ui.allowed_output_formats).map(String),
    maxConnections: toInt(ui.max_connections),
    activeConnections: toInt(ui.active_cons),
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    serverTimezone: toStr(obj(root.server_info).timezone),
  };
}

export function parseCategories(json: unknown): Category[] {
  return arr(json)
    .map((c) => ({ id: toStr(obj(c).category_id) ?? '', name: toStr(obj(c).category_name) ?? '' }))
    .filter((c) => c.id !== '');
}

export function parseLiveStreams(json: unknown): LiveChannel[] {
  const out: LiveChannel[] = [];
  for (const raw of arr(json)) {
    const s = obj(raw);
    const id = toStr(s.stream_id);
    if (!id) continue;
    out.push({
      sourceChannelId: id,
      name: toStr(s.name) ?? `Canal ${id}`,
      number: toInt(s.num),
      logo: toStr(s.stream_icon),
      categoryId: toStr(s.category_id),
      epgChannelId: toStr(s.epg_channel_id),
      catchupDays: toInt(s.tv_archive) === 1 ? (toInt(s.tv_archive_duration) ?? 0) : 0,
    });
  }
  return out;
}

export function parseVodStreams(json: unknown): VodMovie[] {
  const out: VodMovie[] = [];
  for (const raw of arr(json)) {
    const s = obj(raw);
    const id = toStr(s.stream_id);
    if (!id) continue;
    out.push({
      sourceItemId: id,
      title: toStr(s.name) ?? `Película ${id}`,
      poster: toStr(s.stream_icon),
      categoryId: toStr(s.category_id),
      rating: toStr(s.rating),
      year: yearOf(s.year ?? s.releasedate ?? s.name),
      containerExtension: toStr(s.container_extension),
      tmdbId: toStr(s.tmdb ?? s.tmdb_id),
    });
  }
  return out;
}

export function parseVodInfo(json: unknown, id: string): VodMovieDetail {
  const root = obj(json);
  const info = obj(root.info);
  const data = obj(root.movie_data);
  const secs = toInt(info.duration_secs);
  return {
    sourceItemId: toStr(data.stream_id) ?? id,
    title: toStr(data.name) ?? toStr(info.name) ?? toStr(info.o_name) ?? `Película ${id}`,
    poster: toStr(info.cover_big) ?? toStr(info.movie_image),
    categoryId: toStr(data.category_id),
    rating: toStr(info.rating),
    year: yearOf(info.releasedate ?? info.release_date),
    containerExtension: toStr(data.container_extension),
    tmdbId: toStr(info.tmdb_id),
    synopsis: toStr(info.plot) ?? toStr(info.description),
    durationSec: secs,
    genres: list(info.genre),
    cast: list(info.cast ?? info.actors),
    director: toStr(info.director),
    backdrop: firstImage(info.backdrop_path),
  };
}

export function parseSeries(json: unknown): SeriesSummary[] {
  const out: SeriesSummary[] = [];
  for (const raw of arr(json)) {
    const s = obj(raw);
    const id = toStr(s.series_id);
    if (!id) continue;
    out.push({
      sourceItemId: id,
      title: toStr(s.name) ?? `Serie ${id}`,
      poster: toStr(s.cover),
      categoryId: toStr(s.category_id),
      synopsis: toStr(s.plot),
      genres: list(s.genre),
      rating: toStr(s.rating),
      year: yearOf(s.releaseDate ?? s.release_date),
      tmdbId: toStr(s.tmdb ?? s.tmdb_id),
    });
  }
  return out;
}

export function parseSeriesInfo(json: unknown, id: string): SeriesDetail {
  const root = obj(json);
  const info = obj(root.info);
  const episodes: Episode[] = [];
  const eps = obj(root.episodes);
  for (const [seasonKey, items] of Object.entries(eps)) {
    for (const raw of arr(items)) {
      const e = obj(raw);
      const eid = toStr(e.id);
      if (!eid) continue;
      const einfo = obj(e.info);
      episodes.push({
        sourceItemId: eid,
        season: toInt(e.season) ?? toInt(seasonKey) ?? 0,
        episode: toInt(e.episode_num) ?? 0,
        title: toStr(e.title) ?? `Episodio ${toInt(e.episode_num) ?? ''}`.trim(),
        durationSec: toInt(einfo.duration_secs),
        containerExtension: toStr(e.container_extension),
        synopsis: toStr(einfo.plot),
      });
    }
  }
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  const seasonsFromApi = arr(root.seasons).map((r) => {
    const s = obj(r);
    const n = toInt(s.season_number) ?? 0;
    return { number: n, name: toStr(s.name) ?? `Temporada ${n}`, episodeCount: toInt(s.episode_count) ?? 0 };
  });
  const seasonNums = [...new Set(episodes.map((e) => e.season))];
  const seasons = seasonNums.map((n) => {
    const api = seasonsFromApi.find((s) => s.number === n);
    return { number: n, name: api?.name ?? `Temporada ${n}`, episodeCount: episodes.filter((e) => e.season === n).length };
  });
  return {
    summary: {
      sourceItemId: id,
      title: toStr(info.name) ?? `Serie ${id}`,
      poster: toStr(info.cover),
      categoryId: toStr(info.category_id),
      synopsis: toStr(info.plot),
      genres: list(info.genre),
      rating: toStr(info.rating),
      year: yearOf(info.releaseDate ?? info.release_date),
      tmdbId: toStr(info.tmdb ?? info.tmdb_id),
    },
    seasons,
    episodes,
  };
}

// ---------- elección de formato ----------
export interface PlayerContainerSupport {
  ts: boolean;
  hls: boolean;
}

/**
 * TS directo si el reproductor lo soporta y el servidor lo permite (menor latencia);
 * si no, HLS (.m3u8). Lista vacía de formatos permitidos = el servidor no informa.
 */
export function chooseFormat(
  pref: FormatPreference,
  account: Pick<AccountInfo, 'allowedFormats'> | null,
  player: PlayerContainerSupport = { ts: true, hls: true },
): OutputFormat | null {
  const allowed = account?.allowedFormats ?? [];
  const serverHas = (f: OutputFormat) => allowed.length === 0 || allowed.includes(f);
  const playerHas = (f: OutputFormat) => (f === 'ts' ? player.ts : player.hls);
  if (pref !== 'auto') return playerHas(pref) ? pref : null;
  if (playerHas('ts') && serverHas('ts')) return 'ts';
  if (playerHas('m3u8') && serverHas('m3u8')) return 'm3u8';
  return null;
}

// ---------- cliente ----------
export class XtreamClient {
  private readonly http: HttpClient;
  private readonly c: XtreamCredentials;
  private readonly base: string;

  constructor(http: HttpClient, creds: XtreamCredentials) {
    this.http = http;
    this.c = creds;
    this.base = normalizeServer(creds.server);
  }

  private get secrets(): string[] {
    return [this.c.password, this.c.username];
  }

  private api(action?: string, extra: Record<string, string> = {}): string {
    const q = new URLSearchParamsLite({ username: this.c.username, password: this.c.password });
    if (action) q.set('action', action);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `${this.base}/player_api.php?${q.toString()}`;
  }

  private call(action?: string, extra?: Record<string, string>, timeoutMs = 30000): Promise<unknown> {
    return getJson(this.http, { url: this.api(action, extra), timeoutMs }, this.secrets);
  }

  async login(): Promise<AccountInfo> {
    return parseAccount(await this.call(undefined, undefined, 15000));
  }
  async liveCategories(): Promise<Category[]> {
    return parseCategories(await this.call('get_live_categories'));
  }
  async liveStreams(categoryId?: string): Promise<LiveChannel[]> {
    return parseLiveStreams(await this.call('get_live_streams', categoryId ? { category_id: categoryId } : {}, 90000));
  }
  async vodCategories(): Promise<Category[]> {
    return parseCategories(await this.call('get_vod_categories'));
  }
  async vodStreams(categoryId?: string): Promise<VodMovie[]> {
    return parseVodStreams(await this.call('get_vod_streams', categoryId ? { category_id: categoryId } : {}, 90000));
  }
  async vodInfo(id: string): Promise<VodMovieDetail> {
    return parseVodInfo(await this.call('get_vod_info', { vod_id: id }), id);
  }
  async seriesCategories(): Promise<Category[]> {
    return parseCategories(await this.call('get_series_categories'));
  }
  async series(categoryId?: string): Promise<SeriesSummary[]> {
    return parseSeries(await this.call('get_series', categoryId ? { category_id: categoryId } : {}, 90000));
  }
  async seriesInfo(id: string): Promise<SeriesDetail> {
    return parseSeriesInfo(await this.call('get_series_info', { series_id: id }), id);
  }

  /** Guía XMLTV completa del proveedor (se descarga y se pasa a XmltvParser). */
  xmltvUrl(): string {
    const q = new URLSearchParamsLite({ username: this.c.username, password: this.c.password });
    return `${this.base}/xmltv.php?${q.toString()}`;
  }

  liveUrl(streamId: string, format: OutputFormat): string {
    return `${this.base}/live/${enc(this.c.username)}/${enc(this.c.password)}/${enc(streamId)}.${format}`;
  }
  movieUrl(id: string, ext: string | null): string {
    return `${this.base}/movie/${enc(this.c.username)}/${enc(this.c.password)}/${enc(id)}.${ext || 'mp4'}`;
  }
  episodeUrl(id: string, ext: string | null): string {
    return `${this.base}/series/${enc(this.c.username)}/${enc(this.c.password)}/${enc(id)}.${ext || 'mp4'}`;
  }
  /** Catch-up: hora de inicio en la zona del servidor (serverTimezone) o UTC si no se conoce. */
  timeshiftUrl(streamId: string, startLocal: { y: number; mo: number; d: number; h: number; mi: number }, durationMin: number, format: OutputFormat = 'ts'): string {
    const p = (n: number) => String(n).padStart(2, '0');
    const t = `${startLocal.y}-${p(startLocal.mo)}-${p(startLocal.d)}:${p(startLocal.h)}-${p(startLocal.mi)}`;
    return `${this.base}/timeshift/${enc(this.c.username)}/${enc(this.c.password)}/${durationMin}/${t}/${enc(streamId)}.${format}`;
  }
}

const enc = encodeURIComponent;

/** URLSearchParams mínimo (Hermes y algunos motores de TV no lo traen completo). */
class URLSearchParamsLite {
  private readonly entries: [string, string][] = [];
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.entries.push([k, v]);
  }
  set(k: string, v: string): void {
    const i = this.entries.findIndex((e) => e[0] === k);
    if (i >= 0) this.entries[i] = [k, v];
    else this.entries.push([k, v]);
  }
  toString(): string {
    return this.entries.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  }
}
