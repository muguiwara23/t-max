// HttpClient de iOS para el núcleo: fetch nativo, directo del iPad a las fuentes del usuario.
import type { HttpClient, HttpRequest, HttpResponse } from '@tmax/core';
import { AppError } from '@tmax/core';

export const fetchHttp: HttpClient = {
  async get(req: HttpRequest): Promise<HttpResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 30000);
    try {
      const res = await fetch(req.url, { headers: req.headers, signal: ctrl.signal });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { status: res.status, headers, text: () => res.text() };
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') throw new AppError('NET_TIMEOUT', 'El servidor no respondió a tiempo.');
      throw new AppError('NET_OFFLINE', 'No se pudo conectar con el servidor.');
    } finally {
      clearTimeout(timer);
    }
  },
};
