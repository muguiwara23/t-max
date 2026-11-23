// Vista de video con libmpv: resuelve la URL del canal (directo contra la fuente) y la reproduce.
import { ExpoMpvView, type ExpoMpvViewRef, type PlaybackState, type TrackInfo } from 'expo-mpv';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { redact } from '@tmax/core';

import { resolvePlayback } from '../data/playback';
import type { ChannelItem } from '../data/queries';
import { colors } from '../theme';
import { T } from './kit';

export interface VideoHandle {
  play(): void;
  pause(): void;
  tracks(): Promise<TrackInfo[]>;
  setAudio(id: number): void;
  setSubtitle(id: number | null): void;
}

interface Props {
  channel: ChannelItem | null;
  style?: StyleProp<ViewStyle>;
  onState?: (s: PlaybackState) => void;
  onStarted?: (ms: number, format: string) => void;
}

const Video = forwardRef<VideoHandle, Props>(function Video({ channel, style, onState, onStarted }, ref) {
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
  }));

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!channel) {
      setSource(undefined);
      return;
    }
    (async () => {
      try {
        const target = await resolvePlayback(channel);
        if (cancelled) return;
        await mpv.current?.setPropertyString('network-timeout', '20').catch(() => {});
        if (target.userAgent) await mpv.current?.setPropertyString('user-agent', target.userAgent).catch(() => {});
        started.current = { at: Date.now(), done: false, format: target.format };
        setSource(target.url);
      } catch (e) {
        if (!cancelled) setError(redact(e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.box, style]}>
      <ExpoMpvView
        ref={mpv}
        style={StyleSheet.absoluteFill}
        source={source}
        onPlaybackStateChange={({ nativeEvent }) => {
          setState(nativeEvent.state);
          onState?.(nativeEvent.state);
          if (nativeEvent.state === 'playing' && !started.current.done) {
            started.current.done = true;
            onStarted?.(Date.now() - started.current.at, started.current.format);
          }
        }}
        onError={({ nativeEvent }) => setError(redact(nativeEvent.error))}
      />
      {(error || (channel && state !== 'playing' && state !== 'paused')) && (
        <View style={styles.status} pointerEvents="none">
          <T kind="label" weight="semibold" color={error ? colors.danger : colors.textSecondary}>
            {error ? `No se pudo reproducir: ${error}` : state === 'buffering' ? 'Cargando…' : 'Conectando…'}
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
