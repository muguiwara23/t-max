// Actualizaciones sin servidor propio: el flujo "Publicar versión" deja un versions.json en el
// último Release del repositorio público. Aquí solo se lee ese archivo (una vez al día) — no se
// envía ningún dato. Android puede bajar e instalar el .apk; iPhone/iPad solo avisan; y desde el
// celular se puede mandar la versión nueva a un Roku de la misma red Wi-Fi.
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { APP_VERSION } from '../version';
import { getSetting, setSetting } from './db';
import { logEvent } from './diag';
import {
  digestAuthorization, isNewer, normalizeRokuIp, parseDigestChallenge, parseUpdateInfo, rokuInstallResult, shouldCheck, type UpdateInfo,
} from './update-model';

const LATEST = 'https://github.com/muguiwara23/t-max/releases/latest/download/versions.json';

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function cachedUpdate(): Promise<UpdateInfo | null> {
  const raw = await getSetting('updateInfo');
  if (!raw) return null;
  try {
    return parseUpdateInfo(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Revisa si salió una versión (máx. una vez al día salvo force). Devuelve lo último conocido. */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const last = Number((await getSetting('updateLastCheck')) ?? 0) || null;
  if (!force && !shouldCheck(last, Date.now())) return cachedUpdate();
  const r = await fetchWithTimeout(LATEST, { headers: { Accept: 'application/json' }, cache: 'no-store' }, 15000);
  await setSetting('updateLastCheck', String(Date.now()));
  if (r.status === 404) return null; // todavía no hay ninguna versión publicada
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const info = parseUpdateInfo(await r.json());
  if (info) await setSetting('updateInfo', JSON.stringify(info));
  return info;
}

export function hasAppUpdate(info: UpdateInfo | null): boolean {
  if (!isNewer(info, APP_VERSION)) return false;
  return Platform.OS === 'android' ? !!info!.android : !!(info!.ios || info!.page);
}

export async function dismissedVersion(): Promise<string | null> {
  return getSetting('updateDismissed');
}

export async function dismissUpdate(version: string): Promise<void> {
  await setSetting('updateDismissed', version);
}

/** Android: baja el .apk y abre el instalador del sistema (la persona solo toca "Instalar"). */
export async function installAndroidUpdate(info: UpdateInfo, onProgress: (pct: number) => void): Promise<void> {
  if (Platform.OS !== 'android' || !info.android) throw new Error('No hay archivo para Android en esta versión.');
  const dest = `${FileSystem.cacheDirectory}T-Max-${info.app}.apk`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  const dl = FileSystem.createDownloadResumable(info.android, dest, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100));
  });
  const res = await dl.downloadAsync();
  if (!res || res.status !== 200) throw new Error('No se pudo descargar la actualización.');
  const uri = await FileSystem.getContentUriAsync(res.uri);
  logEvent({ kind: 'info', msg: `Actualización ${info.app}: instalador abierto` });
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

// ---------- Enviar la versión nueva a un Roku de la misma red ----------

const ROKU_KEY = 'rokuPush';

export async function getRokuTarget(): Promise<{ ip: string; password: string }> {
  try {
    const v = JSON.parse((await SecureStore.getItemAsync(ROKU_KEY)) ?? '{}') as { ip?: string; password?: string };
    return { ip: v.ip ?? '', password: v.password ?? '' };
  } catch {
    return { ip: '', password: '' };
  }
}

export async function saveRokuTarget(ip: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(ROKU_KEY, JSON.stringify({ ip, password }));
}

/** Baja el .zip de Roku del último Release y lo sube al instalador de desarrollador del Roku. */
export async function pushToRoku(ipRaw: string, password: string, onStatus: (s: string) => void): Promise<{ ok: boolean; text: string }> {
  const ip = normalizeRokuIp(ipRaw);
  if (!ip) return { ok: false, text: 'Escribe la IP del Roku, por ejemplo 192.168.1.40.' };
  if (!password) return { ok: false, text: 'Escribe la contraseña de desarrollador del Roku.' };
  onStatus('Buscando la versión más reciente…');
  const info = await checkForUpdate(true);
  if (!info?.rokuZip) return { ok: false, text: 'Todavía no hay una versión de Roku publicada.' };
  onStatus(`Descargando T-Max ${info.roku} para Roku…`);
  const zip = `${FileSystem.cacheDirectory}T-Max-Roku-${info.roku}.zip`;
  const dl = await FileSystem.downloadAsync(info.rokuZip, zip);
  if (dl.status !== 200) return { ok: false, text: 'No se pudo descargar el archivo de Roku.' };

  onStatus('Conectando con el Roku…');
  const url = `http://${ip}/plugin_install`;
  let probe: Response;
  try {
    probe = await fetchWithTimeout(url, { method: 'GET' }, 8000);
  } catch {
    return { ok: false, text: 'No se encontró el Roku. Revisa la IP y que el celular esté en el mismo Wi-Fi.' };
  }
  const ch = parseDigestChallenge(probe.headers.get('www-authenticate'));
  if (!ch) return { ok: false, text: 'Ese aparato no parece un Roku en modo desarrollador.' };

  onStatus('Enviando al Roku…');
  const cnonce = Math.random().toString(16).slice(2, 10);
  const form = new FormData();
  form.append('mysubmit', 'Replace');
  form.append('archive', { uri: dl.uri, name: 'T-Max-Roku.zip', type: 'application/zip' } as unknown as Blob);
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { Authorization: digestAuthorization({ user: 'rokudev', password, method: 'POST', uri: '/plugin_install', ch, cnonce }) },
    body: form,
  }, 120000);
  const res = rokuInstallResult(r.status, await r.text());
  logEvent({ kind: 'info', msg: `Enviar a Roku: ${res.text}` });
  if (res.ok) await saveRokuTarget(ip, password);
  return res;
}
