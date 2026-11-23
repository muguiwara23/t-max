// Cliente de portales Stalker/Ministra. Autenticación por MAC + handshake (token Bearer).
// Inicio de sesión, identidad MAG250 y codificación de cmd basados en IPTVnator (MIT, © 2019-2026 4gray):
// https://github.com/4gray/iptvnator — ver AVISOS-DE-TERCEROS.md.
// Las cabeceras siguen contracts/fixtures/stalker/expected_headers.json.
// Ver ADR-0006: en las web apps de TV algunas cabeceras pueden estar bloqueadas.
import { AppError } from './errors.ts';
import { sha1Hex, sha256Hex, utf8 } from './hash.ts';
import { httpError } from './errors.ts';
import { redact } from './redact.ts';
import type { HttpClient } from './http.ts';
import type { Category, LiveChannel } from './models.ts';
import { toInt, toStr } from './xtream.ts';

export interface StalkerConfig {
  portalUrl: string;
  mac: string;
  timezone?: string;
  lang?: string;
  /** Ruta completa del API si el portal no usa las habituales. */
  apiUrlOverride?: string;
  /**
   * Identidad del decodificador (opcional). Algunos portales atan la MAC a estos valores:
   * se copian del MAG real (o se generan una vez desde la MAC) y no deben cambiar después.
   */
  serialNumber?: string;
  deviceId1?: string;
  deviceId2?: string;
  signature?: string;
  signature2?: string;
  /** Usuario/contraseña del portal, solo si el portal los pide (get_profile status 2 → do_auth). */
  login?: string;
  password?: string;
  /** Aviso de eventos de sesión para el registro de diagnóstico de la app (sin datos sensibles). */
  onEvent?: (e: 'handshake' | 'renewed' | 'watchdog-fail' | 'link-retry' | 'do-auth') => void;
}

/**
 * Identidad coherente de un MAG250: User-Agent, firmware y modelo describen la misma caja.
 * Basado en IPTVnator (MIT, © 4gray) — ver AVISOS-DE-TERCEROS.md.
 */
export const MAG_USER_AGENT = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250';
export const MAG_X_USER_AGENT = MAG_USER_AGENT;
export const STB_PROFILE_PARAMS: Readonly<Record<string, string>> = Object.freeze({
  ver: 'ImageDescription: 0.2.18-r14-pub-250; ImageDate: Fri Jan 15 15:20:44 EET 2016; PORTAL version: 5.6.0; API Version: JS API version: 328; STB API version: 134; Player Engine version: 0x566',
  stb_type: 'MAG250',
  hw_version: '1.7-BD-00',
  image_version: '218',
  client_type: 'STB',
  num_banks: '2',
  video_out: 'hdmi',
  hd: '1',
});

/** Respuestas en texto plano con las que el portal rechaza la sesión. */
const AUTH_FAILURE_TEXT = /^(authorization\s+failed|access\s+denied|unauthorized\s+request)[.!]*(\s+\d+)?$/i;
const DEVICE_CONFLICT = [/device\s*conflict/i, /device[\s_-]?id[^.!?]{0,40}?(mismatch|conflict|does\s*not\s*match|not\s*match)/i];

/**
 * Codificación del parámetro cmd como la manda un MAG real: el portal decodifica una sola vez,
 * así que "%" no se vuelve a codificar y los caracteres seguros van tal cual;
 * & # ; espacio y no-ASCII sí se codifican (nadie puede colar parámetros extra).
 */
export function encodeStalkerCmd(value: string): string {
  let out = '';
  for (const ch of value) {
    if (/^[A-Za-z0-9\-_.~!*()/:?@$,+=[\]%]$/.test(ch)) out += ch;
    else for (const b of utf8(ch)) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

/** device_id / device_id2 derivados de la MAC (como StbEmu): para RELLENAR el formulario una vez, nunca en automático. */
export function deriveStalkerDeviceIds(mac: string): { deviceId1: string; deviceId2: string } | null {
  const m = mac.trim().toUpperCase();
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m)) return null;
  return { deviceId1: sha256Hex(m), deviceId2: sha256Hex(m + 'stalker') };
}

/** http://host/stalker_portal/c/ → http://host/stalker_portal/server/load.php ; http://host/c/ → http://host/portal.php */
export function resolveStalkerApi(portalUrl: string): string {
  let u = portalUrl.trim();
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  if (/\.php(\?|$)/i.test(u)) return u.replace(/\?.*$/, '');
  u = u.replace(/\/+$/, '').replace(/\/c$/i, '');
  if (/\/stalker_portal$/i.test(u)) return u + '/server/load.php';
  return u + '/portal.php';
}

