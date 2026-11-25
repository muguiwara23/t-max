// Reproductor a pantalla completa: canal anterior/siguiente, pausa, pistas, lista de canales encima del video.
import type { PlaybackState, TrackInfo } from 'expo-mpv';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';

import Pressable from '../ui/Press';

import { createManualRecording, scheduleRecording, updateRecording } from '../data/dvr';
import { PAD_AFTER_MS } from '../data/dvr-model';
import { addReminder } from '../data/reminders';
import { releaseFromPlayer, setPlayerRecorder } from '../dvr/bus';
import { startWriting, stopWriting, verifyOrFallback } from '../dvr/record';
import StreamInfo, { useStreamFacts } from '../ui/StreamInfo';
import { useBack } from '../ui/back';
import { useIsCompact } from '../ui/layout';

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
  /** Empezar a grabar en cuanto abra (desde "Grabar" en la ficha de TV en vivo). */
  autoRecord?: { until: number | null } | null;
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export default function PlayerScreen({ list, startIndex, onClose, autoRecord }: Props) {
  useKeepAwake();
  const compact = useIsCompact();
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
  const [rec, setRec] = useState<{ id: string; file: File; at: number; until: number | null } | null>(null);
  const recRef = useRef(rec);
  recRef.current = rec;
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const progsRef = useRef<ProgrammeRow[]>([]);
  const setProp = (n: string, v: string) => video.current?.setProp(n, v) ?? Promise.resolve();

  const stopRec = useCallback(async (reason?: string) => {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    setRec(null);
    await stopWriting(r.id, setProp, reason);
    releaseFromPlayer(r.id);
    // Volver al búfer normal de TV en vivo (menos retraso).
    await setProp('cache-pause-wait', '1').catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Graba en este mismo reproductor (misma conexión). until = hora de fin (null = hasta que lo detengas). */
  const startRec = async (opts: { until?: number | null; title?: string; recId?: string } = {}) => {
    if (recRef.current) return;
    try {
      const ch = channelRef.current;
      const nowMs = Date.now();
      const title = opts.title ?? progsRef.current.find((p) => p.start <= nowMs && p.end > nowMs)?.title ?? ch.name;
      const info = { channel_name: ch.name, title, start: nowMs };
      // Al grabar, juntar unos segundos antes de seguir si se vacía el búfer: menos cortes seguidos.
      await setProp('cache-pause-wait', '3').catch(() => {});
      const file = await startWriting(setProp, info);
      const id = opts.recId ?? (await createManualRecording(ch, title, file));
      if (opts.recId) await updateRecording(opts.recId, { file: file.uri, status: 'recording' });
      setRec({ id, file, at: nowMs, until: opts.until ?? null });
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
  // Fin automático: al terminar el programa (más un margen).
  useEffect(() => {
    if (!rec?.until) return;
    const t = setInterval(() => {
      const r = recRef.current;
      if (r?.until && Date.now() >= r.until + PAD_AFTER_MS) void stopRec();
    }, 5000);
    return () => clearInterval(t);
  }, [rec?.id, rec?.until, stopRec]);

  // Si toca una grabación programada de este mismo canal, la hace este reproductor (no abre otra conexión).
  useEffect(() => {
    setPlayerRecorder((r) => {
      if (recRef.current || r.channel_key !== channelRef.current.key) return false;
      void startRec({ until: r.end, title: r.title, recId: r.id });
      return true;
    });
    return () => setPlayerRecorder(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grabar en cuanto empiece a verse (viene de "Grabar" en TV en vivo), o seguir tras un corte de señal.
  const autoStarted = useRef(false);
  const resumeRec = useRef<{ until: number | null; title: string } | null>(null);
  useEffect(() => {
    if (state !== 'playing') return;
    if (autoRecord && !autoStarted.current) {
      autoStarted.current = true;
      void startRec({ until: autoRecord.until });
    } else if (resumeRec.current) {
      const r = resumeRec.current;
      resumeRec.current = null;
      if (!r.until || r.until + PAD_AFTER_MS > Date.now()) void startRec({ until: r.until, title: r.title });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Antes de reconectar: cerrar el archivo (mpv lo reescribiría) y seguir en otra parte al volver la señal. */
  const beforeReconnect = async () => {
    const r = recRef.current;
    if (!r) return;
    const title = progsRef.current.find((p) => p.start <= Date.now() && p.end > Date.now())?.title ?? channelRef.current.name;
    resumeRec.current = { until: r.until, title: `${title} (continuación)` };
    await stopRec('Se cortó la señal; se guardó hasta aquí y sigue en otra grabación.');
  };

  // Segundero del indicador de grabación.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [rec?.id]);

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
    resumeRec.current = null;
    markWatched(channel.key).catch(() => {});
    programmesFor([channel], Date.now() - 3600000, Date.now() + 6 * 3600000).then((m) => { progsRef.current = m.get(channel.key) ?? []; setProgs(progsRef.current); }).catch(() => setProgs([]));
  }, [channel.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(t);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (panel !== 'none') {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else if (overlay) poke();
  }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps

  useBack(true, () => {
    if (panel !== 'none') setPanel('none');
    else {
      void stopRec();
      onClose(channel);
    }
  });

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

  const { facts, onProgress } = useStreamFacts({
    active: overlay,
    playing: state === 'playing' || state === 'paused' || state === 'buffering',
    key: channel.key,
    media: () => video.current?.media() ?? Promise.resolve(null),
    tracks: () => video.current?.tracks() ?? Promise.resolve([]),
  });

  /** Tocar "Ahora": grabar este programa sin buscarlo en la guía. */
  const nowActions = () => {
    poke();
    if (recRef.current) {
      Alert.alert('Grabando', '¿Detener la grabación? Se guarda en Fotos.', [
        { text: 'Seguir grabando', style: 'cancel' },
        { text: 'Detener', style: 'destructive', onPress: () => void stopRec() },
      ]);
      return;
    }
    Alert.alert(cur?.title ?? channel.name, cur ? `${channel.name} · hasta las ${hhmm(cur.end)}` : channel.name, [
      ...(cur ? [{ text: `Grabar hasta que termine (${hhmm(cur.end)})`, onPress: () => void startRec({ until: cur.end, title: cur.title }) }] : []),
      { text: 'Grabar hasta que la detenga', onPress: () => void startRec({ until: null }) },
      { text: 'Cerrar', style: 'cancel' as const },
    ]);
  };

  /** Tocar "A continuación": avisarme o programar la grabación. */
  const nextActions = () => {
    if (!next) return;
    poke();
    Alert.alert(next.title, `${channel.name} · ${hhmm(next.start)} – ${hhmm(next.end)}`, [
      {
        text: 'Recordarme',
        onPress: async () => {
          const r = await addReminder(channel, next);
          Alert.alert('Guardado en Mis programas', r.notified ? 'Te aviso un minuto antes.' : 'No se pudo programar el aviso: permite las notificaciones de T-Max en Ajustes del iPad.');
        },
      },
      {
        text: 'Programar grabación',
        onPress: async () => {
          const r = await scheduleRecording(channel, next);
          Alert.alert(r.ok ? 'Grabación programada' : 'No se programó', r.ok ? 'Si a esa hora sigues en este canal, se graba aquí mismo. Deja T-Max abierto.' : r.reason ?? '');
        },
      },
      { text: 'Cerrar', style: 'cancel' as const },
    ]);
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
        onProgress={onProgress}
        onBeforeReconnect={beforeReconnect}
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
              {state === 'buffering' || !startMs ? <T kind="label" color={colors.textSecondary}>{state === 'buffering' ? 'Cargando…' : ' '}</T> : null}
              <StreamInfo facts={{ ...facts, format: startMs?.format }} extra={startMs ? `arranque ${startMs.ms} ms` : null} />
            </View>
            {rec ? (
              <Pressable accessibilityLabel="Detener grabación" onPress={() => void stopRec()} style={[styles.pill, { backgroundColor: '#FF5A4E33' }]}>
                <View style={styles.liveDot} />
                <T kind="label" weight="bold" style={{ fontVariant: ['tabular-nums'] }}>REC {mmss(Date.now() - rec.at)}{rec.until ? ` · hasta ${hhmm(rec.until)}` : ''} · detener</T>
              </Pressable>
            ) : (
              <View style={styles.pill}><View style={styles.liveDot} /><T kind="label" weight="bold">EN VIVO</T></View>
            )}
            <View style={styles.pill}><T weight="semibold" style={{ fontVariant: ['tabular-nums'] }}>{hhmm(now)}</T></View>
          </View>

          {panel === 'channels' && (
            <View style={[styles.side, compact && styles.sideCompact]}>
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
            <View style={[styles.tracks, compact && styles.tracksCompact]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <T kind="label" weight="bold" color={colors.textSecondary} style={{ flex: 1 }}>{panel === 'audio' ? 'AUDIO' : 'SUBTÍTULOS'}</T>
                <Pressable accessibilityLabel="Cerrar" onPress={() => setPanel('none')} hitSlop={10}><Icon name="close" size={18} /></Pressable>
              </View>
              <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator>
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
              </ScrollView>
            </View>
          )}

          <View style={[styles.bottom, compact && styles.bottomCompact]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 24 }}>
              <Pressable onPress={nowActions} style={{ flex: 1, gap: 4 }} accessibilityLabel="Opciones del programa actual">
                <T kind="label" color={colors.textSecondary}>{cur ? `AHORA · ${hhmm(cur.start)} – ${hhmm(cur.end)}` : 'Sin información de guía'} · <T kind="label" weight="bold" color={colors.accent}>{rec ? 'grabando' : 'tocar para grabar'}</T></T>
                <T kind="title" weight="bold" lines={1}>{cur?.title ?? channel.name}</T>
              </Pressable>
              {next && (
                <Pressable onPress={nextActions} style={{ alignItems: 'flex-end', gap: 2 }} accessibilityLabel="Opciones del siguiente programa">
                  <T kind="label" color={colors.textSecondary}>A continuación · {hhmm(next.start)} · <T kind="label" weight="bold" color={colors.accent}>avisar / grabar</T></T>
                  <T weight="semibold" lines={1}>{next.title}</T>
                </Pressable>
              )}
            </View>
            {cur && <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>}
            <View style={styles.controls}>
              <Ctl compact={compact} icon="subtitles" label="Subtítulos" onPress={() => openTracks('subs')} />
              <Ctl compact={compact} icon="audio" label="Audio" onPress={() => openTracks('audio')} />
              <View style={{ width: 16 }} />
              <Ctl compact={compact} icon="prev" label="Canal anterior" big onPress={() => { go(-1); poke(); }} />
              <Pressable accessibilityLabel={state === 'paused' ? 'Reproducir' : 'Pausa'} style={[styles.playBtn, compact && styles.playBtnCompact]}
                onPress={() => { state === 'paused' ? video.current?.play() : video.current?.pause(); poke(); }}>
                <Icon name={state === 'paused' ? 'play' : 'pause'} size={28} color={colors.onAccent} />
              </Pressable>
              <Ctl compact={compact} icon="next" label="Canal siguiente" big onPress={() => { go(1); poke(); }} />
              <View style={{ width: 16 }} />
              <Ctl compact={compact} icon="list" label="Lista de canales" onPress={() => { setPanel((p) => (p === 'channels' ? 'none' : 'channels')); poke(); }} />
              {Platform.OS === 'android' && <Ctl compact={compact} icon="expand" label="Imagen en imagen" onPress={() => video.current?.pip()} />}
              <Ctl compact={compact} icon="dvr" label={rec ? 'Detener grabación' : 'Grabar'} active={!!rec} onPress={() => { if (rec) void stopRec(); else nowActions(); poke(); }} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Ctl({ compact, icon, label, onPress, big, active }: { compact?: boolean; icon: 'subtitles' | 'audio' | 'prev' | 'next' | 'list' | 'dvr' | 'expand'; label: string; onPress: () => void; big?: boolean; active?: boolean }) {
  const s = compact ? (big ? 46 : 40) : big ? 60 : 52;
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
  top: { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.overlayPanel, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.overlayPanel, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  side: { position: 'absolute', zIndex: 20, elevation: 20, left: 24, top: 96, bottom: 270, width: 340, maxWidth: '80%', borderRadius: radius.xl, backgroundColor: colors.overlayPanel, paddingVertical: 10, paddingHorizontal: 8 },
  sideRow: { height: 56, marginBottom: 2, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
  tracks: { position: 'absolute', zIndex: 20, elevation: 20, maxHeight: '60%', right: 24, bottom: 270, width: 360, maxWidth: '85%', borderRadius: radius.xl, backgroundColor: colors.overlayPanel, padding: 16, gap: 4 },
  trackRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, borderRadius: radius.sm },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: radius.xl, backgroundColor: colors.overlayPanel, paddingHorizontal: 24, paddingVertical: 20, gap: 14 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#34394380', overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.accent },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ctl: { backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  sideCompact: { top: 8, bottom: 8, left: 8 },
  tracksCompact: { top: 8, bottom: undefined, right: 8, maxHeight: '94%', padding: 12 },
  playBtnCompact: { width: 56, height: 56, borderRadius: 28 },
  bottomCompact: { paddingVertical: 10, paddingHorizontal: 16, gap: 8, left: 8, right: 8, bottom: 8 },
  playBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
