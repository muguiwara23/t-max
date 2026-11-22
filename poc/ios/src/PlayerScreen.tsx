import * as Clipboard from 'expo-clipboard';
import { ExpoMpvView } from 'expo-mpv';
import type { ExpoMpvViewRef, MediaInfo, PlaybackState, TrackInfo } from 'expo-mpv';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { redact } from './redact';
import { colors } from './theme';

export interface PlayItem {
  title: string;
  url: string;
  format: string; // 'ts' | 'm3u8' | 'directa'
}

interface Attempt {
  title: string;
  format: string;
  startMs: number | null;
  error: string | null;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  fps?: number;
  hwdec?: string;
  audioTracks?: number;
  subtitleTracks?: number;
  rebuffers: number;
}

interface Props {
  items: PlayItem[];
  startIndex: number;
  secrets: string[];
  onClose: () => void;
}

export default function PlayerScreen({ items, startIndex, secrets, onClose }: Props) {
  const ref = useRef<ExpoMpvViewRef>(null);
  const [index, setIndex] = useState(startIndex);
  const [state, setState] = useState<PlaybackState>('idle');
  const [overlay, setOverlay] = useState(true);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [copied, setCopied] = useState(false);
  const loadStart = useRef<number>(Date.now());
  const firstFrame = useRef<boolean>(false);
  const current = items[index];

  const addLog = useCallback(
    (line: string) => {
      const t = new Date().toLocaleTimeString();
      setLog((l) => [`${t}  ${redact(line, secrets)}`, ...l].slice(0, 80));
    },
    [secrets],
  );

  const updateAttempt = useCallback((patch: Partial<Attempt>) => {
    setAttempts((a) => {
      if (a.length === 0) return a;
      const copy = [...a];
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
      return copy;
    });
  }, []);

  // Cada cambio de canal empieza un nuevo intento medido.
  useEffect(() => {
    loadStart.current = Date.now();
    firstFrame.current = false;
    setError(null);
    setTracks([]);
    setMedia(null);
    setAttempts((a) => [...a, { title: current.title, format: current.format, startMs: null, error: null, rebuffers: 0 }]);
    addLog(`Abriendo "${current.title}" (${current.format})`);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ref.current?.setPropertyString('network-timeout', '20').catch(() => {});
  }, []);

  const refreshInfo = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([ref.current?.getMediaInfo(), ref.current?.getTrackList()]);
      if (m) setMedia(m);
      if (t) setTracks(t);
      if (m || t) {
        updateAttempt({
          videoCodec: m?.videoCodec,
          audioCodec: m?.audioCodec,
          resolution: m && m.width ? `${m.width}x${m.height}` : undefined,
          fps: m?.fps ? Math.round(m.fps * 100) / 100 : undefined,
          hwdec: m?.hwdecCurrent || 'software',
          audioTracks: t?.filter((x) => x.type === 'audio').length,
          subtitleTracks: t?.filter((x) => x.type === 'sub').length,
        });
      }
    } catch (e: any) {
      addLog(`No se pudo leer info de medios: ${String(e?.message ?? e)}`);
    }
  }, [addLog, updateAttempt]);

  const onState = useCallback(
    (s: PlaybackState) => {
      setState(s);
      if (s === 'playing' && !firstFrame.current) {
        firstFrame.current = true;
        const ms = Date.now() - loadStart.current;
        updateAttempt({ startMs: ms });
        addLog(`Primer cuadro en ${ms} ms`);
        setTimeout(refreshInfo, 1200);
      }
      if (s === 'buffering' && firstFrame.current) {
        setAttempts((a) => {
          if (a.length === 0) return a;
          const copy = [...a];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, rebuffers: last.rebuffers + 1 };
          return copy;
        });
        addLog('Rebuffering');
      }
    },
    [addLog, refreshInfo, updateAttempt],
  );

  const go = (delta: number) => {
    if (items.length < 2) return;
    setIndex((i) => (i + delta + items.length) % items.length);
  };

  const copyReport = async () => {
    const report = {
      app: 'T-Max POC iOS 0.1.0',
      motor: 'libmpv (expo-mpv 0.1.27 / MPVKit)',
      dispositivo: { os: Platform.OS, version: String(Platform.Version), iPad: (Platform as any).isPad === true },
      fecha: new Date().toISOString(),
      intentos: attempts,
      log: log.slice(0, 40),
    };
    await Clipboard.setStringAsync(redact(JSON.stringify(report, null, 2), secrets));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const audio = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');
  const last = attempts[attempts.length - 1];

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <ExpoMpvView
        ref={ref}
        style={StyleSheet.absoluteFill}
        source={current.url}
        onPlaybackStateChange={({ nativeEvent }) => onState(nativeEvent.state)}
        onError={({ nativeEvent }) => {
          const msg = redact(nativeEvent.error, secrets);
          setError(msg);
          updateAttempt({ error: msg });
          addLog(`Error: ${msg}`);
        }}
        onEnd={({ nativeEvent }) => addLog(`Fin: ${nativeEvent.reason}`)}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setOverlay((o) => !o)} />

      {overlay && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={styles.btnText}>✕ Cerrar</Text>
            </Pressable>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.title} numberOfLines={1}>
                {current.title}
              </Text>
              <Text style={styles.sub}>
                {current.format.toUpperCase()} · {stateLabel(state)}
                {last?.startMs != null ? ` · arranque ${last.startMs} ms` : ''}
                {media?.width ? ` · ${media.width}x${media.height} ${media.videoCodec}` : ''}
                {media ? ` · ${media.hwdecCurrent ? 'HW' : 'SW'}` : ''}
              </Text>
            </View>
            <Pressable style={styles.btn} onPress={copyReport}>
              <Text style={styles.btnText}>{copied ? '✓ Copiado' : 'Copiar diagnóstico'}</Text>
            </Pressable>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.bottom}>
            <View style={styles.row}>
              <Pressable style={styles.btn} onPress={() => go(-1)}>
                <Text style={styles.btnText}>◀ Anterior</Text>
              </Pressable>
              <Pressable
                style={styles.btn}
                onPress={() => (state === 'paused' ? ref.current?.play() : ref.current?.pause())}
              >
                <Text style={styles.btnText}>{state === 'paused' ? '▶ Reanudar' : '❚❚ Pausa'}</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => go(1)}>
                <Text style={styles.btnText}>Siguiente ▶</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={refreshInfo}>
                <Text style={styles.btnText}>↻ Pistas</Text>
              </Pressable>
            </View>

            {audio.length > 0 && (
              <ScrollView horizontal style={styles.row}>
                <Text style={styles.label}>Audio:</Text>
                {audio.map((t) => (
                  <Pressable
                    key={`a${t.id}`}
                    style={[styles.chip, t.selected && styles.chipOn]}
                    onPress={() => ref.current?.setAudioTrack(t.id).then(refreshInfo)}
                  >
                    <Text style={styles.chipText}>{trackLabel(t)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {subs.length > 0 && (
              <ScrollView horizontal style={styles.row}>
                <Text style={styles.label}>Subtítulos:</Text>
                <Pressable
                  style={[styles.chip, !subs.some((s) => s.selected) && styles.chipOn]}
                  onPress={() => ref.current?.setPropertyString('sid', 'no').then(refreshInfo)}
                >
                  <Text style={styles.chipText}>Ninguno</Text>
                </Pressable>
                {subs.map((t) => (
                  <Pressable
                    key={`s${t.id}`}
                    style={[styles.chip, t.selected && styles.chipOn]}
                    onPress={() => ref.current?.setSubtitleTrack(t.id).then(refreshInfo)}
                  >
                    <Text style={styles.chipText}>{trackLabel(t)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <ScrollView style={styles.log}>
              {log.map((l, i) => (
                <Text key={i} style={styles.logText}>
                  {l}
                </Text>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

function stateLabel(s: PlaybackState): string {
  switch (s) {
    case 'idle':
      return 'inactivo';
    case 'loading':
      return 'cargando…';
    case 'playing':
      return 'reproduciendo';
    case 'paused':
      return 'en pausa';
    case 'buffering':
      return 'buffering…';
    case 'ended':
      return 'terminado';
    default:
      return s;
  }
}

function trackLabel(t: TrackInfo): string {
  const parts = [t.title, t.lang, t.codec].filter(Boolean);
  if (t.channelCount) parts.push(`${t.channelCount}ch`);
  return parts.length ? parts.join(' · ') : `Pista ${t.id}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', padding: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.scrim, borderRadius: 12, padding: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  bottom: { backgroundColor: colors.scrim, borderRadius: 12, padding: 8, gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexGrow: 0 },
  btn: { backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginRight: 8 },
  btnText: { color: colors.text, fontSize: 15 },
  label: { color: colors.muted, alignSelf: 'center', marginRight: 8 },
  chip: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  errorBox: { backgroundColor: colors.errorBg, padding: 12, borderRadius: 8, alignSelf: 'center', maxWidth: 600 },
  errorText: { color: colors.text },
  log: { maxHeight: 110 },
  logText: { color: colors.muted, fontSize: 11, fontFamily: 'Menlo' },
});
