// Vista de video con libmpv: resuelve la URL del canal (directo contra la fuente) y la reproduce.
import { ExpoMpvView, type ExpoMpvViewRef, type MediaInfo, type PlaybackState, type ProgressEvent, type TrackInfo } from 'expo-mpv';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { redact } from '@tmax/core';

import { resolvePlayback, type PlaybackTarget } from '../data/playback';
import { subPropsFor } from '../data/prefs';
import { logEvent } from '../data/diag';
import { stalkerPlaying } from '../data/stalker-session';
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
  /** Antes de reconectar (la grabación debe cerrar su archivo: mpv lo reescribiría). */
  onBeforeReconnect?: () => Promise<void>;
}

/** Reconexiones permitidas en la ventana antes de rendirse y mostrar el error. */
const RECONNECT_MAX = 5;
const RECONNECT_WINDOW_MS = 3 * 60_000;
/** Si se queda cargando más que esto, se da por atorado y se reconecta. */
const STALL_MS = 25_000;

const Video = forwardRef<VideoHandle, Props>(function Video({ channel, style, onState, onStarted, muted, bare, onFatal, onProgress, onBeforeReconnect }, ref) {
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
  const attempts = useRef<number[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
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
      if (seq !== loadSeq.current) return;
      const msg = redact(e instanceof Error ? e.message : String(e));
      // El portal/servidor no respondió al pedir el enlace: reintentar con espera antes de rendirse.
      if (await reconnect(`No se pudo pedir el enlace (${msg.slice(0, 80)})`)) return;
      setReconnecting(false);
      logEvent({ kind: 'error', source: channel.source_type, channel: channel.name, msg });
      setError(msg);
    }
  };

  // Avisar qué conexión está en uso (el DVR no abre otra si el proveedor solo permite una).
  const token = useRef(Math.random().toString(36).slice(2));
  useEffect(() => {
    attempts.current = [];
    setReconnecting(false);
    load(false);
    if (channel && !bare) markInUse(token.current, channel.source_id, channel.key);
    stalkerPlaying(token.current, channel?.source_type === 'stalker' ? channel.source_id : null);
    return () => {
      loadSeq.current++;
      unmarkInUse(token.current);
      stalkerPlaying(token.current, null);
    };
  }, [channel?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Se cayó la señal (error, fin del flujo o atorado): reconectar con enlace nuevo, con espera creciente.
   * En Stalker, del segundo intento en adelante se pide también sesión nueva al portal.
   * Devuelve false si ya se agotaron los intentos.
   */
  const reconnect = async (why: string): Promise<boolean> => {
    if (!channel) return false;
    const now = Date.now();
    attempts.current = attempts.current.filter((t) => now - t < RECONNECT_WINDOW_MS);
    if (attempts.current.length >= RECONNECT_MAX) return false;
    attempts.current.push(now);
    const n = attempts.current.length;
    logEvent({ kind: 'reconnect', source: channel.source_type, channel: channel.name, msg: `${why} → reconexión ${n}/${RECONNECT_MAX}` });
    setReconnecting(true);
    await onBeforeReconnect?.().catch(() => {});
    const seq = loadSeq.current;
    await new Promise((r) => setTimeout(r, Math.min(8000, 800 * 2 ** (n - 1))));
    if (seq !== loadSeq.current) return true;
    await load(channel.source_type === 'stalker' && n >= 2);
    return true;
  };

  // Atorado cargando: reconectar.
  useEffect(() => {
    if (!channel || error || (state !== 'loading' && state !== 'buffering')) return;
    const t = setTimeout(() => void reconnect(state === 'loading' ? 'No arrancó en 25 s' : 'Atorado cargando 25 s'), STALL_MS);
    return () => clearTimeout(t);
  }, [state, channel?.key, error]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Error del reproductor: primero se reconecta solo; si sigue fallando, se explica qué pasó. */
  const onPlayerError = async (raw: string) => {
    if (await reconnect(`Error de reproducción (${redact(raw).slice(0, 80)})`)) return;
    setReconnecting(false);
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
    logEvent({ kind: 'error', source: channel?.source_type, channel: channel?.name, msg });
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
          if (nativeEvent.state === 'playing') setReconnecting(false);
          if (nativeEvent.state === 'playing' && !started.current.done) {
            started.current.done = true;
            const ms = Date.now() - started.current.at;
            logEvent({ kind: 'play', source: channel?.source_type, channel: channel?.name, msg: `Arrancó en ${ms} ms (${started.current.format})` });
            onStarted?.(ms, started.current.format);
          }
        }}
        onEnd={({ nativeEvent }) => {
          // En vivo no hay "fin": si el flujo termina es que el servidor lo cortó.
          if (channel && (nativeEvent.reason === 'ended' || nativeEvent.reason === 'error')) void reconnect('El servidor cortó el flujo');
        }}
        onError={({ nativeEvent }) => {
          onPlayerError(nativeEvent.error);
        }}
      />
      {!bare && (error || (channel && state !== 'playing' && state !== 'paused')) && (
        <View style={styles.status} pointerEvents="none">
          <T kind="label" weight="semibold" color={error ? colors.danger : colors.textSecondary}>
            {error ? error : reconnecting ? 'Se cortó la señal · reconectando…' : state === 'buffering' ? 'Cargando…' : 'Conectando…'}
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
