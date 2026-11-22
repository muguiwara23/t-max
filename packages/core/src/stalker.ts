// Cliente de portales Stalker/Ministra. Autenticación por MAC + handshake (token Bearer).
// Las cabeceras siguen contracts/fixtures/stalker/expected_headers.json.
// Ver ADR-0006: en las web apps de TV algunas cabeceras pueden estar bloqueadas.
import { AppError } from './errors.ts';
import { getJson, type HttpClient } from './http.ts';
import type { Category, LiveChannel } from './models.ts';
import { toInt, toStr } from './xtream.ts';

export interface StalkerConfig {
  portalUrl: string;
  mac: string;
  timezone?: string;
  lang?: string;
  /** Ruta completa del API si el portal no usa las habituales. */
  apiUrlOverride?: string;
}

export const MAG_USER_AGENT =
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
export const MAG_X_USER_AGENT = 'Model: MAG250; Link: WiFi';

/** http://host/stalker_portal/c/ → http://host/stalker_portal/server/load.php ; http://host/c/ → http://host/portal.php */
export function resolveStalkerApi(portalUrl: string): string {
  let u = portalUrl.trim();
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  if (/\.php(\?|$)/i.test(u)) return u.replace(/\?.*$/, '');
  u = u.replace(/\/+$/, '').replace(/\/c$/i, '');
  if (/\/stalker_portal$/i.test(u)) return u + '/server/load.php';
  return u + '/portal.php';
}

export function stalkerHeaders(cfg: Pick<StalkerConfig, 'mac' | 'timezone' | 'lang'>, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': MAG_USER_AGENT,
    'X-User-Agent': MAG_X_USER_AGENT,
    Cookie: `mac=${encodeURIComponent(cfg.mac.toUpperCase())}; stb_lang=${cfg.lang ?? 'es'}; timezone=${encodeURIComponent(cfg.timezone ?? 'UTC')}`,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** "ffmpeg http://…" → "http://…" */
export function stripCmd(cmd: string): string {
  return cmd.replace(/^\s*(ffmpeg|ffrt\d?|auto)\s+/i, '').trim();
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const js = (v: unknown): unknown => obj(v).js;

export function parseStalkerGenres(json: unknown): Category[] {
  const list = js(json);
  return (Array.isArray(list) ? list : [])
    .map((g) => ({ id: toStr(obj(g).id) ?? '', name: toStr(obj(g).title) ?? '' }))
    .filter((g) => g.id !== '' && g.id !== '*');
}

export function parseStalkerChannels(json: unknown): LiveChannel[] {
  const data = obj(js(json)).data;
  const out: LiveChannel[] = [];
  for (const raw of Array.isArray(data) ? data : []) {
    const c = obj(raw);
    const id = toStr(c.id);
    if (!id) continue;
    const archive = toInt(c.tv_archive) === 1;
    const hours = toInt(c.tv_archive_duration) ?? 0;
    out.push({
      sourceChannelId: id,
      name: toStr(c.name) ?? `Canal ${id}`,
      number: toInt(c.number),
      logo: toStr(c.logo),
      categoryId: toStr(c.tv_genre_id),
      epgChannelId: toStr(c.xmltv_id),
      catchupDays: archive ? Math.ceil(hours / 24) : 0,
      stalkerCmd: toStr(c.cmd) ?? undefined,
    });
  }
  return out;
}

export class StalkerClient {
  private readonly http: HttpClient;
  private readonly cfg: StalkerConfig;
  private readonly api: string;
  private token: string | null = null;

  constructor(http: HttpClient, cfg: StalkerConfig) {
    this.http = http;
    this.cfg = cfg;
    this.api = cfg.apiUrlOverride ?? resolveStalkerApi(cfg.portalUrl);
  }

  private get secrets(): string[] {
    return [this.cfg.mac, this.cfg.mac.toUpperCase(), this.token ?? ''];
  }

  private url(params: Record<string, string>): string {
    const q = Object.entries({ ...params, JsHttpRequest: '1-xml' })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${this.api}?${q}`;
  }

  private async call(params: Record<string, string>): Promise<unknown> {
    if (!this.token && params.action !== 'handshake') await this.handshake();
    return getJson(this.http, { url: this.url(params), headers: stalkerHeaders(this.cfg, this.token ?? undefined), timeoutMs: 30000 }, this.secrets);
  }

  async handshake(): Promise<void> {
    const res = await getJson(
      this.http,
      { url: this.url({ type: 'stb', action: 'handshake', token: '' }), headers: stalkerHeaders(this.cfg), timeoutMs: 15000 },
      this.secrets,
    );
    const token = toStr(obj(js(res)).token);
    if (!token) throw new AppError('AUTH_INVALID', 'El portal no entregó un token (¿MAC no registrada?).');
    this.token = token;
  }

  async profile(): Promise<Json> {
    return obj(js(await this.call({ type: 'stb', action: 'get_profile', hd: '1', stb_type: 'MAG250' })));
  }

  async genres(): Promise<Category[]> {
    return parseStalkerGenres(await this.call({ type: 'itv', action: 'get_genres' }));
  }

  async channels(): Promise<LiveChannel[]> {
    return parseStalkerChannels(await this.call({ type: 'itv', action: 'get_all_channels' }));
  }

  /** Resuelve la URL real (suele caducar: pedirla justo antes de reproducir). */
  async createLink(cmd: string): Promise<{ url: string; headers: Record<string, string> }> {
    const res = await this.call({ type: 'itv', action: 'create_link', cmd, forced_storage: 'undefined', disable_ad: '0' });
    const out = toStr(obj(js(res)).cmd);
    if (!out) throw new AppError('PROVIDER_UNEXPECTED', 'El portal no devolvió la URL del canal.');
    return { url: stripCmd(out), headers: { 'User-Agent': MAG_USER_AGENT } };
  }
}
