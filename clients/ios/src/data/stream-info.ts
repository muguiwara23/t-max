// Datos técnicos del video para mostrar en el reproductor (calidad, audios, velocidad). Puro: se prueba en Node.

export interface StreamFacts {
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  isHdr?: boolean;
  hdrFormat?: string;
  /** Velocidad de descarga en bytes/s. */
  rate?: number;
  /** Segundos guardados por adelantado. */
  buffered?: number;
  audio?: { lang: string; title: string; selected: boolean }[];
  subs?: number;
  format?: string;
}

export function qualityLabel(width = 0, height = 0): string | null {
  const h = Math.max(height, Math.round((width * 9) / 16) - 8);
  if (!height && !width) return null;
  if (h >= 2000) return '4K';
  if (h >= 1400) return '2K';
  if (h >= 1000) return 'FHD';
  if (h >= 700) return 'HD';
  return 'SD';
}

export function rateLabel(bytesPerSec?: number): string | null {
  if (!bytesPerSec || bytesPerSec <= 0) return null;
  const mbps = (bytesPerSec * 8) / 1e6;
  return mbps >= 10 ? `${Math.round(mbps)} Mbps` : `${mbps.toFixed(1)} Mbps`;
}

const CODEC: Record<string, string> = { h264: 'H.264', hevc: 'HEVC', h265: 'HEVC', av1: 'AV1', vp9: 'VP9', mpeg2video: 'MPEG-2' };

/** mpv da nombres largos ("H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10"): se reducen a uno corto. */
function codecName(raw: string): string {
  const k = raw.toLowerCase();
  if (CODEC[k]) return CODEC[k]!;
  if (/h\.?264|avc/.test(k)) return 'H.264';
  if (/hevc|h\.?265/.test(k)) return 'HEVC';
  if (/av1/.test(k)) return 'AV1';
  if (/vp9/.test(k)) return 'VP9';
  if (/mpeg-?2/.test(k)) return 'MPEG-2';
  return raw.split('/')[0]!.trim().toUpperCase().slice(0, 12);
}

function langName(l: string): string {
  const k = l.toLowerCase();
  const m: Record<string, string> = { spa: 'ES', es: 'ES', esp: 'ES', eng: 'EN', en: 'EN', por: 'PT', pt: 'PT', fre: 'FR', fra: 'FR', fr: 'FR', ger: 'DE', deu: 'DE', de: 'DE', ita: 'IT', it: 'IT', jpn: 'JA', ja: 'JA', und: '' };
  return k in m ? m[k]! : l.toUpperCase().slice(0, 3);
}

/** Etiquetas cortas en orden: calidad, códec/fps, HDR, audios, subtítulos, velocidad. */
export function factChips(f: StreamFacts): { text: string; strong?: boolean }[] {
  const out: { text: string; strong?: boolean }[] = [];
  const q = qualityLabel(f.width, f.height);
  if (q) out.push({ text: f.height ? `${q} · ${f.height}p` : q, strong: true });
  const codec = f.videoCodec ? codecName(f.videoCodec) : null;
  const fps = f.fps && f.fps > 0 ? `${Math.round(f.fps)} fps` : null;
  if (codec || fps) out.push({ text: [codec, fps].filter(Boolean).join(' · ') });
  if (f.isHdr) out.push({ text: f.hdrFormat === 'hlg' ? 'HLG' : 'HDR', strong: true });
  if (f.audio && f.audio.length > 0) {
    const langs = [...new Set(f.audio.map((a) => langName(a.lang)).filter(Boolean))];
    out.push({ text: `${f.audio.length} ${f.audio.length === 1 ? 'audio' : 'audios'}${langs.length ? ` · ${langs.join(' ')}` : ''}` });
  }
  if (f.subs) out.push({ text: `${f.subs} subt.` });
  if (f.format) out.push({ text: f.format.toUpperCase() });
  const r = rateLabel(f.rate);
  if (r) out.push({ text: `↓ ${r}` });
  return out;
}
