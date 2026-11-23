// Reproductor a pantalla completa: canal anterior/siguiente, pausa, pistas, lista de canales encima del video.
import type { PlaybackState, TrackInfo } from 'expo-mpv';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { createManualRecording } from '../data/dvr';
import { startWriting, stopWriting, verifyOrFallback } from '../dvr/record';

import { hhmm, type ProgrammeRow } from '../data/mapping';
import { markWatched, programmesFor, type ChannelItem } from '../data/queries';
import { colors, radius } from '../theme';
import Icon from '../ui/Icon';
import { T } from '../ui/kit';
import Video, { type VideoHandle } from '../ui/Video';

interface Props {
  list: ChannelItem[];
  startIndex: number;
  /** Devuelve el canal que se estaba viendo al salir (puede no ser el inicial). */
  onClose: (last: ChannelItem) => void;
}

export default function PlayerScreen({ list, startIndex, onClose }: Props) {
  useKeepAwake();
  const video = useRef<VideoHandle>(null);
  const [index, setIndex] = useState(startIndex);
  const [overlay, setOverlay] = useState(true);
  const [panel, setPanel] = useState<'none' | 'channels' | 'audio' | 'subs'>('none');
  const [state, setState] = useState<PlaybackState>('idle');
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [progs, setProgs] = useState<ProgrammeRow[]>([]);
  const [startMs, setStartMs] = useState<{ ms: number; format: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = list[index]!;
  const [rec, setRec] = useState<{ id: string; file: File; at: number } | null>(null);
  const recRef = useRef(rec);
  recRef.current = rec;
  const setProp = (n: string, v: string) => video.current?.setProp(n, v) ?? Promise.resolve();

  const stopRec = useCallback(async (reason?: string) => {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    setRec(null);
    await stopWriting(r.id, setProp, reason);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRec = async () => {
    if (recRef.current) return;
    try {
      const title = progs.find((p) => p.start <= Date.now() && p.end > Date.now())?.title ?? channel.name;
      const info = { channel_name: channel.name, title, start: Date.now() };
      const file = await startWriting(setProp, info);
      const id = await createManualRecording(channel, title, file);
      setRec({ id, file, at: Date.now() });
      setTimeout(async () => {
        const r = recRef.current;
        if (r && r.id === id) {
          const f = await verifyOrFallback(id, r.file, setProp, info);
          if (recRef.current?.id === id) setRec({ ...r, file: f });
        }
      }, 12000);
    } catch (e) {
      Alert.alert('No se pudo grabar', e instanceof Error ? e.message : String(e));
    }
  };

  // Al salir de la app, cambiar de canal o cerrar: la grabación se cierra bien y pasa a Fotos.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') void stopRec('Se detuvo porque T-Max pasó a segundo plano.');
    });
    return () => {
      sub.remove();
      void stopRec();
    };
  }, [stopRec]);

  const poke = useCallback(() => {
    setOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay(false);
      setPanel('none');
    }, 6000);
  }, []);

  useEffect(() => {
    poke();
    setStartMs(null);
    setTracks([]);
    markWatched(channel.key).catch(() => {});
    programmesFor([channel], Date.now() - 3600000, Date.now() + 6 * 3600000).then((m) => setProgs(m.get(channel.key) ?? [])).catch(() => setProgs([]));
  }, [channel.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(t);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const go = (d: number) => {
    if (recRef.current) void stopRec();
    setIndex((i) => (i + d + list.length) % list.length);
  };
  const cur = progs.find((p) => p.start <= now && p.end > now);
  const next = progs.find((p) => p.start >= (cur?.end ?? now));
  const pct = cur ? Math.min(100, ((now - cur.start) / (cur.end - cur.start)) * 100) : 0;

  const openTracks = async (kind: 'audio' | 'subs') => {
    poke();
    setTracks((await video.current?.tracks()) ?? []);
    setPanel((p) => (p === kind ? 'none' : kind));
  };

  const audio = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');
  const label = (t: TrackInfo) => [t.title, t.lang, t.codec, t.channelCount ? `${t.channelCount}ch` : ''].filter(Boolean).join(' · ') || `Pista ${t.id}`;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Video
        ref={video}
        channel={channel}
        style={StyleSheet.absoluteFill}
        onState={setState}
        onStarted={(ms, format) => setStartMs({ ms, format })}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => (overlay ? (setOverlay(false), setPanel('none')) : poke())} />

      {overlay && (
        <>
          <View style={styles.topScrim} pointerEvents="none" />
          <View style={styles.bottomScrim} pointerEvents="none" />
          <View style={styles.top} pointerEvents="box-none">
            <Pressable accessibilityLabel="Volver" onPress={() => { void stopRec(); onClose(channel); }} style={styles.round}><Icon name="back" size={20} /></Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <T kind="title" weight="bold" lines={1}>{channel.number ?? ''} · {channel.name}</T>
              <T kind="label" color={colors.textSecondary}>
                {startMs ? `${startMs.format.toUpperCase()} · arranque ${startMs.ms} ms` : state === 'buffering' ? 'Cargando…' : ' '}
              </T>
            </View>
            {rec ? (
              <Pressable accessibilityLabel="Detener grabación" onPress={() => void stopRec()} style={[styles.pill, { backgroundColor: '#FF5A4E33' }]}>
                <View style={styles.liveDot} /><T kind="label" weight="bold">GRABANDO · detener</T>
              </Pressable>
            ) : (
              <View style={styles.pill}><View style={styles.liveDot} /><T kind="label" weight="bold">EN VIVO</T></View>
            )}
            <View style={styles.pill}><T weight="semibold" style={{ fontVariant: ['tabular-nums'] }}>{hhmm(now)}</T></View>
          </View>

          {panel === 'channels' && (
            <View style={styles.side}>
              <FlatList
                data={list}
                keyExtractor={(c) => c.key}
                initialScrollIndex={Math.max(0, index - 3)}
                getItemLayout={(_d, i) => ({ length: 58, offset: 58 * i, index: i })}
                renderItem={({ item, index: i }) => (
                  <Pressable onPress={() => { if (recRef.current && i !== index) void stopRec(); setIndex(i); poke(); }} style={[styles.sideRow, i === index && { backgroundColor: '#FFFFFF1F' }]}>
                    <T kind="label" color={colors.textSecondary} style={{ width: 34, textAlign: 'right' }}>{item.number ?? ''}</T>
                    <T weight={i === index ? 'bold' : 'medium'} lines={1} style={{ flex: 1 }}>{item.name}</T>
                  </Pressable>
                )}
              />
            </View>
          )}

          {(panel === 'audio' || panel === 'subs') && (
            <View style={styles.tracks}>
              <T kind="label" weight="bold" color={colors.textSecondary} style={{ marginBottom: 6 }}>{panel === 'audio' ? 'AUDIO' : 'SUBTÍTULOS'}</T>
              {panel === 'subs' && (
                <Pressable style={styles.trackRow} onPress={() => { video.current?.setSubtitle(null); setPanel('none'); }}>
                  <T weight={subs.some((s) => s.selected) ? 'medium' : 'bold'}>Ninguno</T>
                </Pressable>
              )}
              {(panel === 'audio' ? audio : subs).map((t) => (
                <Pressable key={t.id} style={styles.trackRow} onPress={() => { panel === 'audio' ? video.current?.setAudio(t.id) : video.current?.setSubtitle(t.id); setPanel('none'); }}>
                  <T weight={t.selected ? 'bold' : 'medium'} color={t.selected ? colors.accent : colors.text}>{label(t)}</T>
                </Pressable>
              ))}
              {(panel === 'audio' ? audio : subs).length === 0 && <T color={colors.textSecondary}>Este canal no tiene {panel === 'audio' ? 'otras pistas de audio' : 'subtítulos'}.</T>}
            </View>
          )}

          <View style={styles.bottom}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 24 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <T kind="label" color={colors.textSecondary}>{cur ? `AHORA · ${hhmm(cur.start)} – ${hhmm(cur.end)}` : 'Sin información de guía'}</T>
                <T kind="title" weight="bold" lines={1}>{cur?.title ?? channel.name}</T>
              </View>
              {next && (
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T kind="label" color={colors.textSecondary}>A continuación · {hhmm(next.start)}</T>
                  <T weight="semibold" lines={1}>{next.title}</T>
                </View>
              )}
            </View>
            {cur && <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>}
            <View style={styles.controls}>
              <Ctl icon="subtitles" label="Subtítulos" onPress={() => openTracks('subs')} />
              <Ctl icon="audio" label="Audio" onPress={() => openTracks('audio')} />
              <View style={{ width: 16 }} />
              <Ctl icon="prev" label="Canal anterior" big onPress={() => { go(-1); poke(); }} />
              <Pressable accessibilityLabel={state === 'paused' ? 'Reproducir' : 'Pausa'} style={styles.playBtn}
                onPress={() => { state === 'paused' ? video.current?.play() : video.current?.pause(); poke(); }}>
                <Icon name={state === 'paused' ? 'play' : 'pause'} size={28} color={colors.onAccent} />
              </Pressable>
              <Ctl icon="next" label="Canal siguiente" big onPress={() => { go(1); poke(); }} />
              <View style={{ width: 16 }} />
              <Ctl icon="list" label="Lista de canales" onPress={() => { setPanel((p) => (p === 'channels' ? 'none' : 'channels')); poke(); }} />
              <Ctl icon="dvr" label={rec ? 'Detener grabación' : 'Grabar'} active={!!rec} onPress={() => { rec ? void stopRec() : void startRec(); poke(); }} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Ctl({ icon, label, onPress, big, active }: { icon: 'subtitles' | 'audio' | 'prev' | 'next' | 'list' | 'dvr'; label: string; onPress: () => void; big?: boolean; active?: boolean }) {
  const s = big ? 60 : 52;
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={[styles.ctl, { width: s, height: s, borderRadius: s / 2 }, active && { backgroundColor: colors.live }]}>
      <Icon name={icon} size={big ? 24 : 22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 170, backgroundColor: '#00000080' },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 280, backgroundColor: '#00000066' },
  top: { position: 'absolute', left: 24, right: 24, top: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.overlayPanel, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.overlayPanel, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  side: { position: 'absolute', left: 24, top: 96, bottom: 270, width: 340, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, paddingVertical: 10, paddingHorizontal: 8 },
  sideRow: { height: 56, marginBottom: 2, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
  tracks: { position: 'absolute', right: 24, bottom: 270, width: 360, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, padding: 16, gap: 4 },
  trackRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, borderRadius: radius.sm },
  bottom: { position: 'absolute', left: 24, right: 24, bottom: 24, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, paddingHorizontal: 24, paddingVertical: 20, gap: 14 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#34394380', overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.accent },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ctl: { backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
