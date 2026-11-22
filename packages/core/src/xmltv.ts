// Parser XMLTV en streaming, sin DOM ni dependencias: funciona igual en Hermes (iOS),
// en los motores web de las TVs y en Node. Se alimenta por trozos con feed() y solo
// guarda los programas dentro de la ventana de tiempo pedida.
// Reglas y resultado dorado: contracts/fixtures/xmltv/basic.expected.json.
import type { EpgChannel, ParseWarning, Programme, XmltvResult } from './models.ts';

export interface XmltvOptions {
  /** Desplazamiento manual de la fuente, en minutos (EpgSource.timeOffsetMinutes). */
  offsetMinutes?: number;
  /** Solo se conservan programas que se solapen con [windowStartMs, windowEndMs). */
  windowStartMs?: number;
  windowEndMs?: number;
}

interface RawProgramme {
  channel: string;
  startMs: number;
  endMs: number | null;
  title?: string;
  subTitle?: string;
  description?: string;
  categories: string[];
  icon?: string;
  episodeNum?: string;
}

const MARGIN_MS = 6 * 3600 * 1000;

const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;
function decode(s: string): string {
  return s.replace(ENTITY, (_m, e: string) => {
    switch (e) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }
  });
}

/** "YYYYMMDDhhmmss ±hhmm" → ms UTC. Sin zona = UTC. */
export function parseXmltvTime(value: string, offsetMinutes = 0): number | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(value);
  if (!m) return null;
  let ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, m[6] ? +m[6] : 0);
  if (m[7]) {
    const sign = m[7][0] === '-' ? -1 : 1;
    const oh = +m[7].slice(1, 3);
    const om = +m[7].slice(3, 5);
    ms -= sign * (oh * 60 + om) * 60000;
  }
  return ms + offsetMinutes * 60000;
}

export function isoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseAttributes(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out[m[1]!] = decode(m[3] ?? m[4] ?? '');
  return out;
}

export class XmltvParser {
  private buf = '';
  private readonly opts: XmltvOptions;
  private readonly channels: EpgChannel[] = [];
  private readonly progs: RawProgramme[] = [];
  private curChannel: EpgChannel | null = null;
  private curProg: RawProgramme | null = null;
  private dropProg = false;
  private textTarget: string | null = null;
  private text = '';
  private epBest = -1;
  private epCandidate = 0;

  constructor(opts: XmltvOptions = {}) {
    this.opts = opts;
  }

  feed(chunk: string): void {
    this.buf += chunk;
    let pos = 0;
    const b = this.buf;
    while (pos < b.length) {
      const lt = b.indexOf('<', pos);
      if (lt < 0) break; // texto incompleto: se procesa cuando llegue el siguiente '<'
      if (lt > pos) this.onText(b.slice(pos, lt));
      pos = lt;
      if (b.startsWith('<!--', pos)) {
        const e = b.indexOf('-->', pos + 4);
        if (e < 0) break;
        pos = e + 3;
      } else if (b.startsWith('<![CDATA[', pos)) {
        const e = b.indexOf(']]>', pos + 9);
        if (e < 0) break;
        this.onRawText(b.slice(pos + 9, e));
        pos = e + 3;
      } else if (b.startsWith('<?', pos)) {
        const e = b.indexOf('?>', pos + 2);
        if (e < 0) break;
        pos = e + 2;
      } else if (b.startsWith('<!', pos)) {
        const e = b.indexOf('>', pos + 2);
        if (e < 0) break;
        pos = e + 1;
      } else {
        const e = findTagEnd(b, pos + 1);
        if (e < 0) break;
        this.onTag(b.slice(pos + 1, e));
        pos = e + 1;
      }
    }
    this.buf = b.slice(pos);
  }

  end(): XmltvResult {
    if (this.buf.trim()) this.onText(this.buf);
    this.buf = '';
    return this.finish();
  }

  private onText(t: string): void {
    if (this.textTarget !== null) this.text += decode(t);
  }

  private onRawText(t: string): void {
    if (this.textTarget !== null) this.text += t;
  }

  private onTag(inner: string): void {
    if (inner.startsWith('/')) {
      this.onClose(inner.slice(1).trim());
      return;
    }
    const selfClose = inner.endsWith('/');
    const body = selfClose ? inner.slice(0, -1) : inner;
    const sp = body.search(/\s/);
    const name = sp < 0 ? body : body.slice(0, sp);
    const attrs = sp < 0 ? {} : parseAttributes(body.slice(sp));
    this.onOpen(name, attrs);
    if (selfClose) this.onClose(name);
  }

