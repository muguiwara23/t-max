// Un solo cliente Stalker por fuente en toda la app (sincronización y reproducción).
// Si cada parte pidiera su propio token con la misma MAC, el portal invalidaría el anterior.
import { StalkerClient } from '@tmax/core';

import { fetchHttp } from '../platform/http';
import type { Source, SourceSecrets } from './sources';

const clients = new Map<string, { client: StalkerClient; sig: string }>();

export function stalkerFor(source: Source, secrets: SourceSecrets): StalkerClient {
  const sig = `${source.config.server ?? ''}|${secrets.mac ?? ''}|${source.config.timezone ?? ''}`;
  const hit = clients.get(source.id);
  if (hit && hit.sig === sig) return hit.client;
  const client = new StalkerClient(fetchHttp, { portalUrl: source.config.server ?? '', mac: secrets.mac ?? '', timezone: source.config.timezone });
  clients.set(source.id, { client, sig });
  return client;
}

export function forgetStalker(sourceId?: string): void {
  if (sourceId) clients.delete(sourceId);
  else clients.clear();
}
