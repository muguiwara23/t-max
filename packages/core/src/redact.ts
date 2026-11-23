// Quita credenciales de URLs, cabeceras y textos antes de registrarlos o mostrarlos.

const PATH_CREDS = /\/(live|movie|series|timeshift)\/[^/\s?#]+\/[^/\s?#]+\//gi;
const QUERY_CREDS = /([?&](?:username|password|user|pass|token|play_token|mac|sn|device_id|device_id2|signature|api_key)=)[^&\s#]+/gi;
const USERINFO = /(\/\/)[^/\s:@]+:[^/\s@]+@/g;
const MAC = /\b([0-9A-Fa-f]{2})[:-]([0-9A-Fa-f]{2})[:-]([0-9A-Fa-f]{2})[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}\b/g;
const MAC_ENCODED = /\b([0-9A-Fa-f]{2})%3A([0-9A-Fa-f]{2})%3A([0-9A-Fa-f]{2})(?:%3A[0-9A-Fa-f]{2}){3}\b/gi;

export function maskMac(mac: string): string {
  const parts = mac.split(/[:-]/);
  if (parts.length !== 6) return '**:**:**:**:**:**';
  return `${parts[0]}:${parts[1]}:${parts[2]}:**:**:**`;
}

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text
    .replace(PATH_CREDS, '/$1/***/***/')
    .replace(QUERY_CREDS, '$1***')
    .replace(USERINFO, '$1***:***@')
    .replace(MAC, '$1:$2:$3:**:**:**')
    .replace(MAC_ENCODED, '$1%3A$2%3A$3%3A**%3A**%3A**');
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join('***');
  }
  return out;
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'sn']);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '***' : v;
  }
  return out;
}
