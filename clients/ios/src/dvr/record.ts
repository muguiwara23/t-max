// Pasos comunes para grabar con mpv (lo que estoy viendo o una grabación programada).
import type { File } from 'expo-file-system';

import { finalizeRecording, fsPath, newRecordingFile, recordContainer, recordingBytes, updateRecording } from '../data/dvr';

type SetProp = (name: string, value: string) => Promise<void>;

/** Empieza a escribir el flujo en un archivo nuevo. */
export async function startWriting(setProp: SetProp, info: { channel_name: string; title: string; start: number }): Promise<File> {
  const file = await newRecordingFile(info, await recordContainer());
  await setProp('stream-record', fsPath(file));
  return file;
}

/**
 * Si a los pocos segundos el MP4 sigue vacío (algunos canales no se pueden escribir como MP4),
 * se cambia a MKV, que acepta casi todo. Devuelve el archivo que queda grabando.
 */
export async function verifyOrFallback(id: string, file: File, setProp: SetProp, info: { channel_name: string; title: string; start: number }): Promise<File> {
  if (recordingBytes(file.uri) > 0) return file;
  if (!file.uri.toLowerCase().endsWith('.mp4')) return file;
  await setProp('stream-record', '');
  try {
    if (file.exists) file.delete();
  } catch {
    // nada
  }
  const mkv = await newRecordingFile(info, 'mkv');
  await setProp('stream-record', fsPath(mkv));
  await updateRecording(id, { file: mkv.uri, error: 'Este canal no se pudo grabar en MP4; se grabó en MKV (se queda en T-Max, no en Fotos).' });
  return mkv;
}

export async function stopWriting(id: string, setProp: SetProp, reason?: string): Promise<void> {
  await setProp('stream-record', '').catch(() => {});
  await finalizeRecording(id, { reason });
}
