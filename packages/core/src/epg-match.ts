// Emparejado de canales con la guía EPG:
// 1) por identificador (tvg-id / epg_channel_id / xmltv_id), sin distinguir mayúsculas;
// 2) por nombre normalizado contra los display-name de la guía;
// 3) si no hay coincidencia, queda "none" para asignación manual.
import type { EpgChannel } from './models.ts';

const QUALITY = /\b(hd|fhd|uhd|sd|4k|8k|hevc|h265|h\.265|1080p?|720p?|2160p|50fps|60fps|backup|alt)\b/g;

export function normalizeChannelName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*[a-z]{2,3}\s*[:|\-]\s*/, '') // prefijos de país: "MX:", "US |", "ES -"
    .replace(/[([{].*?[)\]}]/g, ' ')
    .replace(QUALITY, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export interface MatchInput {
  key: string;
  epgId?: string | null;
  name: string;
}

export interface MatchResult {
  epgChannelId: string | null;
  method: 'id' | 'name' | 'none';
}

export function matchEpg(channels: readonly MatchInput[], epg: readonly EpgChannel[]): Map<string, MatchResult> {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of epg) {
    byId.set(e.id.toLowerCase(), e.id);
    for (const dn of e.displayNames) {
      const n = normalizeChannelName(dn);
      if (n && !byName.has(n)) byName.set(n, e.id);
    }
  }
  const out = new Map<string, MatchResult>();
  for (const c of channels) {
    const id = c.epgId ? byId.get(c.epgId.toLowerCase()) : undefined;
    if (id) {
      out.set(c.key, { epgChannelId: id, method: 'id' });
      continue;
    }
    const n = normalizeChannelName(c.name);
    const byN = n ? byName.get(n) : undefined;
    out.set(c.key, byN ? { epgChannelId: byN, method: 'name' } : { epgChannelId: null, method: 'none' });
  }
  return out;
}
