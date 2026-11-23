// Conversión pura de respuestas del núcleo a filas de la base local.
// Sin dependencias de React Native: se prueba en Node (test/mapping.test.ts).
import type { Category, EpgChannel, LiveChannel, M3uEntry, Programme } from '@tmax/core';
import { matchEpg } from '@tmax/core';

export interface GroupRow {
  id: string;
  source_id: string;
  source_group_id: string;
  name: string;
  sort: number;
}

export interface ChannelRow {
  id: string;
  key: string;
  source_id: string;
  source_channel_id: string;
  group_id: string | null;
  name: string;
  number: number | null;
  logo: string | null;
  epg_id: string | null;
  catchup_days: number;
  stream_url: string | null;
  cmd: string | null;
  sort: number;
}

export interface ProgrammeRow {
  source_id: string;
  epg_id: string;
  start: number;
  end: number;
  title: string;
  description: string | null;
}

/** Hash estable y corto (djb2) para identificar canales M3U por su URL. */
export function stableHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const channelKey = (sourceId: string, sourceChannelId: string) => `${sourceId}:${sourceChannelId}`;

export function mapProviderLive(sourceId: string, cats: Category[], live: LiveChannel[]): { groups: GroupRow[]; channels: ChannelRow[] } {
  const groups: GroupRow[] = cats.map((c, i) => ({ id: `${sourceId}:g:${c.id}`, source_id: sourceId, source_group_id: c.id, name: c.name, sort: i }));
  const known = new Set(cats.map((c) => c.id));
  const channels: ChannelRow[] = live.map((c, i) => ({
    id: channelKey(sourceId, c.sourceChannelId),
    key: channelKey(sourceId, c.sourceChannelId),
    source_id: sourceId,
    source_channel_id: c.sourceChannelId,
    group_id: c.categoryId && known.has(c.categoryId) ? `${sourceId}:g:${c.categoryId}` : null,
    name: c.name,
    number: c.number,
    logo: c.logo,
    epg_id: c.epgChannelId,
    catchup_days: c.catchupDays,
    stream_url: null,
    cmd: c.stalkerCmd ?? null,
    sort: c.number ?? i + 1,
  }));
  return { groups, channels };
}

export function mapM3u(sourceId: string, entries: M3uEntry[]): { groups: GroupRow[]; channels: ChannelRow[] } {
  const groupIds = new Map<string, string>();
  const groups: GroupRow[] = [];
  const channels: ChannelRow[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const gname = (e.attributes['group-title'] ?? '').trim() || 'Sin grupo';
    let gid = groupIds.get(gname);
    if (!gid) {
      gid = `${sourceId}:g:${stableHash(gname)}`;
      groupIds.set(gname, gid);
      groups.push({ id: gid, source_id: sourceId, source_group_id: gname, name: gname, sort: groups.length });
    }
    let scid = stableHash(e.url);
    while (seen.has(scid)) scid += '_';
    seen.add(scid);
    const num = e.attributes['tvg-chno'] ? parseInt(e.attributes['tvg-chno'], 10) : NaN;
    channels.push({
      id: channelKey(sourceId, scid),
      key: channelKey(sourceId, scid),
      source_id: sourceId,
      source_channel_id: scid,
      group_id: gid,
      name: e.name || e.attributes['tvg-name'] || `Canal ${i + 1}`,
      number: Number.isFinite(num) ? num : i + 1,
      logo: e.attributes['tvg-logo'] || null,
      epg_id: e.attributes['tvg-id'] || null,
      catchup_days: parseInt(e.attributes['catchup-days'] ?? '0', 10) || 0,
      stream_url: e.url,
      cmd: null,
      sort: i,
    });
  });
  return { groups, channels };
}

/** Completa epg_id por nombre cuando el proveedor no trae id o no coincide con la guía. */
export function resolveEpgIds(channels: ChannelRow[], epg: EpgChannel[]): number {
  const m = matchEpg(
    channels.map((c) => ({ key: c.id, epgId: c.epg_id, name: c.name })),
    epg,
  );
  let matched = 0;
  for (const c of channels) {
    const r = m.get(c.id);
    if (r && r.epgChannelId) {
      c.epg_id = r.epgChannelId;
      matched++;
    }
  }
  return matched;
}

export function mapProgrammes(sourceId: string, programmes: Programme[], wanted: Set<string>): ProgrammeRow[] {
  const out: ProgrammeRow[] = [];
  for (const p of programmes) {
    if (!wanted.has(p.epgChannelId)) continue;
    out.push({
      source_id: sourceId,
      epg_id: p.epgChannelId,
      start: Date.parse(p.startUtc),
      end: Date.parse(p.endUtc),
      title: p.title,
      description: p.description ?? null,
    });
  }
  return out;
}

// ---------- Guía: posiciones ----------
export interface GuideBlock {
  key: string;
  title: string;
  left: number;
  width: number;
  start: number;
  end: number;
  isNow: boolean;
  isPast: boolean;
}

export function layoutGuideRow(
  programmes: { start: number; end: number; title: string }[],
  windowStart: number,
  windowEnd: number,
  pxPerMin: number,
  now: number,
): GuideBlock[] {
  const out: GuideBlock[] = [];
  for (const p of programmes) {
    if (p.end <= windowStart || p.start >= windowEnd) continue;
    const vs = Math.max(p.start, windowStart);
    const ve = Math.min(p.end, windowEnd);
    out.push({
      key: `${p.start}`,
      title: p.title,
      left: ((vs - windowStart) / 60000) * pxPerMin + 2,
      width: Math.max(((ve - vs) / 60000) * pxPerMin - 4, 6),
      start: p.start,
      end: p.end,
      isNow: p.start <= now && p.end > now,
      isPast: p.end <= now,
    });
  }
  return out;
}

export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- Orden de grupos ----------
export type GroupSortMode = 'provider' | 'name' | 'manual';

export interface SortableGroup {
  name: string;
  providerSort: number;
  manualSort: number | null;
}

/** provider = orden de la lista/servidor; name = alfabético; manual = el del usuario (los nuevos van al final). */
export function sortGroups<T extends SortableGroup>(groups: T[], mode: GroupSortMode): T[] {
  const copy = [...groups];
  if (mode === 'name') {
    return copy.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }));
  }
  if (mode === 'manual') {
    return copy.sort((a, b) => {
      const am = a.manualSort ?? Number.MAX_SAFE_INTEGER;
      const bm = b.manualSort ?? Number.MAX_SAFE_INTEGER;
      return am - bm || a.providerSort - b.providerSort;
    });
  }
  return copy.sort((a, b) => a.providerSort - b.providerSort);
}

/** Mueve un elemento una posición arriba (-1) o abajo (+1). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (index < 0 || j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[j]] = [copy[j]!, copy[index]!];
  return copy;
}