  private onOpen(name: string, a: Record<string, string>): void {
    const off = this.opts.offsetMinutes ?? 0;
    if (name === 'channel' && !this.curProg) {
      this.curChannel = { id: a.id ?? '', displayNames: [] };
    } else if (name === 'programme') {
      const start = a.start ? parseXmltvTime(a.start, off) : null;
      const stop = a.stop ? parseXmltvTime(a.stop, off) : null;
      this.dropProg = start === null || !a.channel;
      this.curProg = { channel: a.channel ?? '', startMs: start ?? 0, endMs: stop, categories: [] };
      this.epBest = -1;
    } else if (name === 'icon' && a.src) {
      if (this.curProg) this.curProg.icon ??= a.src;
      else if (this.curChannel) this.curChannel.icon ??= a.src;
    } else if (
      (this.curChannel && name === 'display-name') ||
      (this.curProg && ['title', 'sub-title', 'desc', 'category', 'episode-num'].includes(name))
    ) {
      this.textTarget = name;
      this.text = '';
      if (name === 'episode-num') this.epCandidate = a.system === 'onscreen' ? 2 : a.system === 'xmltv_ns' ? 1 : 0;
    }
  }

  private onClose(name: string): void {
    if (this.textTarget === name) {
      const v = this.text.trim();
      this.textTarget = null;
      this.text = '';
      if (this.curChannel && name === 'display-name') {
        if (v) this.curChannel.displayNames.push(v);
      } else if (this.curProg && v) {
        const p = this.curProg;
        if (name === 'title') p.title ??= v;
        else if (name === 'sub-title') p.subTitle ??= v;
        else if (name === 'desc') p.description ??= v;
        else if (name === 'category') p.categories.push(v);
        else if (name === 'episode-num') {
          // Se prefiere "onscreen" (S01E04) sobre "xmltv_ns" (0.3.); a igual prioridad, la primera.
          if (this.epCandidate > this.epBest) {
            p.episodeNum = v;
            this.epBest = this.epCandidate;
          }
        }
      }
      return;
    }
    if (name === 'channel' && this.curChannel) {
      if (this.curChannel.id) this.channels.push(this.curChannel);
      this.curChannel = null;
    } else if (name === 'programme' && this.curProg) {
      const p = this.curProg;
      this.curProg = null;
      if (this.dropProg || !p.title) return;
      // Filtro grueso con margen (para poder inferir el fin de un programa sin "stop");
      // el filtro exacto se aplica en finish().
      const { windowStartMs, windowEndMs } = this.opts;
      if (windowEndMs !== undefined && p.startMs >= windowEndMs + MARGIN_MS) return;
      if (windowStartMs !== undefined && p.endMs !== null && p.endMs <= windowStartMs - MARGIN_MS) return;
      this.progs.push(p);
    }
  }

  private finish(): XmltvResult {
    const warnings: ParseWarning[] = [];
    const known = new Map<string, RawProgramme[]>();
    for (const c of this.channels) known.set(c.id, []);
    const unknown: string[] = [];
    for (const p of this.progs) {
      const list = known.get(p.channel);
      if (list) list.push(p);
      else if (!unknown.includes(p.channel)) unknown.push(p.channel);
    }
    const programmes: Programme[] = [];
    for (const c of this.channels) {
      const list = (known.get(c.id) ?? []).sort((a, b) => a.startMs - b.startMs);
      let prevEnd = -Infinity;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        let end = p.endMs;
        if (end === null) {
          const next = list[i + 1];
          if (!next) {
            warnings.push({ code: 'MISSING_STOP_DROPPED', channel: c.id, start: isoUtc(p.startMs) });
            continue;
          }
          end = next.startMs;
          warnings.push({ code: 'MISSING_STOP_INFERRED', channel: c.id, start: isoUtc(p.startMs) });
        }
        if (end <= p.startMs) {
          warnings.push({ code: 'INVALID_RANGE', channel: c.id, start: isoUtc(p.startMs) });
          continue;
        }
        const { windowStartMs, windowEndMs } = this.opts;
        if ((windowEndMs !== undefined && p.startMs >= windowEndMs) || (windowStartMs !== undefined && end <= windowStartMs)) continue;
        if (p.startMs < prevEnd) warnings.push({ code: 'OVERLAP', channel: c.id, start: isoUtc(p.startMs) });
        prevEnd = Math.max(prevEnd, end);
        const out: Programme = { epgChannelId: c.id, title: p.title!, startUtc: isoUtc(p.startMs), endUtc: isoUtc(end) };
        if (p.subTitle) out.subTitle = p.subTitle;
        if (p.description) out.description = p.description;
        if (p.categories.length) out.categories = p.categories;
        if (p.icon) out.icon = p.icon;
        if (p.episodeNum) out.episodeNum = p.episodeNum;
        programmes.push(out);
      }
    }
    for (const ch of unknown) warnings.push({ code: 'UNKNOWN_CHANNEL', channel: ch });
    return { channels: this.channels, programmes, warnings };
  }
}

/** Busca el '>' que cierra la etiqueta, respetando comillas en atributos. */
function findTagEnd(b: string, from: number): number {
  let q: string | null = null;
  for (let i = from; i < b.length; i++) {
    const ch = b[i];
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

export function parseXmltv(text: string, opts: XmltvOptions = {}): XmltvResult {
  const p = new XmltvParser(opts);
  p.feed(text);
  return p.end();
}
