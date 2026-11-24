// Ficha de película: datos del proveedor (se piden al abrirla), Continuar / Desde el inicio / Favorito / Visto.
import type { VodMovieDetail } from '@tmax/core';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { humanError } from '../data/sync';
import { movieDetail, setWatched, toggleVodFavorite, userVodFor, type UserVod, type VodItem, type VodPlayRequest } from '../data/vod';
import { clock, humanDuration, resumeFrom } from '../data/vod-mapping';
import { colors, radius } from '../theme';
import Poster, { TONES } from '../ui/Poster';
import { Button, T } from '../ui/kit';
import { useIsCompact, useIsPhone } from '../ui/layout';

interface Props {
  item: VodItem;
  dataVersion: number;
  onBack: () => void;
  onPlay: (r: VodPlayRequest) => void;
}

export default function MovieDetailView({ item, dataVersion, onBack, onPlay }: Props) {
  const [d, setD] = useState<VodMovieDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [u, setU] = useState<UserVod | null>(null);
  const [fav, setFav] = useState(item.favorite);
  const [version, setVersion] = useState(0);
  const phone = useIsPhone();
  const compact = useIsCompact();

  useEffect(() => {
    setErr(null);
    movieDetail(item).then(setD).catch((e) => setErr(humanError(e)));
  }, [item.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    userVodFor([item.key]).then((m) => {
      const r = m.get(item.key) ?? null;
      setU(r);
      if (r) setFav(r.favorite);
    }).catch(() => {});
  }, [item.key, dataVersion, version]);

  const title = d?.title ?? item.title;
  const poster = d?.poster ?? item.poster;
  const durationSec = d?.durationSec ?? (u?.duration || null);
  const resume = resumeFrom(u?.position, u?.duration);
  const meta = [d?.year ?? item.year, humanDuration(durationSec), (d?.rating ?? item.rating) ? `★ ${d?.rating ?? item.rating}` : null, d?.genres.slice(0, 3).join(', ')]
    .filter(Boolean)
    .join('  ·  ');

  const play = (from: number | null) =>
    onPlay({
      queue: [{
        key: item.key, kind: 'movie', sourceId: item.source_id, streamId: item.source_item_id,
        ext: d?.containerExtension ?? item.ext, title, subtitle: [d?.year ?? item.year, humanDuration(durationSec)].filter(Boolean).join(' · ') || null,
        poster, durationSec,
      }],
      index: 0,
      startAt: from,
    });

  const toggleFav = async () => {
    await toggleVodFavorite({ key: item.key, kind: 'movie', title, poster }, !fav);
    setFav(!fav);
  };

  const toggleWatched = async () => {
    await setWatched(item.key, 'movie', !u?.completed, { title, poster });
    setVersion((v) => v + 1);
  };

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={styles.header}>
        <Button compact icon="back" label="Películas" onPress={onBack} />
      </View>
      <View style={[styles.panel, { flex: 1 }]}>
        {d?.backdrop ? <Image source={{ uri: d.backdrop }} style={[StyleSheet.absoluteFill, { opacity: 0.18 }]} resizeMode="cover" /> : null}
        <ScrollView contentContainerStyle={[styles.body, phone && { flexDirection: 'column', padding: 16, gap: 16 }, compact && !phone && { padding: 16, gap: 16 }]}>
          <Poster uri={poster} title={title} width={phone || compact ? 130 : 220} tone={TONES[1]!} />
          <View style={phone ? { gap: 12 } : { flex: 1, gap: 12 }}>
            <T kind={phone || compact ? 'title' : 'display'} weight="bold">{title}</T>
            {meta ? <T color={colors.textSecondary}>{meta}</T> : null}
            {u && !u.completed && u.duration > 0 && u.position > 30 && (
              <View style={{ gap: 6, maxWidth: 420 }}>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, (u.position / u.duration) * 100)}%` }]} /></View>
                <T kind="caption" color={colors.textSecondary}>Vas en {clock(u.position)} · quedan {clock(u.duration - u.position)}</T>
              </View>
            )}
            <View style={styles.actions}>
              {resume !== null ? (
                <>
                  <Button variant="primary" icon="play" label={`Continuar desde ${clock(resume)}`} onPress={() => play(resume)} />
                  <Button icon="restart" label="Desde el inicio" onPress={() => play(null)} />
                </>
              ) : (
                <Button variant="primary" icon="play" label={u?.completed ? 'Ver otra vez' : 'Reproducir'} onPress={() => play(null)} />
              )}
              <Button icon={fav ? 'starFilled' : 'star'} label={fav ? 'En favoritos' : 'Favorito'} onPress={toggleFav} />
              <Button icon="check" label={u?.completed ? 'Vista' : 'Marcar vista'} onPress={toggleWatched} />
            </View>
            {err ? <T color={colors.danger}>No se pudo cargar la ficha: {err}. Aún puedes reproducirla.</T> : null}
            {!d && !err ? <T color={colors.textTertiary}>Cargando ficha…</T> : null}
            {d?.synopsis ? <T style={{ maxWidth: 760 }}>{d.synopsis}</T> : null}
            {d?.director ? <Info label="Dirección" value={d.director} /> : null}
            {d && d.cast.length > 0 ? <Info label="Reparto" value={d.cast.slice(0, 8).join(', ')} /> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2, maxWidth: 760 }}>
      <T kind="caption" weight="bold" color={colors.textTertiary}>{label.toUpperCase()}</T>
      <T kind="label" color={colors.textSecondary}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg, overflow: 'hidden' },
  body: { padding: 28, flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.hover, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.accent },
});
