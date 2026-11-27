// Ajustes por fuente y estilo de subtítulos: tipos, valores por omisión y traducción a mpv.
// Sin dependencias de React Native: se prueba en Node (test/settings.test.ts).

export type SubSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SubColor = 'white' | 'yellow';
export type SubBackground = 'outline' | 'box' | 'none';

export interface SubStyle {
  size: SubSize;
  color: SubColor;
  background: SubBackground;
  /** Posición vertical: 100 = pegado abajo. */
  position: number;
  bold: boolean;
}

export const DEFAULT_SUB_STYLE: SubStyle = { size: 'medium', color: 'white', background: 'outline', position: 95, bold: false };

export interface SourceSettings {
  /** 'global' = usar el ajuste general del reproductor. */
  format?: 'global' | 'auto' | 'ts' | 'm3u8';
  /** User-Agent propio para esta fuente (vacío = el de siempre). */
  userAgent?: string;
  /** Corrección manual de la guía en horas (p. ej. -1, +2). */
  epgOffsetHours?: number;
  /** Actualizar sola cada N horas al abrir la app (0 = nunca). */
  autoRefreshHours?: number;
  /** Estilo de subtítulos solo para esta fuente (null = el general). */
  subStyle?: SubStyle | null;
}

const SIZE: Record<SubSize, number> = { small: 34, medium: 44, large: 56, xlarge: 70 };
const COLOR: Record<SubColor, string> = { white: '#FFFFFF', yellow: '#FFE45C' };

export function normalizeSubStyle(raw: unknown): SubStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SubStyle>;
  return {
    size: r.size && r.size in SIZE ? r.size : DEFAULT_SUB_STYLE.size,
    color: r.color && r.color in COLOR ? r.color : DEFAULT_SUB_STYLE.color,
    background: r.background === 'box' || r.background === 'none' || r.background === 'outline' ? r.background : DEFAULT_SUB_STYLE.background,
    position: typeof r.position === 'number' && r.position >= 70 && r.position <= 100 ? Math.round(r.position) : DEFAULT_SUB_STYLE.position,
    bold: !!r.bold,
  };
}

/** Propiedades de mpv para un estilo (texto plano: SRT/VTT; los ASS conservan su propio estilo). */
export function subStyleToMpv(style: SubStyle): [string, string][] {
  const s = normalizeSubStyle(style);
  const box = s.background === 'box';
  return [
    ['sub-font-size', String(SIZE[s.size])],
    ['sub-color', COLOR[s.color]],
    ['sub-bold', s.bold ? 'yes' : 'no'],
    ['sub-pos', String(s.position)],
    ['sub-border-style', box ? 'background-box' : 'outline-and-shadow'],
    // Formato de mpv con transparencia: #AARRGGBB.
    ['sub-back-color', box ? '#B3000000' : '#00000000'],
    ['sub-outline-size', s.background === 'outline' ? '2.5' : '0'],
    ['sub-outline-color', '#FF000000'],
    ['sub-shadow-offset', s.background === 'outline' ? '1' : '0'],
  ];
}

export function normalizeSourceSettings(raw: unknown): SourceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as SourceSettings;
  const fmt = r.format === 'auto' || r.format === 'ts' || r.format === 'm3u8' ? r.format : 'global';
  const off = Number(r.epgOffsetHours);
  const auto = Number(r.autoRefreshHours);
  return {
    format: fmt,
    userAgent: typeof r.userAgent === 'string' ? r.userAgent.trim().slice(0, 300) : '',
    epgOffsetHours: Number.isFinite(off) ? Math.max(-12, Math.min(14, Math.round(off * 2) / 2)) : 0,
    autoRefreshHours: Number.isFinite(auto) && auto > 0 ? Math.min(168, Math.round(auto)) : 0,
    subStyle: r.subStyle ? normalizeSubStyle(r.subStyle) : null,
  };
}

/** ¿Toca actualizar sola esta fuente? */
/** Una lista que lleva más de 1 día sin actualizarse con éxito merece un aviso. */
export const STALE_MS = 24 * 3600000;
export function isStale(lastRefresh: number | null, now: number): boolean {
  return !lastRefresh || now - lastRefresh > STALE_MS;
}

export function needsAutoRefresh(settings: SourceSettings, lastRefresh: number | null, now: number): boolean {
  const h = settings.autoRefreshHours ?? 0;
  if (h <= 0) return false;
  return !lastRefresh || now - lastRefresh >= h * 3600000;
}
