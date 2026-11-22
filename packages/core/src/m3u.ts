// Parser M3U/M3U8 incremental. Reglas en contracts/README.md; resultados dorados en
// contracts/fixtures/m3u/*.expected.json. Se puede alimentar por trozos (feed) para
// listas enormes sin cargarlas completas en memoria.
import type { M3uEntry, M3uResult, ParseWarning } from './models.ts';

const SCHEMES = /^(https?|rtmp|rtsp|udp|rtp):\/\//i;
const KEY = /^([A-Za-z0-9_-]+)=/;
const UNQUOTED = /^[^\s,]*/;
const MAX_LINE = 64 * 1024;

interface AttrResult {
  attrs: Record<string, string>;
  name: string | null;
  unterminated: boolean;
}

/** Lee `clave="valor" clave='valor' clave=valor,Nombre`. */
function parseAttrs(s: string): AttrResult {
  const attrs: Record<string, string> = {};
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && s[i] === ' ') i++;
    if (i >= n) return { attrs, name: null, unterminated: false };
    if (s[i] === ',') return { attrs, name: s.slice(i + 1), unterminated: false };
    const m = KEY.exec(s.slice(i));
    if (!m) {
      const j = s.indexOf(',', i);
      return { attrs, name: j >= 0 ? s.slice(j + 1) : null, unterminated: false };
    }
    const key = (m[1] as string).toLowerCase();
    i += m[0].length;
    const q = s[i];
    if (q === '"' || q === "'") {
      const j = s.indexOf(q, i + 1);
      if (j < 0) {
        const c = s.lastIndexOf(',');
        return { attrs, name: c >= 0 ? s.slice(c + 1) : null, unterminated: true };
      }
      attrs[key] = s.slice(i + 1, j);
      i = j + 1;
    } else {
      const v = (UNQUOTED.exec(s.slice(i)) as RegExpExecArray)[0];
      attrs[key] = v;
      i += v.length;
    }
  }
  return { attrs, name: null, unterminated: false };
}

function parseDuration(body: string): { value: number; raw: string; ok: boolean } {
  let k = 0;
  while (k < body.length && body[k] !== ' ' && body[k] !== '\t' && body[k] !== ',') k++;
  const raw = body.slice(0, k);
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { value: Number(raw), raw, ok: true };
  return { value: -1, raw, ok: false };
}

export interface M3uParserOptions {
  /** Si se indica, cada entrada se entrega aquí y no se acumula en memoria. */
  onEntry?: (e: M3uEntry) => void;
}

export class M3uParser {
  private buf = '';
  private lineNo = 0;
  private first = true;
  private cur: M3uEntry | null = null;
  private readonly header: Record<string, string> = {};
  private readonly entries: M3uEntry[] = [];
  private readonly warnings: ParseWarning[] = [];
  private readonly onEntry: ((e: M3uEntry) => void) | undefined;

  constructor(opts: M3uParserOptions = {}) {
    this.onEntry = opts.onEntry;
  }

  feed(chunk: string): void {
    this.buf += chunk;
    let nl = this.buf.indexOf('\n');
    while (nl >= 0) {
      this.line(this.buf.slice(0, nl));
      this.buf = this.buf.slice(nl + 1);
      nl = this.buf.indexOf('\n');
    }
    if (this.buf.length > MAX_LINE) {
      this.lineNo++;
      this.warnings.push({ line: this.lineNo, code: 'LINE_TOO_LONG' });
      this.buf = '';
    }
  }

  end(): M3uResult {
    if (this.buf.length > 0) {
      this.line(this.buf);
      this.buf = '';
    }
    if (this.cur) this.warnings.push({ line: this.cur.lineNumber, code: 'MISSING_URL' });
    this.cur = null;
    return { header: this.header, entries: this.entries, warnings: this.warnings };
  }

  private emit(e: M3uEntry): void {
    if (this.onEntry) this.onEntry(e);
    else this.entries.push(e);
  }

  private line(rawLine: string): void {
    this.lineNo++;
    let raw = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (this.first) {
      this.first = false;
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      if (!raw.startsWith('#EXTM3U')) {
        this.warnings.push({ line: 1, code: 'MISSING_HEADER' });
      } else {
        Object.assign(this.header, parseAttrs(raw.slice(7).trim() + ',').attrs);
        return;
      }
    }
    const s = raw.trim();
    if (s === '' || s.startsWith('#EXTM3U')) return;
    const no = this.lineNo;

    if (s.startsWith('#EXTINF:')) {
      if (this.cur) this.warnings.push({ line: this.cur.lineNumber, code: 'MISSING_URL' });
      const body = s.slice(8);
      const d = parseDuration(body);
      if (!d.ok) this.warnings.push({ line: no, code: 'INVALID_DURATION' });
      const a = parseAttrs(body.slice(d.raw.length));
      if (a.unterminated) this.warnings.push({ line: no, code: 'UNTERMINATED_QUOTE' });
      let name = a.name;
      if (name === null) {
        name = '';
        this.warnings.push({ line: no, code: 'MISSING_NAME' });
      }
      this.cur = { name: name.trim(), url: '', durationSec: d.value, attributes: a.attrs, extraTags: [], lineNumber: no };
      return;
    }
    if (s.startsWith('#')) {
      if (this.cur) this.cur.extraTags.push(s);
      return;
    }
    if (!SCHEMES.test(s)) {
      this.warnings.push({ line: no, code: 'UNSUPPORTED_SCHEME' });
      if (this.cur) this.warnings.push({ line: this.cur.lineNumber, code: 'MISSING_URL' });
      this.cur = null;
      return;
    }
    if (this.cur) {
      this.cur.url = s;
      this.emit(this.cur);
      this.cur = null;
    } else {
      this.warnings.push({ line: no, code: 'BARE_URL' });
      this.emit({ name: s, url: s, durationSec: -1, attributes: {}, extraTags: [], lineNumber: no });
    }
  }
}

export function parseM3u(text: string): M3uResult {
  const p = new M3uParser();
  p.feed(text);
  return p.end();
}
