// Resuelve la URL de reproducción de un canal, directo contra la fuente del usuario.
import { XtreamClient, chooseFormat, type FormatPreference } from '@tmax/core';

import { fetchHttp } from '../platform/http';
import { getSetting } from './db';
import type { ChannelItem } from './queries';
import { getSecrets, listSources, type Source } from './sources';
import { forgetStalker, stalkerFor } from './stalker-session';

export interface PlaybackTarget {
  url: string;
  format: string;
  /** Cabeceras para el servidor de video (Stalker: User-Agent MAG y cookie de MAC). */
  headers?: Record<string, string>;
}
let sourceCache: { at: number; list: Source[] } | null = null;

async function sourceById(id: string): Promise<Source | undefined> {
  if (!sourceCache || Date.now() - sourceCache.at > 30000) sourceCache = { at: Date.now(), list: await listSources() };
  return sourceCache.list.find((s) => s.id === id);
}

export function invalidatePlaybackCache(): void {
  sourceCache = null;
  forgetStalker();
}

export async function getFormatPref(): Promise<FormatPreference> {
  const v = await getSetting('format');
  return v === 'ts' || v === 'm3u8' ? v : 'auto';
}

export async function resolvePlayback(ch: ChannelItem, opts: { forceNewToken?: boolean } = {}): Promise<PlaybackTarget> {
  if (ch.source_type === 'm3u') {
    const url = ch.stream_url ?? '';
    return { url, format: /\.m3u8(\?|$)/i.test(url) ? 'm3u8' : /\.ts(\?|$)/i.test(url) ? 'ts' : 'directo' };
  }
  const source = await sourceById(ch.source_id);
  if (!source) throw new Error('La fuente de este canal ya no existe.');
  const secrets = await getSecrets(source.id);
  if (ch.source_type === 'xtream') {
    const client = new XtreamClient(fetchHttp, {
      server: source.config.server ?? '',
      username: source.config.username ?? '',
      password: secrets.password ?? '',
    });
    // libmpv reproduce TS y HLS: el formato depende de la preferencia y de lo que permita el servidor.
    const format = chooseFormat(await getFormatPref(), source.account, { ts: true, hls: true }) ?? 'ts';
    return { url: client.liveUrl(ch.source_channel_id, format), format };
  }
  const link = await stalkerFor(source, secrets).createLink(ch.cmd ?? '', { forceNewToken: opts.forceNewToken });
  return { url: link.url, format: /\.m3u8/i.test(link.url) ? 'm3u8' : 'ts', headers: link.headers };
}
