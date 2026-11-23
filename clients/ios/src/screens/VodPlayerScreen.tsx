// Reproductor de películas y episodios: barra de tiempo, saltos, pistas, siguiente episodio y avance guardado en el iPad.
import { ExpoMpvView, type ExpoMpvViewRef, type PlaybackState, type TrackInfo } from 'expo-mpv';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { redact } from '@tmax/core';

import { settingsFor, subPropsFor } from '../data/prefs';
import { playUrl, saveProgress, userVodFor, type VodPlayItem, type VodPlayRequest } from '../data/vod';
import { clock, resumeFrom } from '../data/vod-mapping';
import { colors, radius } from '../theme';
import Icon, { type IconName } from '../ui/Icon';
import { Button, T } from '../ui/kit';
import StreamInfo, { useStreamFacts } from '../ui/StreamInfo';

interface Props {
  request: VodPlayRequest;
  onClose: () => void;
}

const SAVE_EVERY_MS = 10000;

/**
 * Ajustes de mpv para películas/series por HTTP:
 * - hr-seek=no: saltar al cuadro clave más cercano (mucho más rápido que el salto exacto por red).
 * - caché grande hacia adelante y algo hacia atrás: los saltos cortos caen dentro de lo ya descargado.
 * - cache-pause-wait: cuando se vacía, juntar unos segundos antes de seguir (menos cortes seguidos).
 * - reconnect: si el servidor corta la conexión, ffmpeg la reabre en el mismo punto.
 */
const VOD_MPV_OPTIONS: [string, string][] = [
  ['network-timeout', '30'],
  ['user-agent', 'libmpv'],
  ['hr-seek', 'no'],
  ['cache', 'yes'],
  ['demuxer-max-bytes', '256MiB'],
  ['demuxer-max-back-bytes', '64MiB'],
  ['demuxer-readahead-secs', '300'],
  ['cache-pause-wait', '4'],
  ['stream-lavf-o', 'reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=5'],
];

