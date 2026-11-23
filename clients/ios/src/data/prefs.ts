// Ajustes efectivos en tiempo de ejecución: lo general más lo de cada fuente.
import { getSetting, setSetting } from './db';
import { listSources, sourceSettings, type Source } from './sources';
import { DEFAULT_SUB_STYLE, normalizeSubStyle, subStyleToMpv, type SourceSettings, type SubStyle } from './settings-model';

let cache: { at: number; sources: Source[]; sub: SubStyle } | null = null;

async function load() {
  if (!cache || Date.now() - cache.at > 15000) {
    const raw = await getSetting('subStyle');
    let sub = DEFAULT_SUB_STYLE;
    try {
      sub = raw ? normalizeSubStyle(JSON.parse(raw)) : DEFAULT_SUB_STYLE;
    } catch {
      sub = DEFAULT_SUB_STYLE;
    }
    cache = { at: Date.now(), sources: await listSources(), sub };
  }
  return cache;
}

export function invalidatePrefs(): void {
  cache = null;
}

export async function getGlobalSubStyle(): Promise<SubStyle> {
  return (await load()).sub;
}

export async function setGlobalSubStyle(s: SubStyle): Promise<void> {
  await setSetting('subStyle', JSON.stringify(normalizeSubStyle(s)));
  invalidatePrefs();
}

export async function settingsFor(sourceId: string): Promise<SourceSettings> {
  const s = (await load()).sources.find((x) => x.id === sourceId);
  return s ? sourceSettings(s) : {};
}

/** Propiedades de mpv para los subtítulos de un video de esta fuente. */
export async function subPropsFor(sourceId: string | null | undefined): Promise<[string, string][]> {
  const c = await load();
  const own = sourceId ? (await settingsFor(sourceId)).subStyle : null;
  return subStyleToMpv(own ?? c.sub);
}
