import { readFileSync } from 'node:fs';
import type { HttpClient, HttpRequest, HttpResponse } from '../src/http.ts';

const FIX = new URL('../../../contracts/fixtures/', import.meta.url);

export function fixtureText(path: string): string {
  return readFileSync(new URL(path, FIX), 'utf8');
}

export function fixtureJson(path: string): unknown {
  return JSON.parse(fixtureText(path));
}

/** Divide un texto en trozos de tamaño variable para probar el modo streaming. */
export function chunks(text: string, sizes: number[] = [1, 7, 13, 64, 3]): string[] {
  const out: string[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const n = sizes[k++ % sizes.length]!;
    out.push(text.slice(i, i + n));
    i += n;
  }
  return out;
}

/** HttpClient falso: responde según una función y guarda cada petición. */
export function fakeHttp(route: (req: HttpRequest) => { status?: number; body: unknown } | undefined): HttpClient & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    async get(req: HttpRequest): Promise<HttpResponse> {
      calls.push(req);
      const r = route(req);
      if (!r) return { status: 404, headers: {}, text: async () => 'not found' };
      const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      return { status: r.status ?? 200, headers: { 'content-type': 'application/json' }, text: async () => body };
    },
  };
}

export function query(url: string): Record<string, string> {
  const q = url.split('?')[1] ?? '';
  const out: Record<string, string> = {};
  for (const part of q.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k!)] = decodeURIComponent(v);
  }
  return out;
}
