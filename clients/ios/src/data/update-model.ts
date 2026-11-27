// Lógica pura de actualizaciones (sin red ni React): versiones, aviso publicado y
// autenticación "Digest" para subir la app al instalador de desarrollador del Roku.

/** Cada cuánto se revisa sola si salió una versión nueva. */
export const CHECK_EVERY_MS = 24 * 3600000;

/** Aviso que publica el flujo "Publicar versión" junto a los archivos (versions.json). */
export interface UpdateInfo {
  app: string;
  roku: string;
  date: string;
  notes: string;
  page: string;
  android: string;
  ios: string;
  rokuZip: string;
}

/** Compara "0.10.2" con "0.9.9": >0 si a es más nueva, 0 si igual, <0 si más vieja. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Lee el versions.json publicado; null si no tiene lo mínimo (versión y enlaces de GitHub). */
export function parseUpdateInfo(raw: unknown): UpdateInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const info: UpdateInfo = {
    app: str('app'),
    roku: str('roku'),
    date: str('date'),
    notes: str('notes'),
    page: str('page'),
    android: str('android'),
    ios: str('ios'),
    rokuZip: str('rokuZip'),
  };
  if (!/^\d+\.\d+\.\d+$/.test(info.app)) return null;
  // Solo enlaces del propio repositorio en GitHub: nunca descargar de otro lado.
  for (const k of ['page', 'android', 'ios', 'rokuZip'] as const) {
    if (info[k] && !info[k].startsWith('https://github.com/muguiwara23/t-max/')) info[k] = '';
  }
  return info;
}

export function isNewer(info: UpdateInfo | null, current: string): boolean {
  return !!info && compareVersions(info.app, current) > 0;
}

export function shouldCheck(lastCheck: number | null, now: number): boolean {
  return !lastCheck || now - lastCheck >= CHECK_EVERY_MS;
}

// ---------- MD5 (solo para Digest del Roku; no se usa para guardar nada) ----------

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);

export function md5Hex(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(i < 4 ? (bitLen >>> (8 * i)) & 255 : 0);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < bytes.length; off += 64) {
    const M: number[] = [];
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      M.push((bytes[j]! | (bytes[j + 1]! << 8) | (bytes[j + 2]! << 16) | (bytes[j + 3]! << 24)) >>> 0);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i]! + M[g]!) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]!) | (F >>> (32 - S[i]!)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map((w) => [0, 8, 16, 24].map((s) => ((w >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

// ---------- Digest (RFC 2617), como lo pide el instalador del Roku ----------

export interface DigestChallenge { realm: string; nonce: string; qop?: string; opaque?: string }

export function parseDigestChallenge(header: string | null): DigestChallenge | null {
  if (!header || !/^\s*digest\s/i.test(header)) return null;
  const out: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header))) out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? '';
  if (!out.realm || !out.nonce) return null;
  const qop = out.qop?.split(',').map((x) => x.trim()).includes('auth') ? 'auth' : undefined;
  return { realm: out.realm, nonce: out.nonce, qop, opaque: out.opaque };
}

export function digestAuthorization(p: { user: string; password: string; method: string; uri: string; ch: DigestChallenge; cnonce: string; nc?: string }): string {
  const nc = p.nc ?? '00000001';
  const ha1 = md5Hex(`${p.user}:${p.ch.realm}:${p.password}`);
  const ha2 = md5Hex(`${p.method}:${p.uri}`);
  const response = p.ch.qop
    ? md5Hex(`${ha1}:${p.ch.nonce}:${nc}:${p.cnonce}:${p.ch.qop}:${ha2}`)
    : md5Hex(`${ha1}:${p.ch.nonce}:${ha2}`);
  const parts = [`username="${p.user}"`, `realm="${p.ch.realm}"`, `nonce="${p.ch.nonce}"`, `uri="${p.uri}"`];
  if (p.ch.qop) parts.push(`qop=${p.ch.qop}`, `nc=${nc}`, `cnonce="${p.cnonce}"`);
  parts.push(`response="${response}"`);
  if (p.ch.opaque) parts.push(`opaque="${p.ch.opaque}"`);
  return `Digest ${parts.join(', ')}`;
}

/** IPv4 de red local escrita a mano (con o sin "http://"). */
export function normalizeRokuIp(v: string): string | null {
  const s = v.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every((n) => Number(n) <= 255) ? s : null;
}

/** Lo que responde el Roku al instalar: texto corto para la persona. */
export function rokuInstallResult(status: number, body: string): { ok: boolean; text: string } {
  if (status === 401) return { ok: false, text: 'El Roku rechazó la contraseña de desarrollador.' };
  if (status !== 200) return { ok: false, text: `El Roku respondió ${status}.` };
  if (/identical to previous version/i.test(body)) return { ok: true, text: 'El Roku ya tenía esta versión.' };
  if (/install success|application received/i.test(body)) return { ok: true, text: 'Listo: el Roku se actualizó y abrió T-Max.' };
  if (/failure|error/i.test(body)) return { ok: false, text: 'El Roku no aceptó el archivo.' };
  return { ok: true, text: 'Enviado al Roku.' };
}
