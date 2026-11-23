// Motor del DVR: arranca y detiene las grabaciones programadas mientras T-Max está abierto.
// Cada grabación usa un reproductor oculto y sin sonido (una conexión más con el proveedor).
import type { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { activeRecordings, continueRecording, recoverInterrupted, updateRecording, type Recording } from '../data/dvr';
import { dvrTick } from '../data/dvr-model';
import { getChannelByKey, type ChannelItem } from '../data/queries';
import { listSources } from '../data/sources';
import { notifyNow } from '../platform/notify';
import Video, { type VideoHandle } from '../ui/Video';
import { offerToPlayer, ownedByPlayer, sourceInUse } from './bus';
import { startWriting, stopWriting, verifyOrFallback } from './record';

const MAX_PARALLEL = 2;
const TICK_MS = 10000;

interface Slot {
  rec: Recording;
  channel: ChannelItem;
}

export default function DvrEngine({ onChange }: { onChange: () => void }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const stoppers = useRef(new Map<string, (reason?: string) => Promise<void>>());
  const busy = useRef(false);
  const warned = useRef(new Set<string>());

  useEffect(() => {
    recoverInterrupted().then(onChange).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const now = Date.now();
        const { start, stop, missed } = dvrTick(await activeRecordings(), now);
        for (const r of missed) await updateRecording(r.id, { status: 'missed', error: 'T-Max no estaba abierto a esa hora.' });
        for (const r of stop) {
          if (ownedByPlayer.has(r.id)) continue; // la termina el reproductor
          const s = stoppers.current.get(r.id);
          if (s) await s();
          else await updateRecording(r.id, { status: 'failed', error: 'La grabación se interrumpió.' });
        }
        const running = new Set(slots.map((x) => x.rec.id));
        for (const r of start) {
          if (running.has(r.id) || ownedByPlayer.has(r.id)) continue;
          // Si estás viendo ese mismo canal a pantalla completa, graba ese reproductor (misma conexión).
          if (offerToPlayer(r)) continue;
          if (running.size >= MAX_PARALLEL) continue;
          // Proveedores de 1 conexión (Stalker casi siempre): no abrir otra mientras se ve algo de esa fuente.
          const src = (await listSources()).find((x) => x.id === r.source_id);
          const limit = src?.type === 'stalker' ? 1 : src?.account?.maxConnections ?? null;
          if (limit === 1 && sourceInUse(r.source_id)) {
            if (!warned.current.has(r.id)) {
              warned.current.add(r.id);
              await updateRecording(r.id, { error: 'Esperando: tu proveedor permite 1 conexión y está en uso. Abre ese canal o cierra el que estás viendo.' });
              await notifyNow(`Para grabar "${r.title}"`, `Tu proveedor permite 1 conexión: abre ${r.channel_name} o cierra el canal que estás viendo.`);
              onChange();
            }
            continue;
          }
          const channel = await getChannelByKey(r.channel_key);
          if (!channel) {
            await updateRecording(r.id, { status: 'failed', error: 'El canal ya no existe en tus fuentes.' });
            continue;
          }
          await updateRecording(r.id, { status: 'recording' });
          running.add(r.id);
          setSlots((l) => [...l, { rec: { ...r, status: 'recording' }, channel }]);
        }
        if (missed.length || stop.length || start.length) onChange();
      } finally {
        busy.current = false;
      }
    };
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS apaga el video de las apps en segundo plano: lo que se esté grabando se cierra bien antes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') {
        for (const s of stoppers.current.values()) void s('Se detuvo porque T-Max pasó a segundo plano.');
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (slots.length > 0) activateKeepAwakeAsync('dvr').catch(() => {});
    else deactivateKeepAwake('dvr');
  }, [slots.length]);

  return (
    <View style={styles.host} pointerEvents="none">
      {slots.map((s) => (
        <RecorderSlot
          key={s.rec.id}
          slot={s}
          register={(fn) => stoppers.current.set(s.rec.id, fn)}
          onDone={() => {
            stoppers.current.delete(s.rec.id);
            setSlots((l) => l.filter((x) => x.rec.id !== s.rec.id));
            onChange();
          }}
        />
      ))}
    </View>
  );
}

function RecorderSlot({ slot, register, onDone }: { slot: Slot; register: (stop: (reason?: string) => Promise<void>) => void; onDone: () => void }) {
  const video = useRef<VideoHandle>(null);
  const file = useRef<File | null>(null);
  const finished = useRef(false);
  const info = { channel_name: slot.rec.channel_name, title: slot.rec.title, start: slot.rec.start };
  const setProp = (n: string, v: string) => video.current?.setProp(n, v) ?? Promise.resolve();

  const stop = async (reason?: string) => {
    if (finished.current) return;
    finished.current = true;
    if (file.current) await stopWriting(slot.rec.id, setProp, reason);
    else await updateRecording(slot.rec.id, { status: 'failed', error: reason ?? 'El canal no llegó a abrir.' });
    onDone();
  };

  useEffect(() => {
    register(stop);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Si en 90 s no abre el canal, se da por fallida.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!file.current) void stop('El canal no abrió para grabar.');
    }, 90000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Video
      ref={video}
      channel={slot.channel}
      muted
      bare
      style={styles.hidden}
      onFatal={(msg) => void stop(msg)}
      onBeforeReconnect={async () => {
        // mpv reescribiría el archivo al reconectar: se cierra esta parte y el resto va en otra.
        if (!file.current || finished.current) return;
        await stop('Se cortó la señal; se guardó hasta aquí y el resto va en otra parte.');
        await continueRecording(slot.rec);
      }}
      onState={async (st) => {
        if (st !== 'playing' || file.current || finished.current) return;
        try {
          const f = await startWriting(setProp, info);
          file.current = f;
          await updateRecording(slot.rec.id, { file: f.uri });
          setTimeout(async () => {
            if (finished.current || !file.current) return;
            file.current = await verifyOrFallback(slot.rec.id, file.current, setProp, info);
          }, 12000);
        } catch (e) {
          void stop(e instanceof Error ? e.message : String(e));
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, bottom: 0, width: 16, height: 16, opacity: 0, overflow: 'hidden' },
  hidden: { width: 16, height: 16 },
});
