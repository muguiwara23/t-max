// Fila de datos técnicos del video (calidad, códec, audios, velocidad, búfer). Sin efectos.
import type { MediaInfo, ProgressEvent, TrackInfo } from 'expo-mpv';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { factChips, type StreamFacts } from '../data/stream-info';
import { colors, radius } from '../theme';
import { T } from './kit';

/**
 * Junta los datos: info del medio y pistas cada pocos segundos mientras se ve la barra,
 * y velocidad/búfer desde los eventos de progreso (se copian 1 vez por segundo para no redibujar de más).
 */
export function useStreamFacts(opts: {
  active: boolean;
  playing: boolean;
  key: string;
  media: () => Promise<MediaInfo | null>;
  tracks: () => Promise<TrackInfo[]>;
}): { facts: StreamFacts; onProgress: (e: ProgressEvent) => void } {
  const [facts, setFacts] = useState<StreamFacts>({});
  const live = useRef<{ rate?: number; buffered?: number }>({});

  useEffect(() => {
    setFacts({});
    live.current = {};
  }, [opts.key]);

  useEffect(() => {
    if (!opts.active || !opts.playing) return;
    let alive = true;
    const pull = async () => {
      const [m, t] = await Promise.all([opts.media().catch(() => null), opts.tracks().catch(() => [] as TrackInfo[])]);
      if (!alive) return;
      setFacts((f) => ({
        ...f,
        width: m?.width || f.width,
        height: m?.height || f.height,
        fps: m?.fps || f.fps,
        videoCodec: m?.videoCodec || f.videoCodec,
        isHdr: m?.isHdr,
        hdrFormat: m?.hdrFormat,
        audio: t.filter((x) => x.type === 'audio').map((x) => ({ lang: x.lang, title: x.title, selected: x.selected })),
        subs: t.filter((x) => x.type === 'sub').length,
        ...live.current,
      }));
    };
    pull();
    const a = setInterval(() => setFacts((f) => ({ ...f, ...live.current })), 1000);
    const b = setInterval(pull, 6000);
    return () => {
      alive = false;
      clearInterval(a);
      clearInterval(b);
    };
  }, [opts.active, opts.playing, opts.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onProgress = (e: ProgressEvent) => {
    live.current = { rate: e.bufferRate || live.current.rate, buffered: e.bufferedDuration };
  };
  return { facts, onProgress };
}

export default function StreamInfo({ facts, extra }: { facts: StreamFacts; extra?: string | null }) {
  const chips = factChips(facts);
  if (extra) chips.unshift({ text: extra });
  if (chips.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {chips.map((c, i) => (
        <View key={i} style={{ height: 24, paddingHorizontal: 9, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: c.strong ? colors.accentSoft : '#FFFFFF14' }}>
          <T kind="caption" weight="bold" color={c.strong ? colors.accent : colors.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>{c.text}</T>
        </View>
      ))}
    </View>
  );
}
