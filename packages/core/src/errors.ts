// Errores estables, alineados con contracts/json-schema/app-error.schema.json.
// `detail` nunca debe contener secretos: siempre pasa por redact() antes de crearse.

export type AppErrorCode =
  | 'NET_DNS'
  | 'NET_TIMEOUT'
  | 'NET_OFFLINE'
  | 'NET_TLS'
  | 'NET_TOO_MANY_REDIRECTS'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'AUTH_MAX_CONNECTIONS'
  | 'CORS_BLOCKED'
  | 'HEADER_FORBIDDEN'
  | 'PARSE_M3U_INVALID'
  | 'PARSE_XMLTV_INVALID'
  | 'PARSE_TOO_LARGE'
  | 'PROVIDER_UNEXPECTED'
  | 'PLAY_UNSUPPORTED_CONTAINER'
  | 'PLAY_UNSUPPORTED_CODEC'
  | 'PLAY_DRM'
  | 'PLAY_DECODER'
  | 'PLAY_STREAM_ENDED'
  | 'STORAGE_QUOTA'
  | 'STORAGE_UNAVAILABLE'
  | 'UNKNOWN';

const RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'NET_DNS',
  'NET_TIMEOUT',
  'NET_OFFLINE',
  'HTTP_5XX',
  'AUTH_MAX_CONNECTIONS',
]);

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly messageKey: string;
  readonly httpStatus: number | undefined;
  readonly detail: string | undefined;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, detail?: string, httpStatus?: number) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AppError';
    this.code = code;
    this.messageKey = 'errors.' + code.toLowerCase();
    this.httpStatus = httpStatus;
    this.detail = detail;
    this.retryable = RETRYABLE.has(code);
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { code: this.code, messageKey: this.messageKey, retryable: this.retryable };
    if (this.httpStatus !== undefined) out.httpStatus = this.httpStatus;
    if (this.detail !== undefined) out.detail = this.detail;
    return out;
  }
}

export function httpError(status: number, detail?: string): AppError {
  if (status === 401 || status === 403) return new AppError('AUTH_INVALID', detail, status);
  if (status >= 500) return new AppError('HTTP_5XX', detail, status);
  return new AppError('HTTP_4XX', detail, status);
}
