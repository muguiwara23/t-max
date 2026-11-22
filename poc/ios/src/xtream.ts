// Cliente Xtream mínimo para la prueba de viabilidad.
// La versión definitiva vivirá en packages/core con pruebas contra contracts/fixtures.

export type OutputFormat = 'ts' | 'm3u8';
export type FormatPreference = 'auto' | OutputFormat;

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

export interface XtreamAccount {
  status: string;
  allowedFormats: string[];
  maxConnections: number | null;
  activeConnections: number | null;
  expiresAt: Date | null;
  serverTimezone: string | null;
}

export interface LiveCategory {
  id: string;
  name: string;
}

export interface LiveChannel {
  streamId: string;
  name: string;
  number: number | null;
  logo: string | null;
  categoryId: string | null;
  epgChannelId: string | null;
  hasArchive: boolean;
}

export type XtreamErrorCode = 'NET_TIMEOUT' | 'NET_ERROR' | 'HTTP' | 'AUTH_INVALID' | 'PROVIDER_UNEXPECTED';

export class XtreamError extends Error {
  code: XtreamErrorCode;
  httpStatus?: number;
  constructor(code: XtreamErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function normalizeServer(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '');
  s = s.replace(/\/player_api\.php$/i, '');
  return s;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

async function getJson(url: string, timeoutMs = 20000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new XtreamError('NET_TIMEOUT', 'El servidor no respondió a tiempo.');
    throw new XtreamError('NET_ERROR', 'No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new XtreamError('AUTH_INVALID', 'Usuario o contraseña incorrectos.', res.status);
  }
  if (!res.ok) throw new XtreamError('HTTP', `El servidor respondió con error ${res.status}.`, res.status);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new XtreamError('PROVIDER_UNEXPECTED', 'La respuesta del servidor no es JSON válido.');
  }
}

function apiUrl(c: XtreamCredentials, action?: string): string {
  const base = `${normalizeServer(c.server)}/player_api.php?username=${encodeURIComponent(
    c.username,
  )}&password=${encodeURIComponent(c.password)}`;
  return action ? `${base}&action=${action}` : base;
}

export function parseAccount(json: any): XtreamAccount {
  const ui = json?.user_info;
  if (!ui || toInt(ui.auth) !== 1) {
    throw new XtreamError('AUTH_INVALID', 'Usuario o contraseña incorrectos.');
  }
  const exp = toInt(ui.exp_date);
  return {
    status: String(ui.status ?? ''),
    allowedFormats: Array.isArray(ui.allowed_output_formats) ? ui.allowed_output_formats.map(String) : [],
    maxConnections: toInt(ui.max_connections),
    activeConnections: toInt(ui.active_cons),
    expiresAt: exp ? new Date(exp * 1000) : null,
    serverTimezone: toStr(json?.server_info?.timezone),
  };
}

export function parseCategories(json: unknown): LiveCategory[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((c: any) => ({ id: toStr(c?.category_id) ?? '', name: toStr(c?.category_name) ?? '(sin nombre)' }))
    .filter((c) => c.id !== '');
}

export function parseLiveStreams(json: unknown): LiveChannel[] {
  if (!Array.isArray(json)) return [];
  const out: LiveChannel[] = [];
  for (const s of json as any[]) {
    const id = toStr(s?.stream_id);
    if (!id) continue;
    out.push({
      streamId: id,
      name: toStr(s?.name) ?? `Canal ${id}`,
      number: toInt(s?.num),
      logo: toStr(s?.stream_icon),
      categoryId: toStr(s?.category_id),
      epgChannelId: toStr(s?.epg_channel_id),
      hasArchive: toInt(s?.tv_archive) === 1,
    });
  }
  return out;
}

export async function login(c: XtreamCredentials): Promise<XtreamAccount> {
  return parseAccount(await getJson(apiUrl(c)));
}

export async function getLiveCategories(c: XtreamCredentials): Promise<LiveCategory[]> {
  return parseCategories(await getJson(apiUrl(c, 'get_live_categories')));
}

export async function getLiveStreams(c: XtreamCredentials): Promise<LiveChannel[]> {
  return parseLiveStreams(await getJson(apiUrl(c, 'get_live_streams'), 60000));
}

/** Elige el formato: con libmpv, TS directo es preferible si el servidor lo permite. */
export function chooseFormat(pref: FormatPreference, account: XtreamAccount | null): OutputFormat {
  if (pref !== 'auto') return pref;
  const allowed = account?.allowedFormats ?? [];
  if (allowed.length === 0 || allowed.includes('ts')) return 'ts';
  if (allowed.includes('m3u8')) return 'm3u8';
  return 'ts';
}

export function liveUrl(c: XtreamCredentials, streamId: string, format: OutputFormat): string {
  return `${normalizeServer(c.server)}/live/${encodeURIComponent(c.username)}/${encodeURIComponent(
    c.password,
  )}/${encodeURIComponent(streamId)}.${format}`;
}
