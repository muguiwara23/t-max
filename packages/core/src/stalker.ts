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
  private pending: Promise<void> | null = null;
  private tokenAt = 0;
  /** Los tokens de portal caducan: se renuevan pasado este tiempo aunque el portal no avise. */
  static readonly TOKEN_TTL_MS = 20 * 60 * 1000;

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

  private tokenExpired(): boolean {
    return !this.token || Date.now() - this.tokenAt > StalkerClient.TOKEN_TTL_MS;
  }

  private async call(params: Record<string, string>, retried = false): Promise<unknown> {
    if (this.tokenExpired()) {
      this.token = null;
      await this.ensureToken();
    }
    try {
      return await getJson(this.http, { url: this.url(params), headers: stalkerHeaders(this.cfg, this.token ?? undefined), timeoutMs: 30000 }, this.secrets);
    } catch (e) {
      // Sesión rechazada (401/403): un handshake nuevo y un solo reintento.
      if (!retried && e instanceof AppError && e.code === 'AUTH_INVALID') {
        this.resetToken();
        return this.call(params, true);
      }
      throw e;
    }
  }

  /** Olvida el token actual (p. ej. si otro proceso hizo handshake con la misma MAC). */
  resetToken(): void {
    this.token = null;
  }

  /** Un solo handshake a la vez: pedir dos tokens seguidos con la misma MAC invalida el primero. */
  private ensureToken(): Promise<void> {
    if (!this.pending) {
      this.pending = this.handshake().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** Handshake + get_profile: muchos portales no activan el token hasta pedir el perfil. */
  async handshake(): Promise<void> {
    await this.rawHandshake();
    try {
      await getJson(
        this.http,
        { url: this.url({ type: 'stb', action: 'get_profile', hd: '1', stb_type: 'MAG250', num_banks: '2', ver: 'ImageDescription: 0.2.18-r23-250; PORTAL version: 5.6.1' }), headers: stalkerHeaders(this.cfg, this.token ?? undefined), timeoutMs: 15000 },
        this.secrets,
      );
    } catch {
      // Hay portales que no exponen get_profile; el token puede servir igual.
    }
  }

  private async rawHandshake(): Promise<void> {
    const res = await getJson(
      this.http,
      { url: this.url({ type: 'stb', action: 'handshake', token: '' }), headers: stalkerHeaders(this.cfg), timeoutMs: 15000 },
      this.secrets,
    );
    const token = toStr(obj(js(res)).token);
    if (!token) throw new AppError('AUTH_INVALID', 'El portal no entregó un token (¿MAC no registrada?).');
    this.token = token;
    this.tokenAt = Date.now();
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

  /**
   * Resuelve la URL real (suele caducar: pedirla justo antes de reproducir).
   * Si el token ya no sirve (otro handshake con la misma MAC, sesión vencida), se renueva y se reintenta una vez.
   */
  async createLink(cmd: string, opts: { forceNewToken?: boolean } = {}): Promise<{ url: string; headers: Record<string, string> }> {
    if (opts.forceNewToken) this.resetToken();
    const attempt = async (): Promise<string | null> => {
      const res = await this.call({ type: 'itv', action: 'create_link', cmd, series: '', forced_storage: 'undefined', disable_ad: '0', download: '0' });
      const out = toStr(obj(js(res)).cmd);
      const url = out ? stripCmd(out) : null;
      // Algunos portales devuelven el cmd sin resolver (localhost) cuando el token no es válido.
      return url && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(url) ? url : null;
    };
    let url: string | null = null;
    try {
      url = await attempt();
    } catch (e) {
      if (!(e instanceof AppError) || (e.code !== 'AUTH_INVALID' && e.code !== 'HTTP_4XX')) throw e;
    }
    if (!url) {
      this.resetToken();
      url = await attempt();
    }
    if (!url) throw new AppError('PROVIDER_UNEXPECTED', 'El portal no devolvió la URL del canal.');
    return { url, headers: this.playbackHeaders() };
  }

  /** Cabeceras para el servidor de video (algunos comprueban User-Agent y cookie de MAC). */
  playbackHeaders(): Record<string, string> {
    const h = stalkerHeaders(this.cfg);
    return { 'User-Agent': h['User-Agent']!, Cookie: h.Cookie! };
  }
}
