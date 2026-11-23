// Ficha de serie: temporadas, episodios con su avance y "Continuar T·E". Datos del proveedor al abrirla.
import type { Episode, SeriesDetail } from '@tmax/core';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { humanError } from '../data/sync';
import { seriesDetail, setWatched, toggleVodFavorite, userVodFor, type UserVod, type VodItem, type VodPlayItem, type VodPlayRequest } from '../data/vod';
import { clock, continueEpisode, episodeKey, episodeLabel, humanDuration, orderEpisodes, resumeFrom } from '../data/vod-mapping';
import { colors, radius } from '../theme';
import Icon from '../ui/Icon';
import Poster, { TONES } from '../ui/Poster';
import { Button, Chip, T } from '../ui/kit';

interface Props {
  item: VodItem;
  dataVersion: number;
  onBack: () => void;
  onPlay: (r: VodPlayRequest) => void;
}

export default function SeriesDetailView({ item, dataVersion, onBack, onPlay }: Props) {
  const [d, setD] = useState<SeriesDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<Map<string, UserVod>>(new Map());
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [fav, setFav] = useState(item.favorite);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setErr(null);
    seriesDetail(item).then(setD).catch((e) => setErr(humanError(e)));
  }, [item.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const episodes = useMemo(() => orderEpisodes(d?.episodes ?? []), [d]);
  const keyOf = (e: Episode) => episodeKey(item.source_id, e.sourceItemId);

  useEffect(() => {
    if (episodes.length === 0) return;
    userVodFor(episodes.map(keyOf))
      .then((m) => {
        setProgress(m);
        setProgressLoaded(true);
      })
      .catch(() => setProgressLoaded(true));
  }, [episodes, dataVersion, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = d?.summary.title ?? item.title;
  const poster = d?.summary.poster ?? item.poster;
  const seasons = useMemo(() => {
    const nums = [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b);
    return nums.map((n) => ({ number: n, name: d?.seasons.find((s) => s.number === n)?.name || `Temporada ${n}`, count: episodes.filter((e) => e.season === n).length }));
  }, [episodes, d]);

  const cont = useMemo(
    () => continueEpisode(episodes, (e) => {
      const p = progress.get(keyOf(e));
      return p && p.updated > 0 ? { position: p.position, duration: p.duration, completed: p.completed, updated: p.updated } : undefined;
    }),
    [episodes, progress], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Al abrir: la temporada del episodio a continuar.
  useEffect(() => {
    if (season === null && cont && progressLoaded) setSeason(cont.episode.season);
  }, [cont, season, progressLoaded]);
  const shownSeason = season ?? seasons[0]?.number ?? 1;
  const list = episodes.filter((e) => e.season === shownSeason);

  const playItem = (e: Episode): VodPlayItem => ({
    key: keyOf(e),
    kind: 'episode',
    sourceId: item.source_id,
    streamId: e.sourceItemId,
    ext: e.containerExtension,
    title,
    subtitle: `${episodeLabel(e)}${e.title && !/^episod/i.test(e.title) ? ` · ${e.title}` : ''}`,
    poster,
    parentKey: item.key,
    durationSec: e.durationSec,
  });

  const play = (e: Episode, from: number | null) => {
    const queue = episodes.map(playItem);
    onPlay({ queue, index: Math.max(0, episodes.indexOf(e)), startAt: from });
  };

  const playEpisode = (e: Episode) => {
    const p = progress.get(keyOf(e));
    play(e, p && !p.completed ? resumeFrom(p.position, p.duration) : null);
  };

  const toggleFav = async () => {
    await toggleVodFavorite({ key: item.key, kind: 'series', title, poster }, !fav);
    setFav(!fav);
  };

  const toggleWatched = async (e: Episode) => {
    const p = progress.get(keyOf(e));
    const pi = playItem(e);
    await setWatched(pi.key, 'episode', !p?.completed, { title, subtitle: pi.subtitle, parentKey: item.key, poster });
    setVersion((v) => v + 1);
  };

  const s = d?.summary;
  const meta = [s?.year ?? item.year, (s?.rating ?? item.rating) ? `★ ${s?.rating ?? item.rating}` : null, s?.genres.slice(0, 3).join(', '),
    seasons.length ? `${seasons.length} ${seasons.length === 1 ? 'temporada' : 'temporadas'}` : null].filter(Boolean).join('  ·  ');
  const contResume = cont ? (cont.resume ? resumeFrom(progress.get(keyOf(cont.episode))?.position, progress.get(keyOf(cont.episode))?.duration) : null) : null;

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={styles.header}>
        <Button compact icon="back" label="Series" onPress={onBack} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
        <ScrollView style={[styles.panel, { width: 400, flexGrow: 0 }]} contentContainerStyle={{ padding: 24, gap: 12 }}>
          <Poster uri={poster} title={title} width={180} tone={TONES[2]!} />
          <T kind="display" weight="bold">{title}</T>
          {meta ? <T kind="label" color={colors.textSecondary}>{meta}</T> : null}
          <View style={styles.actions}>
            {cont && (
              <Button variant="primary" icon="play" label={`${cont.resume ? 'Continuar' : 'Reproducir'} ${episodeLabel(cont.episode)}`}
                onPress={() => play(cont.episode, contResume)} />
            )}
            <Button icon={fav ? 'starFilled' : 'star'} label={fav ? 'En favoritos' : 'Favorito'} onPress={toggleFav} />
          </View>
          {err ? <T color={colors.danger}>No se pudo cargar la serie: {err}</T> : null}
          {!d && !err ? <T color={colors.textTertiary}>Cargando temporadas…</T> : null}
          {s?.synopsis ? <T kind="label" color={colors.textSecondary}>{s.synopsis}</T> : null}
        </ScrollView>

        <View style={[styles.panel, { flex: 1, paddingVertical: 12 }]}>
          {seasons.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
              {seasons.map((x) => <Chip key={x.number} label={x.name} active={x.number === shownSeason} onPress={() => setSeason(x.number)} />)}
            </ScrollView>
          )}
          <FlatList
            data={list}
            keyExtractor={(e) => e.sourceItemId}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 12 }}
            ListEmptyComponent={d ? <T color={colors.textSecondary} style={{ padding: 12 }}>Esta serie no tiene episodios en tu proveedor.</T> : null}
            renderItem={({ item: e }) => {
              const p = progress.get(keyOf(e));
              const pct = p && p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;
              const isNext = cont?.episode.sourceItemId === e.sourceItemId;
              const dur = humanDuration(e.durationSec);
              return (
                <Pressable onPress={() => playEpisode(e)} style={({ pressed }) => [styles.ep, isNext && { backgroundColor: colors.hover }, { opacity: pressed ? 0.75 : 1 }]}>
                  <View style={styles.epNum}><T weight="bold" color={isNext ? colors.accent : colors.text}>{e.episode}</T></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T weight="semibold" lines={1}>{e.title || `Episodio ${e.episode}`}</T>
                    <T kind="caption" color={colors.textSecondary} lines={2}>
                      {[dur, p && !p.completed && p.position > 30 ? `vas en ${clock(p.position)}` : null].filter(Boolean).join(' · ')}
                      {e.synopsis ? `${dur ? ' — ' : ''}${e.synopsis}` : ''}
                    </T>
                    {pct > 1 && !p?.completed ? <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View> : null}
                  </View>
                  <Pressable accessibilityLabel={p?.completed ? 'Marcar como no visto' : 'Marcar como visto'} hitSlop={8} onPress={() => toggleWatched(e)}
                    style={[styles.check, p?.completed && { backgroundColor: colors.accentSoft }]}>
                    <Icon name="check" size={16} color={p?.completed ? colors.accent : colors.textTertiary} />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ep: { minHeight: 72, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 14 },
  epNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  check: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  bar: { height: 3, borderRadius: 2, backgroundColor: colors.hover, overflow: 'hidden', marginTop: 2 },
  barFill: { height: 3, backgroundColor: colors.accent },
});
