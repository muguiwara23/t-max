// Reproductor de T-Max TV (paso 1: base). Arriba/Abajo cambian de canal, OK muestra la info,
// Atrás regresa al inicio. Los gestos completos (lista con OK, grupos con izquierda, números…)
// llegan en el paso 2 sobre esta misma pantalla.
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, useTVEventHandler, View } from 'react-native';

import { hhmm, type ProgrammeRow } from '@shared/data/mapping';
import { markWatched, programmesFor, type ChannelItem } from '@shared/data/queries';
import { colors, radius } from '@shared/theme';
import { T } from '@shared/ui/kit';
import Video from '@shared/ui/Video';

export default function TvPlayer({ list, startIndex, onClose }: { list: ChannelItem[]; startIndex: number; onClose: (last: ChannelItem) => void }) {
  useKeepAwake();
  const [index, setIndex] = useState(startIndex);
  const [info, setInfo] = useState(true);
  const [progs, setProgs] = useState<ProgrammeRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = list[index]!;

  const showInfo = () => {
    setInfo(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setInfo(false), 5000);
  };

  useEffect(() => {
    showInfo();
    markWatched(channel.key).catch(() => {});
    const t = Date.now();
    programmesFor([channel], t - 4 * 3600000, t + 6 * 3600000).then((m) => setProgs(m.get(channel.key) ?? [])).catch(() => setProgs([]));
  }, [channel.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose(channel);
      return true;
    });
    return () => {
      clearInterval(t);
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  useTVEventHandler((e) => {
    if (e.eventType === 'up') setIndex((i) => (i - 1 + list.length) % list.length);
    else if (e.eventType === 'down') setIndex((i) => (i + 1) % list.length);
    else if (e.eventType === 'select' || e.eventType === 'left' || e.eventType === 'right') showInfo();
  });

  const cur = progs.find((p) => p.start <= now && p.end > now);
  const next = progs.find((p) => p.start >= (cur?.end ?? now));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Video channel={channel} style={StyleSheet.absoluteFill} />
      {info && (
        <View style={styles.bottom} pointerEvents="none">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T kind="title" weight="bold" style={{ flex: 1 }} lines={1}>{channel.number ?? ''} · {channel.name}</T>
            <View style={styles.live}><View style={styles.dot} /><T kind="caption" weight="bold">EN VIVO</T></View>
            <T kind="title" weight="semibold">{hhmm(now)}</T>
          </View>
          {cur ? (
            <>
              <T kind="label" color={colors.textSecondary}>AHORA · {hhmm(cur.start)} – {hhmm(cur.end)}</T>
              <T kind="title" weight="bold" lines={1}>{cur.title}</T>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, ((now - cur.start) / (cur.end - cur.start)) * 100))}%` }]} /></View>
            </>
          ) : (
            <T color={colors.textSecondary}>Sin información de guía</T>
          )}
          {next ? <T kind="label" color={colors.textSecondary} lines={1}>Después · {hhmm(next.start)}  {next.title}</T> : null}
          <T kind="caption" color={colors.textTertiary}>Arriba/Abajo = cambiar canal · OK = info · Atrás = salir</T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { position: 'absolute', left: 32, right: 32, bottom: 28, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, padding: 20, gap: 6 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 28, borderRadius: radius.pill, backgroundColor: '#FF5A4E33' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.hover, overflow: 'hidden' },
  barFill: { height: 5, backgroundColor: colors.accent },
});
