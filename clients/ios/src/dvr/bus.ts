// Coordinación entre reproductores y DVR dentro de la app (sin red): quién usa qué conexión
// y si el reproductor a pantalla completa puede encargarse de una grabación programada.
import type { Recording } from '../data/dvr';

type PlayerHandler = (rec: Recording) => boolean;

let playerHandler: PlayerHandler | null = null;
/** Grabaciones programadas que está haciendo el reproductor (no el motor oculto). */
export const ownedByPlayer = new Set<string>();
/** Reproductores visibles con su canal: clave → { fuente, canal }. */
const inUse = new Map<string, { sourceId: string; channelKey: string }>();

export function setPlayerRecorder(h: PlayerHandler | null): void {
  playerHandler = h;
}

/** El reproductor graba si está viendo justo ese canal (misma conexión). */
export function offerToPlayer(rec: Recording): boolean {
  if (playerHandler && playerHandler(rec)) {
    ownedByPlayer.add(rec.id);
    return true;
  }
  return false;
}

export function releaseFromPlayer(id: string): void {
  ownedByPlayer.delete(id);
}

export function markInUse(token: string, sourceId: string, channelKey: string): void {
  inUse.set(token, { sourceId, channelKey });
}

export function unmarkInUse(token: string): void {
  inUse.delete(token);
}

/** ¿Algún reproductor visible está usando una conexión de esta fuente? */
export function sourceInUse(sourceId: string): boolean {
  for (const v of inUse.values()) if (v.sourceId === sourceId) return true;
  return false;
}