export default function VodPlayerScreen({ request, onClose }: Props) {
  useKeepAwake();
  const mpv = useRef<ExpoMpvViewRef>(null);
  const [index, setIndex] = useState(request.index);
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [start, setStart] = useState<number | undefined>(request.startAt ?? undefined);
  const [state, setState] = useState<PlaybackState>('idle');
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [bufPct, setBufPct] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(true);
  const [panel, setPanel] = useState<'none' | 'audio' | 'subs'>('none');
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [scrub, setScrub] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const item = request.queue[index]!;
  const next = request.queue[index + 1];

  // Valores vivos para guardar sin depender de cierres viejos.
  const live = useRef({ pos: 0, dur: 0, item, lastSave: 0 });
  live.current.item = item;

  const save = useCallback(async (ended = false) => {
    const { pos: p, dur: d, item: it } = live.current;
    if (!ended && p < 5) return;
    live.current.lastSave = Date.now();
    await saveProgress({
      key: it.key,
      kind: it.kind,
      position: ended ? d : p,
      duration: d || it.durationSec || 0,
      parentKey: it.parentKey,
      title: it.title,
      subtitle: it.subtitle,
      poster: it.poster,
      ended,
    }).catch(() => {});
  }, []);

  // Cargar el elemento actual: URL directa al servidor del usuario y, si es otro episodio, su avance previo.
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    setError(null);
    setPos(0);
    setDur(0);
    setTracks([]);
    live.current.pos = 0;
    live.current.dur = 0;
    (async () => {
      const u = await playUrl(item);
      let from: number | undefined = undefined;
      if (index === request.index && attempt === 0) from = request.startAt ?? undefined;
      else if (attempt > 0) from = live.current.pos > 5 ? live.current.pos : start;
      else {
        const prev = (await userVodFor([item.key])).get(item.key);
        from = resumeFrom(prev?.position, prev?.duration) ?? undefined;
      }
      if (!alive) return;
      const m = mpv.current;
      for (const [k, v] of VOD_MPV_OPTIONS) await m?.setPropertyString(k, v).catch(() => {});
      for (const [k, v] of await subPropsFor(item.sourceId).catch(() => [])) await m?.setPropertyString(k, v).catch(() => {});
      const ua = (await settingsFor(item.sourceId).catch(() => ({ userAgent: '' }))).userAgent;
      if (ua) await m?.setPropertyString('user-agent', ua).catch(() => {});
      setStart(from);
      setUrl(u);
    })().catch((e) => alive && setError(redact(e instanceof Error ? e.message : String(e))));
    return () => {
      alive = false;
    };
  }, [item.key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardar al salir.
  useEffect(() => () => void save(), [save]);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = useCallback(() => {
    setOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay(false);
      setPanel('none');
    }, 5000);
  }, []);
  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poke]);

  const close = async () => {
    await save();
    onClose();
  };

  const goNext = async () => {
    if (!next) return;
    await save();
    setAttempt(0);
    setIndex((i) => i + 1);
    poke();
  };

  const seekTo = (sec: number) => {
    const d = live.current.dur;
    const t = Math.max(0, d > 0 ? Math.min(d - 2, sec) : sec);
    mpv.current?.seekTo(t).catch(() => {});
    setPos(t);
    live.current.pos = t;
    poke();
  };
  const seekBy = (delta: number) => seekTo(live.current.pos + delta);

  const openTracks = async (kind: 'audio' | 'subs') => {
    poke();
    setTracks((await mpv.current?.getTrackList()) ?? []);
    setPanel((p) => (p === kind ? 'none' : kind));
  };
  const audio = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');
  const label = (t: TrackInfo) => [t.title, t.lang, t.codec, t.channelCount ? `${t.channelCount}ch` : ''].filter(Boolean).join(' · ') || `Pista ${t.id}`;

  // Barra de tiempo: tocar o arrastrar.
  const barWidth = useRef(1);
  const barX = (x: number) => Math.max(0, Math.min(1, x / barWidth.current)) * live.current.dur;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.dur > 0,
      onMoveShouldSetPanResponder: () => live.current.dur > 0,
      onPanResponderGrant: (e) => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setScrub(barX(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => setScrub(barX(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const t = barX(e.nativeEvent.locationX);
        setScrub(null);
        seekTo(t);
      },
      onPanResponderTerminate: () => setScrub(null),
    }),
  ).current;

  const { facts, onProgress: factsProgress } = useStreamFacts({
    active: overlay,
    playing: state === 'playing' || state === 'paused' || state === 'buffering',
    key: `${item.key}#${attempt}`,
    media: async () => (await mpv.current?.getMediaInfo().catch(() => null)) ?? null,
    tracks: async () => (await mpv.current?.getTrackList().catch(() => [])) ?? [],
  });

  const shown = scrub ?? pos;
  const pct = dur > 0 ? (shown / dur) * 100 : 0;
  const busy = !error && (state === 'loading' || state === 'buffering' || state === 'idle');

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <ExpoMpvView
        key={`${item.key}#${attempt}`}
        ref={mpv}
        style={StyleSheet.absoluteFill}
        source={url}
        startPosition={start}
        metadata={{ title: item.subtitle ? `${item.title} · ${item.subtitle}` : item.title, artwork: item.poster ?? undefined }}
        onPlaybackStateChange={({ nativeEvent }) => {
          setState(nativeEvent.state);
          if (nativeEvent.state === 'paused') void save();
          if (nativeEvent.state === 'paused' || nativeEvent.state === 'ended') setOverlay(true);
        }}
        onProgress={({ nativeEvent }) => {
          factsProgress(nativeEvent);
          live.current.pos = nativeEvent.position;
          if (nativeEvent.duration > 0) live.current.dur = nativeEvent.duration;
          setPos(nativeEvent.position);
          setBuffered(nativeEvent.bufferedPosition || 0);
          setBufPct(nativeEvent.bufferingPercent ?? 100);
          if (nativeEvent.duration > 0) setDur(nativeEvent.duration);
          if (Date.now() - live.current.lastSave > SAVE_EVERY_MS) void save();
        }}
        onEnd={({ nativeEvent }) => {
          if (nativeEvent.reason !== 'ended') return;
          void save(true).then(() => {
            if (next) {
              setAttempt(0);
              setIndex((i) => i + 1);
            } else onClose();
          });
        }}
        onError={({ nativeEvent }) => {
          const code = /-?\d+/.exec(nativeEvent.error)?.[0];
          setError(`No se pudo abrir el video.${code ? ` (mpv ${code})` : ''}`);
          setOverlay(true);
        }}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => (overlay ? (setOverlay(false), setPanel('none')) : poke())} />

      {(busy || error) && (
        <View style={styles.center} pointerEvents="box-none">
          <T weight="semibold" color={error ? colors.danger : colors.textSecondary}>{error ?? (state === 'buffering' ? `Cargando…${bufPct < 100 ? ` ${Math.round(bufPct)} %` : ''}` : 'Conectando…')}</T>
          {error && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Button variant="primary" icon="refresh" label="Reintentar" onPress={() => setAttempt((a) => a + 1)} />
              <Button label="Cerrar" onPress={onClose} />
            </View>
          )}
        </View>
      )}

      {overlay && (
        <>
          <View style={styles.topScrim} pointerEvents="none" />
          <View style={styles.bottomScrim} pointerEvents="none" />
          <View style={styles.top} pointerEvents="box-none">
            <Pressable accessibilityLabel="Volver" onPress={close} style={styles.round}><Icon name="back" size={20} /></Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <T kind="title" weight="bold" lines={1}>{item.title}</T>
              {item.subtitle ? <T kind="label" color={colors.textSecondary} lines={1}>{item.subtitle}</T> : null}
              <StreamInfo facts={{ ...facts, format: item.ext ?? (item.localUrl ? item.localUrl.split('.').pop() : undefined) }} />
            </View>
          </View>

          {(panel === 'audio' || panel === 'subs') && (
            <View style={styles.tracks}>
              <T kind="label" weight="bold" color={colors.textSecondary} style={{ marginBottom: 6 }}>{panel === 'audio' ? 'AUDIO' : 'SUBTÍTULOS'}</T>
              {panel === 'subs' && (
                <Pressable style={styles.trackRow} onPress={() => { mpv.current?.setPropertyString('sid', 'no'); setPanel('none'); }}>
                  <T weight={subs.some((s) => s.selected) ? 'medium' : 'bold'}>Ninguno</T>
                </Pressable>
              )}
              {(panel === 'audio' ? audio : subs).map((t) => (
                <Pressable key={t.id} style={styles.trackRow} onPress={() => { panel === 'audio' ? mpv.current?.setAudioTrack(t.id) : mpv.current?.setSubtitleTrack(t.id); setPanel('none'); }}>
                  <T weight={t.selected ? 'bold' : 'medium'} color={t.selected ? colors.accent : colors.text}>{label(t)}</T>
                </Pressable>
              ))}
              {(panel === 'audio' ? audio : subs).length === 0 && <T color={colors.textSecondary}>Este video no tiene {panel === 'audio' ? 'otras pistas de audio' : 'subtítulos'}.</T>}
            </View>
          )}

          <View style={styles.bottom}>
            <View style={styles.timeRow}>
              <T kind="label" weight="semibold" style={styles.time}>{clock(shown)}</T>
              <View
                style={styles.barHit}
                onLayout={(e: LayoutChangeEvent) => (barWidth.current = Math.max(1, e.nativeEvent.layout.width))}
                {...pan.panHandlers}
              >
                <View style={styles.bar} pointerEvents="none">
                  {dur > 0 && buffered > 0 ? <View style={[styles.barBuf, { width: `${Math.min(100, (buffered / dur) * 100)}%` }]} /> : null}
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <View style={[styles.knob, { left: `${pct}%` }]} pointerEvents="none" />
              </View>
              <T kind="label" weight="semibold" style={styles.time}>{dur > 0 ? `-${clock(dur - shown)}` : '--:--'}</T>
            </View>
            <View style={styles.controls}>
              <Ctl icon="subtitles" label="Subtítulos" onPress={() => openTracks('subs')} />
              <Ctl icon="audio" label="Audio" onPress={() => openTracks('audio')} />
              <View style={{ width: 16 }} />
              <Ctl icon="replay" label="Atrás 10 segundos" caption="10" big onPress={() => seekBy(-10)} />
              <Pressable accessibilityLabel={state === 'paused' ? 'Reproducir' : 'Pausa'} style={styles.playBtn}
                onPress={() => { state === 'paused' ? mpv.current?.play() : mpv.current?.pause(); poke(); }}>
                <Icon name={state === 'paused' ? 'play' : 'pause'} size={28} color={colors.onAccent} />
              </Pressable>
              <Ctl icon="forward" label="Adelante 30 segundos" caption="30" big onPress={() => seekBy(30)} />
              <View style={{ width: 16 }} />
              {next ? (
                <Pressable accessibilityLabel="Siguiente episodio" onPress={goNext} style={styles.nextBtn}>
                  <Icon name="skipNext" size={18} />
                  <View>
                    <T kind="caption" color={colors.textSecondary}>Siguiente</T>
                    <T kind="label" weight="bold" lines={1} style={{ maxWidth: 160 }}>{next.subtitle ?? next.title}</T>
                  </View>
                </Pressable>
              ) : (
                <View style={{ width: 104 }} />
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Ctl({ icon, label, onPress, big, caption }: { icon: IconName; label: string; onPress: () => void; big?: boolean; caption?: string }) {
  const s = big ? 60 : 52;
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={[styles.ctl, { width: s, height: s, borderRadius: s / 2 }]}>
      <Icon name={icon} size={big ? 26 : 22} />
      {caption ? <T kind="caption" weight="bold" style={styles.ctlCaption}>{caption}</T> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 140, backgroundColor: '#00000080' },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, backgroundColor: '#00000066' },
  top: { position: 'absolute', left: 24, right: 24, top: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.overlayPanel, alignItems: 'center', justifyContent: 'center' },
  tracks: { position: 'absolute', right: 24, bottom: 200, width: 360, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, padding: 16, gap: 4 },
  trackRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, borderRadius: radius.sm },
  bottom: { position: 'absolute', left: 24, right: 24, bottom: 24, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, paddingHorizontal: 24, paddingVertical: 18, gap: 14 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  time: { width: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
  barHit: { flex: 1, height: 36, justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#34394399', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, height: 6, backgroundColor: colors.accent },
  barBuf: { position: 'absolute', left: 0, top: 0, height: 6, backgroundColor: '#A4AAB466' },
  knob: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9, backgroundColor: colors.accent, top: 9 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ctl: { backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  ctlCaption: { position: 'absolute', bottom: 6, fontSize: 9, lineHeight: 10 },
  playBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  nextBtn: { height: 52, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: '#FFFFFF14', flexDirection: 'row', alignItems: 'center', gap: 10 },
});
