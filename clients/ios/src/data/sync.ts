// Actualiza una fuente: descarga grupos, canales y guía directo desde el servidor del usuario
// y los guarda en SQLite. Ningún dato pasa por servidores de T-Max (no existen).
import {
  AppError,
  M3uParser,
  XmltvParser,
  XtreamClient,
  redact,
  type EpgChannel,
  type HttpClient,
  type Programme,
} from '@tmax/core';

import { fetchHttp } from '../platform/http';
import { replaceSourceContent, replaceVodContent } from './db';
import { logEvent } from './diag';
import { mapM3u, mapProgrammes, mapProviderLive, resolveEpgIds, type ChannelRow } from './mapping';
import { getSecrets, recordRefresh, sourceSettings, type Source } from './sources';
import { mapVod } from './vod-mapping';
import { stalkerFor } from './stalker-session';

export type Progress = (msg: string) => void;

const MESSAGES: Partial<Record<string, string>> = {
  AUTH_INVALID: 'Usuario, contraseña o MAC incorrectos.',
  AUTH_EXPIRED: 'La cuenta está vencida.',
  NET_TIMEOUT: 'El servidor no respondió a tiempo.',
  NET_OFFLINE: 'No se pudo conectar con el servidor. Revisa la dirección y tu conexión.',
  HTTP_4XX: 'El servidor respondió con un error.',
  HTTP_5XX: 'El servidor tuvo un error interno.',
  PROVIDER_UNEXPECTED: 'El servidor respondió algo inesperado.',
  PARSE_M3U_INVALID: 'La lista no tiene canales válidos.',
};

export function humanError(e: unknown): string {
  if (e instanceof AppError) {
    // Mensajes ya escritos para personas (p. ej. el texto del portal Stalker): se muestran tal cual.
    if (e.detail && /^(El portal|Este portal)/.test(e.detail)) return e.detail;
    const base = MESSAGES[e.code] ?? e.code;
    return e.httpStatus ? `${base} (HTTP ${e.httpStatus})` : base;
  }
  return e instanceof Error ? e.message : String(e);
}

const HOUR = 3600 * 1000;

/** Cliente HTTP que añade el User-Agent propio de la fuente (si tiene). */
function withUserAgent(ua: string | undefined): HttpClient {
  if (!ua) return fetchHttp;
  return { get: (req) => fetchHttp.get({ ...req, headers: { 'User-Agent': ua, ...(req.headers ?? {}) } }) };
}

