// Vista de video con libmpv: resuelve la URL del canal (directo contra la fuente) y la reproduce.
import { ExpoMpvView, type ExpoMpvViewRef, type MediaInfo, type PlaybackState, type ProgressEvent, type TrackInfo } from 'expo-mpv';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { redact } from '@tmax/core';

import { resolvePlayback, type PlaybackTarget } from '../data/playback';
import { subPropsFor } from '../data/prefs';
import { markInUse, unmarkInUse } from '../dvr/bus';
import { fetchHttp } from '../platform/http';
import type { ChannelItem } from '../data/queries';
import { colors } from '../theme';
import { T } from './kit';

export interface VideoHandle {
  play(): void;
  pause(): void;
  tracks(): Promise<TrackInfo[]>;
  setAudio(id: number): void;
  setSubtitle(id: number | null): void;
  /** Cambiar una propiedad de mpv (p. ej. stream-record para grabar). */
  setProp(name: string, value: string): Promise<void>;
  media(): Promise<MediaInfo | null>;
}

interface Props {
  channel: ChannelItem | null;
  style?: StyleProp<ViewStyle>;
  onState?: (s: PlaybackState) => void;
  onStarted?: (ms: number, format: string) => void;
  /** Sin sonido (grabación en segundo plano). */
  muted?: boolean;
  /** Sin textos encima del video. */
  bare?: boolean;
  onFatal?: (msg: string) => void;
  onProgress?: (e: ProgressEvent) => void;
}

const Video = forwardRef<VideoHandle, Props>(function Video({ channel, style, onState, onStarted, muted, bare, onFatal, onProgress }, ref) {
  const mpv = useRef<ExpoMpvViewRef>(null);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PlaybackState>('idle');
  const started = useRef<{ at: number; done: boolean; format: string }>({ at: 0, done: true, format: '' });

  useImperativeHandle(ref, () => ({
    play: () => void mpv.current?.play(),
    pause: () => void mpv.current?.pause(),
    tracks: async () => (await mpv.current?.getTrackList()) ?? [],
    setAudio: (id) => void mpv.current?.setAudioTrack(id),
    setSubtitle: (id) => void (id === null ? mpv.current?.setPropertyString('sid', 'no') : mpv.current?.setSubtitleTrack(id)),
    setProp: async (name, value) => {
      await mpv.current?.setPropertyString(name, value);
    },
    media: async () => (await mpv.current?.getMediaInfo().catch(() => null)) ?? null,
  }));

  const target = useRef<PlaybackTarget | null>(null);
  const retried = useRef(false);
  const loadSeq = useRef(0);

  const load = async (forceNewToken: boolean) => {
    const seq = ++loadSeq.current;
    setError(null);
    if (!channel) {
      target.current = null;
      setSource(undefined);
      return;
    }
    try {
      const t = await resolvePlayback(channel, { forceNewToken });
      if (seq !== loadSeq.current) return;
      target.current = t;
      const m = mpv.current;
      await m?.setPropertyString('network-timeout', '20').catch(() => {});
      // Cabeceras por canal: Stalker necesita User-Agent MAG y cookie; el resto, las de mpv por defecto.
      const ua = t.headers?.['User-Agent'] ?? 'libmpv';
      const extra = Object.entries(t.headers ?? {})
        .filter(([k]) => k.toLowerCase() !== 'user-agent')
        .map(([k, v]) => `${k}: ${v}`)
        .join(',');
      await m?.setPropertyString('user-agent', ua).catch(() => {});
      await m?.setPropertyString('http-header-fields', extra).catch(() => {});
      for (const [k, v] of await subPropsFor(channel.source_id).catch(() => [])) await m?.setPropertyString(k, v).catch(() => {});
      started.current = { at: Date.now(), done: false, format: t.format };
      // Forzar recarga aunque la URL sea igual a la anterior.
      setSource(undefined);
      setTimeout(() => seq === loadSeq.current && setSource(t.url), 0);
    } catch (e) {
      if (seq === loadSeq.current) setError(redact(e instanceof Error ? e.message : String(e)));
    }
  };

  // Avisar qué conexión está en uso (el DVR no abre otra si el proveedor solo permite una).
  const token = useRef(Math.random().toString(36).slice(2));
  useEffect(() => {
    retried.current = false;
    load(false);
    if (channel && !bare) markInUse(token.current, channel.source_id, channel.key);
    return () => {
      loadSeq.current++;
      unmarkInUse(token.current);
    };
  }, [channel?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Error del reproductor: en Stalker se reintenta una vez con token nuevo; si no, se explica qué pasó. */
  const onPlayerError = async (raw: string) => {
    if (channel?.source_type === 'stalker' && !retried.current) {
      retried.current = true;
      load(true);
      return;
    }
    let detail = '';
    const t = target.current;
    if (t) {
      try {
        const res = await fetchHttp.get({ url: t.url, headers: { ...(t.headers ?? {}), Range: 'bytes=0-0' }, timeoutMs: 8000 });
        if (res.status >= 400) detail = ` El servidor respondió HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (acceso denegado o enlace vencido)' : res.status === 404 ? ' (canal no encontrado)' : ''}.`;
      } catch {
        detail = ' El servidor de video no responde.';
      }
    }
    const code = /-?\d+/.exec(raw)?.[0];
    const base = code === '-13' || /loading failed/i.test(raw) ? 'No se pudo abrir el canal.' : redact(raw);
    const msg = `${base}${detail}${code ? ` (mpv ${code})` : ''}`;
    setError(msg);
    onFatal?.(msg);
  };

  return (
    <View style={[styles.box, style]}>
      <ExpoMpvView
        ref={mpv}
        style={StyleSheet.absoluteFill}
        source={source}
        muted={muted}
        onProgress={onProgress ? ({ nativeEvent }) => onProgress(nativeEvent) : undefined}
        onPlaybackStateChange={({ nativeEvent }) => {
          setState(nativeEvent.state);
          onState?.(nativeEvent.state);
          if (nativeEvent.state === 'playing' && !started.current.done) {
            started.current.done = true;
            onStarted?.(Date.now() - started.current.at, started.current.format);
          }
        }}
        onError={({ nativeEvent }) => {
          onPlayerError(nativeEvent.error);
        }}
      />
      {!bare && (error || (channel && state !== 'playing' && state !== 'paused')) && (
        <View style={styles.status} pointerEvents="none">
          <T kind="label" weight="semibold" color={error ? colors.danger : colors.textSecondary}>
            {error ? error : state === 'buffering' ? 'Cargando…' : 'Conectando…'}
          </T>
        </View>
      )}
    </View>
  );
});

export default Video;

const styles = StyleSheet.create({
  box: { backgroundColor: '#000', overflow: 'hidden' },
  status: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
