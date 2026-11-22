// Quita credenciales de URLs y textos antes de mostrarlos o copiarlos.

export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  // /live/<user>/<pass>/  /movie/<user>/<pass>/  /series/<user>/<pass>/  /timeshift/<user>/<pass>/
  out = out.replace(/\/(live|movie|series|timeshift)\/[^/\s]+\/[^/\s]+\//gi, '/$1/***/***/');
  // ?username=...&password=...
  out = out.replace(/([?&](?:username|password|user|pass|token|play_token|mac)=)[^&\s]+/gi, '$1***');
  // usuario:contraseña@host
  out = out.replace(/(\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1***:***@');
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join('***');
  }
  return out;
}
