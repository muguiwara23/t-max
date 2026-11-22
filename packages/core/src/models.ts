// Modelos del dominio. Siguen contracts/json-schema; la representación física
// (SQLite, IndexedDB, roRegistry) es asunto de cada plataforma.

export type OutputFormat = 'ts' | 'm3u8';
export type FormatPreference = 'auto' | OutputFormat;

export interface ParseWarning {
  line?: number;
  code: string;
  channel?: string;
  start?: string;
}

// ---------- M3U ----------
export interface M3uEntry {
  name: string;
  url: string;
  durationSec: number;
  attributes: Record<string, string>;
  extraTags: string[];
  lineNumber: number;
}

export interface M3uResult {
  header: Record<string, string>;
  entries: M3uEntry[];
  warnings: ParseWarning[];
}

// ---------- XMLTV / EPG ----------
export interface EpgChannel {
  id: string;
  displayNames: string[];
  icon?: string;
}

export interface Programme {
  epgChannelId: string;
  title: string;
  subTitle?: string;
  description?: string;
  categories?: string[];
  icon?: string;
  episodeNum?: string;
  startUtc: string;
  endUtc: string;
}

export interface XmltvResult {
  channels: EpgChannel[];
  programmes: Programme[];
  warnings: ParseWarning[];
}

// ---------- Fuentes de proveedor ----------
export interface Category {
  id: string;
  name: string;
}

export interface LiveChannel {
  sourceChannelId: string;
  name: string;
  number: number | null;
  logo: string | null;
  categoryId: string | null;
  epgChannelId: string | null;
  catchupDays: number;
  /** Para Stalker: valor "cmd" que se resuelve con create_link. */
  stalkerCmd?: string;
}

export interface VodMovie {
  sourceItemId: string;
  title: string;
  poster: string | null;
  categoryId: string | null;
  rating: string | null;
  year: number | null;
  containerExtension: string | null;
  tmdbId: string | null;
}

export interface VodMovieDetail extends VodMovie {
  synopsis: string | null;
  durationSec: number | null;
  genres: string[];
  cast: string[];
  director: string | null;
  backdrop: string | null;
}

export interface SeriesSummary {
  sourceItemId: string;
  title: string;
  poster: string | null;
  categoryId: string | null;
  synopsis: string | null;
  genres: string[];
  rating: string | null;
  year: number | null;
  tmdbId: string | null;
}

export interface Episode {
  sourceItemId: string;
  season: number;
  episode: number;
  title: string;
  durationSec: number | null;
  containerExtension: string | null;
  synopsis: string | null;
}

export interface SeriesDetail {
  summary: SeriesSummary;
  seasons: { number: number; name: string; episodeCount: number }[];
  episodes: Episode[];
}

export interface AccountInfo {
  status: string;
  allowedFormats: string[];
  maxConnections: number | null;
  activeConnections: number | null;
  expiresAt: string | null;
  serverTimezone: string | null;
}