async function fetchText(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<string> {
  const res = await fetchHttp.get({ url, timeoutMs, headers });
  if (res.status < 200 || res.status >= 300) {
    throw new AppError(res.status === 401 || res.status === 403 ? 'AUTH_INVALID' : res.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX', redact(url), res.status);
  }
  return res.text();
}

async function loadEpg(url: string, progress: Progress, opts: { ua?: string; offsetHours?: number } = {}): Promise<{ channels: EpgChannel[]; programmes: Programme[] }> {
  progress('Descargando la guía…');
  const text = await fetchText(url, 180000, opts.ua ? { 'User-Agent': opts.ua } : undefined);
  progress('Procesando la guía…');
  const now = Date.now();
  const p = new XmltvParser({ windowStartMs: now - 6 * HOUR, windowEndMs: now + 36 * HOUR, offsetMinutes: Math.round((opts.offsetHours ?? 0) * 60) });
  // Por trozos para no bloquear la interfaz demasiado tiempo seguido.
  const CHUNK = 512 * 1024;
  for (let i = 0; i < text.length; i += CHUNK) {
    p.feed(text.slice(i, i + CHUNK));
    await new Promise((r) => setTimeout(r, 0));
  }
  const r = p.end();
  return { channels: r.channels, programmes: r.programmes };
}

export async function refreshSource(source: Source, progress: Progress = () => {}): Promise<void> {
  const secrets = await getSecrets(source.id);
  const secretList = [secrets.password, secrets.mac, secrets.m3uUrl, source.config.username].filter((s): s is string => !!s);
  const own = sourceSettings(source);
  const http = withUserAgent(own.userAgent);
  try {
    let groups;
    let channels: ChannelRow[];
    let epgUrl: string | null = null;
    let account: Source['account'] = null;
    let xclient: XtreamClient | null = null;

    if (source.type === 'xtream') {
      const client = new XtreamClient(http, {
        server: source.config.server ?? '',
        username: source.config.username ?? '',
        password: secrets.password ?? '',
      });
      progress('Conectando…');
      const acc = await client.login();
      account = { allowedFormats: acc.allowedFormats, maxConnections: acc.maxConnections };
      progress('Descargando grupos y canales…');
      const [cats, live] = await Promise.all([client.liveCategories(), client.liveStreams()]);
      ({ groups, channels } = mapProviderLive(source.id, cats, live));
      epgUrl = source.config.epgUrl || client.xmltvUrl();
      xclient = client;
    } else if (source.type === 'm3u') {
      progress('Descargando la lista…');
      const text = await fetchText(secrets.m3uUrl ?? '', 120000, own.userAgent ? { 'User-Agent': own.userAgent } : undefined);
      progress('Procesando la lista…');
      const parser = new M3uParser();
      const CHUNK = 256 * 1024;
      for (let i = 0; i < text.length; i += CHUNK) {
        parser.feed(text.slice(i, i + CHUNK));
        await new Promise((r) => setTimeout(r, 0));
      }
      const parsed = parser.end();
      if (parsed.entries.length === 0) throw new AppError('PARSE_M3U_INVALID', 'La lista no tiene canales.');
      ({ groups, channels } = mapM3u(source.id, parsed.entries));
      epgUrl = source.config.epgUrl || secrets.epgUrlSecret || parsed.header['x-tvg-url'] || parsed.header['url-tvg'] || null;
      if (epgUrl && epgUrl.includes(',')) epgUrl = epgUrl.split(',')[0]!.trim();
    } else {
      const client = stalkerFor(source, secrets);
      client.resetToken(); // token nuevo en cada actualización; reproducción usa este mismo cliente
      progress('Conectando al portal…');
      const [genres, live] = await Promise.all([client.genres(), client.channels()]);
      ({ groups, channels } = mapProviderLive(source.id, genres, live));
    }

    let programmes = null;
    let epgChannels = 0;
    let result: 'ok' | 'partial' = 'ok';
    let epgError: string | null = null;
    if (epgUrl) {
      try {
        const epg = await loadEpg(epgUrl, progress, { ua: own.userAgent, offsetHours: own.epgOffsetHours });
        epgChannels = resolveEpgIds(channels, epg.channels);
        const wanted = new Set(channels.map((c) => c.epg_id).filter((x): x is string => !!x));
        programmes = mapProgrammes(source.id, epg.programmes, wanted);
      } catch (e) {
        result = 'partial';
        epgError = 'Guía: ' + redact(humanError(e), secretList);
      }
    }

    // Películas y series (solo Xtream por ahora). Si fallan, TV en vivo se guarda igual.
    let vodCounts: { movies: number; series: number } | null = null;
    let vodError: string | null = null;
    if (xclient) {
      try {
        progress('Descargando películas y series…');
        const c = xclient;
        const [mc, mv, sc, sv] = await Promise.all([
          c.vodCategories().catch(() => []),
          c.vodStreams(),
          c.seriesCategories().catch(() => []),
          c.series(),
        ]);
        const vod = mapVod(source.id, mc, mv, sc, sv);
        progress('Guardando películas y series…');
        await replaceVodContent(source.id, vod.categories, vod.items);
        vodCounts = { movies: mv.length, series: sv.length };
      } catch (e) {
        result = 'partial';
        vodError = 'Películas/series: ' + redact(humanError(e), secretList);
      }
    }

    progress('Guardando en el iPad…');
    await replaceSourceContent(source.id, groups, channels, programmes);
    await recordRefresh(source.id, {
      result,
      error: [epgError, vodError].filter(Boolean).join(' · ') || null,
      account,
      stats: {
        channels: channels.length, groups: groups.length, epgChannels, programmes: programmes?.length ?? 0,
        ...(vodCounts ?? {}),
      },
    });
    progress(result === 'ok' ? 'Listo' : epgError ? 'Listo (sin guía)' : 'Listo (sin películas/series)');
  } catch (e) {
    const msg = redact(humanError(e), secretList);
    logEvent({ kind: 'error', source: source.name, msg: `Actualizar: ${msg}` });
    await recordRefresh(source.id, { result: 'error', error: msg });
    throw new Error(msg);
  }
}
