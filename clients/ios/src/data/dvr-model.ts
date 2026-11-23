// Reglas del DVR y de Mis programas, sin dependencias de React Native (se prueban en Node).

/** Margen antes y después del horario de la guía (las cadenas rara vez son puntuales). */
export const PAD_BEFORE_MS = 60_000;
export const PAD_AFTER_MS = 3 * 60_000;
/** Aviso de Mis programas: un minuto antes. */
export const REMIND_BEFORE_MS = 60_000;

export type RecStatus = 'scheduled' | 'recording' | 'saving' | 'done' | 'failed' | 'missed' | 'cancelled';

export interface RecLike {
  id: string;
  start: number;
  end: number;
  status: RecStatus;
}

/** Qué grabaciones arrancar y cuáles detener en este momento. */
export function dvrTick<T extends RecLike>(list: T[], now: number): { start: T[]; stop: T[]; missed: T[] } {
  const start: T[] = [];
  const stop: T[] = [];
  const missed: T[] = [];
  for (const r of list) {
    const from = r.start - PAD_BEFORE_MS;
    const to = r.end + PAD_AFTER_MS;
    if (r.status === 'scheduled') {
      if (now >= to) missed.push(r);
      else if (now >= from) start.push(r);
    } else if (r.status === 'recording' && now >= to) {
      stop.push(r);
    }
  }
  return { start, stop, missed };
}

/** Nombre de archivo seguro: canal-título-AAAAMMDD-HHMM.ext */
export function recordingFileName(r: { channel_name: string; title: string; start: number }, ext: string, tzOffsetMin = 0): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tmax';
  const d = new Date(r.start - tzOffsetMin * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return `${clean(r.channel_name)}-${clean(r.title)}-${stamp}.${ext}`;
}

/** ¿Se enciman dos grabaciones del mismo canal? (para no grabar dos veces lo mismo) */
export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Fotos solo acepta contenedores de video de Apple. */
export const PHOTOS_EXTS = ['mp4', 'mov', 'm4v'];
