// Contrato de red. El núcleo no hace peticiones por su cuenta: cada plataforma
// inyecta su implementación (fetch en iOS/web, roUrlTransfer en Roku, etc.).
// Las peticiones van directo del dispositivo a las fuentes del usuario: no hay servidores de T-Max.
import { AppError, httpError } from './errors.ts';
import { redact } from './redact.ts';

export interface HttpRequest {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** Cabeceras en minúsculas. */
  headers: Record<string, string>;
  text(): Promise<string>;
}

export interface HttpClient {
  get(req: HttpRequest): Promise<HttpResponse>;
}

/** Lee el cuerpo como JSON y convierte errores HTTP/formato en AppError. */
export async function getJson(http: HttpClient, req: HttpRequest, secrets: readonly string[] = []): Promise<unknown> {
  const res = await http.get(req);
  if (res.status < 200 || res.status >= 300) {
    throw httpError(res.status, redact(req.url, secrets));
  }
  const body = (await res.text()).trim();
  if (body === '') return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new AppError('PROVIDER_UNEXPECTED', 'La respuesta no es JSON: ' + redact(req.url, secrets));
  }
}
