// Credenciales en el Keychain del dispositivo (expo-secure-store). Nada sale del iPad.
import * as SecureStore from 'expo-secure-store';

import type { FormatPreference, XtreamCredentials } from './xtream';

const KEY_XTREAM = 'tmax.poc.xtream';
const KEY_DIRECT = 'tmax.poc.directUrl';
const KEY_FORMAT = 'tmax.poc.format';

export async function loadXtream(): Promise<XtreamCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_XTREAM);
    return raw ? (JSON.parse(raw) as XtreamCredentials) : null;
  } catch {
    return null;
  }
}

export async function saveXtream(c: XtreamCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY_XTREAM, JSON.stringify(c));
}

export async function loadDirectUrl(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(KEY_DIRECT)) ?? '';
  } catch {
    return '';
  }
}

export async function saveDirectUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_DIRECT, url);
}

export async function loadFormat(): Promise<FormatPreference> {
  try {
    const v = await SecureStore.getItemAsync(KEY_FORMAT);
    return v === 'ts' || v === 'm3u8' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export async function saveFormat(f: FormatPreference): Promise<void> {
  await SecureStore.setItemAsync(KEY_FORMAT, f);
}

export async function clearAll(): Promise<void> {
  await Promise.all([KEY_XTREAM, KEY_DIRECT, KEY_FORMAT].map((k) => SecureStore.deleteItemAsync(k)));
}