export function stalkerHeaders(
  cfg: Pick<StalkerConfig, 'mac' | 'timezone' | 'lang' | 'serialNumber'>,
  token?: string,
): Record<string, string> {
  const sn = cfg.serialNumber?.trim();
  const cookie = [`mac=${cfg.mac.toUpperCase()}`, `stb_lang=${cfg.lang ?? 'en'}`, `timezone=${cfg.timezone ?? 'UTC'}`];
  if (sn) {
    const prefix = sn.toLowerCase().replace(/[^a-f0-9]/g, '');
    cookie.push(`__cfduid=${(prefix + 'e030245495acd6ebfc1').slice(0, 32).padEnd(32, '0')}`);
  }
  const h: Record<string, string> = {
    'User-Agent': MAG_USER_AGENT,
    'X-User-Agent': MAG_X_USER_AGENT,
    Cookie: cookie.join('; '),
    Accept: '*/*',
  };
  if (sn) h.SN = sn;
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

/** Lee la respuesta del portal: JSON, o texto plano de rechazo ("Authorization failed."). */
async function portalJson(http: HttpClient, req: { url: string; headers: Record<string, string>; timeoutMs: number }, secrets: readonly string[]): Promise<unknown> {
  const res = await http.get(req);
  const body = (await res.text()).trim();
  if (res.status === 401 || res.status === 403 || AUTH_FAILURE_TEXT.test(body)) {
    throw new AppError('AUTH_INVALID', body && body.length < 120 ? `El portal rechazó la sesión: ${body}` : redact(req.url, secrets), res.status);
  }
  if (res.status < 200 || res.status >= 300) throw httpError(res.status, redact(req.url, secrets));
  if (body === '') return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new AppError('PROVIDER_UNEXPECTED', 'La respuesta del portal no es JSON: ' + redact(req.url, secrets));
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');

export class StalkerClient {
  private readonly http: HttpClient;
  private readonly cfg: StalkerConfig;
  private readonly api: string;
  private token: string | null = null;
  private random = '';
  private pending: Promise<void> | null = null;
  private tokenAt = 0;
  /** Cada cuánto quiere el portal la señal de vida (get_profile → watchdog_timeout; 120 s por omisión). */
  watchdogSeconds = 120;
  /** Los tokens de portal caducan: se renuevan pasado este tiempo aunque el portal no avise. */
  static readonly TOKEN_TTL_MS = 20 * 60 * 1000;

  constructor(http: HttpClient, cfg: StalkerConfig) {
    this.http = http;
    this.cfg = cfg;
    this.api = cfg.apiUrlOverride ?? resolveStalkerApi(cfg.portalUrl);
  }

  private get secrets(): string[] {
    const c = this.cfg;
    return [c.mac, c.mac.toUpperCase(), this.token ?? '', c.serialNumber ?? '', c.deviceId1 ?? '', c.deviceId2 ?? '', c.signature ?? '', c.signature2 ?? '', c.password ?? ''].filter(Boolean);
  }

  /** cmd con la codificación de un MAG real; el resto, codificación completa. */
  private url(params: Record<string, string>): string {
    const q = Object.entries({ ...params, JsHttpRequest: '1-xml' })
      .map(([k, v]) => `${encodeURIComponent(k)}=${k === 'cmd' ? encodeStalkerCmd(v) : encodeURIComponent(v)}`)
      .join('&');
    return `${this.api}?${q}`;
  }

  private send(params: Record<string, string>, timeoutMs = 30000, token = this.token): Promise<unknown> {
    return portalJson(this.http, { url: this.url(params), headers: stalkerHeaders(this.cfg, token ?? undefined), timeoutMs }, this.secrets);
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
      return await this.send(params);
    } catch (e) {
      // Sesión rechazada: un handshake nuevo y un solo reintento.
      if (!retried && e instanceof AppError && e.code === 'AUTH_INVALID') {
        this.resetToken();
        this.cfg.onEvent?.('renewed');
        return this.call(params, true);
      }
      throw e;
    }
  }

  /** Olvida el token actual (p. ej. si otro proceso hizo handshake con la misma MAC). */
  resetToken(): void {
    this.token = null;
  }

  /** Un solo inicio de sesión a la vez: pedir dos tokens seguidos con la misma MAC invalida el primero. */
  private ensureToken(): Promise<void> {
    if (!this.pending) {
      this.pending = this.handshake().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /**
   * Inicio de sesión como un MAG real: handshake (con prehash) → get_profile con la identidad completa
   * → si el portal pide usuario (status 2): do_auth y get_profile otra vez.
   * Flujo basado en IPTVnator (MIT, © 4gray).
   */
  async handshake(): Promise<void> {
    const prehash = sha1Hex(this.cfg.mac.toUpperCase());
    const res = await this.send({ type: 'stb', action: 'handshake', token: '', prehash }, 15000, null);
    const j = obj(js(res));
    const token = toStr(j.token);
    if (!token) throw new AppError('AUTH_INVALID', 'El portal no entregó un token (¿MAC no registrada?).');
    this.token = token;
    this.tokenAt = Date.now();
    this.random = toStr(j.random) ?? Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    const notValid = num(j.not_valid) === 1;
    this.cfg.onEvent?.('handshake');

    let prof = await this.getProfile(false, notValid).catch((e: unknown) => {
      // Hay portales sin get_profile; el token puede servir igual. Un rechazo explícito sí es fatal.
      if (e instanceof AppError && e.code === 'AUTH_INVALID') throw e;
      return null;
    });
    if (prof && num(prof.status) === 2) {
      if (!this.cfg.login || !this.cfg.password) {
        throw new AppError('AUTH_INVALID', `El portal pide usuario y contraseña. ${clean(prof.msg) || clean(prof.block_msg)}`.trim());
      }
      this.cfg.onEvent?.('do-auth');
      const ok = obj(await this.send({ type: 'stb', action: 'do_auth', login: this.cfg.login, password: this.cfg.password, ...this.deviceParams() }, 15000)).js === true;
      if (!ok) throw new AppError('AUTH_INVALID', 'El portal rechazó el usuario o la contraseña.');
      prof = await this.getProfile(true, notValid);
      if (num(prof.status) === 2) throw new AppError('AUTH_INVALID', 'El portal rechazó el usuario o la contraseña.');
    }
    if (prof) {
      const text = [clean(prof.msg), clean(prof.block_msg)].filter(Boolean).join(' ');
      if (num(prof.status) === 1 || (text && num(prof.status) !== 0 && !prof.id)) {
        const conflict = DEVICE_CONFLICT.some((r) => r.test(text));
        throw new AppError(
          'AUTH_INVALID',
          conflict
            ? 'El portal dice que esta MAC ya está ligada a otro aparato (device_id distinto). Usa los mismos datos del decodificador original.'
            : `El portal bloqueó la sesión${text ? `: ${text}` : '.'}`,
        );
      }
      const wd = num(prof.watchdog_timeout);
      if (wd) this.watchdogSeconds = Math.min(3600, Math.max(30, wd));
    }
  }

  private deviceParams(): Record<string, string> {
    const c = this.cfg;
    const p: Record<string, string> = {};
    if (c.deviceId1?.trim()) p.device_id = c.deviceId1.trim();
    if (c.deviceId2?.trim()) p.device_id2 = c.deviceId2.trim();
    return p;
  }

  private async getProfile(secondStep: boolean, notValid: boolean): Promise<Json> {
    const c = this.cfg;
    const sn = c.serialNumber?.trim();
    const metrics: Record<string, string> = { mac: c.mac.toUpperCase(), model: 'MAG250', type: 'STB', random: this.random, ...(sn ? { sn } : {}) };
    const params: Record<string, string> = {
      type: 'stb',
      action: 'get_profile',
      ...STB_PROFILE_PARAMS,
      not_valid_token: notValid ? '1' : '0',
      auth_second_step: secondStep ? '1' : '0',
      metrics: JSON.stringify(metrics),
      ...(sn ? { sn } : {}),
      ...this.deviceParams(),
      ...(c.signature?.trim() ? { signature: c.signature.trim() } : {}),
      ...(c.signature2?.trim() ? { signature2: c.signature2.trim() } : {}),
      prehash: sha1Hex(c.mac.toUpperCase()),
    };
    return obj(js(await this.send(params, 15000)));
  }

  /**
   * Señal de vida, como la que mandan los decodificadores MAG (cada watchdogSeconds).
   * Sin ella, muchos portales dan la sesión por muerta. Un fallo aquí no invalida la sesión.
   */
  async watchdog(playing: boolean): Promise<void> {
    if (!this.token) return;
    try {
      await this.send({ type: 'watchdog', action: 'get_events', event_active_id: '0', init: '0', cur_play_type: playing ? '1' : '0' }, 15000);
    } catch (e) {
      this.cfg.onEvent?.('watchdog-fail');
      if (e instanceof AppError && e.code === 'AUTH_INVALID') this.resetToken();
    }
  }

  async profile(): Promise<Json> {
    if (this.tokenExpired()) await this.ensureToken();
    return this.getProfile(false, false);
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
      this.cfg.onEvent?.('link-retry');
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
