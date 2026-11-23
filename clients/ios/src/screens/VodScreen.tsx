// Películas o Series: pestañas por fuente, "Continuar viendo", categorías, cuadrícula de pósters y búsqueda.
// Una sola columna de navegación: catálogo → ficha → Atrás.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { getSetting, setSetting } from '../data/db';
import { hhmm } from '../data/mapping';
import type { Source } from '../data/sources';
import {
  VOD_ALL,
  VOD_FAV,
  continueWatching,
  forgetProgress,
  forgetSeriesProgress,
  getVodItem,
  listVodCategories,
  listVodItems,
  searchVod,
  vodSources,
  type UserVod,
  type VodCategory,
  type VodItem,
  type VodPlayRequest,
} from '../data/vod';
import { clock, type VodKind } from '../data/vod-mapping';
import { colors, font, radius } from '../theme';
import Icon from '../ui/Icon';
import Poster, { TONES } from '../ui/Poster';
import { useIsPhone } from '../ui/layout';
import { Button, Chip, T } from '../ui/kit';
import MovieDetailView from './MovieDetailView';
import SeriesDetailView from './SeriesDetailView';

interface Props {
  kind: VodKind;
  /** Cambia cuando se actualiza una fuente. */
  dataVersion: number;
  /** Cambia cuando se cierra el reproductor (avance nuevo). */
  progressVersion: number;
  onPlay: (r: VodPlayRequest) => void;
  onOpenSettings: () => void;
}

const PAGE = 240;
const GAP = 12;
const TARGET_W = 150;
const TARGET_W_PHONE = 110;

function useClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function VodScreen({ kind, dataVersion, progressVersion, onPlay, onOpenSettings }: Props) {
  const now = useClock();
  const title = kind === 'movie' ? 'Películas' : 'Series';
  const settingKey = `vodSource:${kind}`;
  const [sources, setSources] = useState<Source[] | null>(null);
  const [filter, setFilterState] = useState<string | null>(null);
  const [cats, setCats] = useState<VodCategory[]>([]);
  const [cat, setCat] = useState<string>(VOD_ALL);
  const [items, setItems] = useState<VodItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VodItem[] | null>(null);
  const [cont, setCont] = useState<UserVod[]>([]);
  const [detail, setDetail] = useState<VodItem | null>(null);
  const [width, setWidth] = useState(0);
  const [localVersion, setLocalVersion] = useState(0);
  const loading = useRef(false);

  useEffect(() => {
    (async () => {
      const list = await vodSources(kind);
      setSources(list);
      const saved = await getSetting(settingKey);
      if (list.length === 1) setFilterState(list[0]!.id);
      else setFilterState(saved && list.some((s) => s.id === saved) ? saved : null);
    })().catch(() => setSources([]));
  }, [kind, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (f: string | null) => {
    setFilterState(f);
    setCat(VOD_ALL);
    setSetting(settingKey, f ?? '').catch(() => {});
  };

  useEffect(() => {
    if (!sources) return;
    listVodCategories(kind, filter).then(setCats).catch(() => setCats([]));
    continueWatching(kind, filter).then(setCont).catch(() => setCont([]));
  }, [sources, filter, dataVersion, progressVersion, localVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Primera página del catálogo al cambiar fuente o categoría.
  useEffect(() => {
    if (!sources) return;
    let alive = true;
    listVodItems(kind, filter, cat, PAGE, 0)
      .then((r) => {
        if (!alive) return;
        setItems(r);
        setHasMore(r.length === PAGE);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [sources, filter, cat, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Refresca una tarjeta (favorito, avance) sin recargar la cuadrícula ni perder la posición. */
  const refreshItem = useCallback(async (key: string) => {
    const fresh = await getVodItem(key);
    if (!fresh) return;
    const swap = (list: VodItem[]) => list.map((x) => (x.key === key ? fresh : x));
    setItems(swap);
    setResults((r) => (r ? swap(r) : r));
  }, []);

  useEffect(() => {
    if (detail) refreshItem(detail.key).catch(() => {});
  }, [progressVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!hasMore || loading.current || results) return;
    loading.current = true;
    try {
      const r = await listVodItems(kind, filter, cat, PAGE, items.length);
      setItems((prev) => [...prev, ...r]);
      setHasMore(r.length === PAGE);
    } finally {
      loading.current = false;
    }
  }, [hasMore, results, kind, filter, cat, items.length]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) searchVod(kind, filter, query).then(setResults).catch(() => setResults([]));
      else setResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [query, filter, kind]);

  const openContinue = async (u: UserVod) => {
    const it = await getVodItem(kind === 'movie' ? u.key : (u.parent_key ?? ''));
    if (it) setDetail(it);
    else Alert.alert('No disponible', 'Este título ya no está en la lista de tu proveedor.');
  };

  const removeContinue = (u: UserVod) => {
    Alert.alert('Quitar de "Continuar viendo"', u.title ?? '', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: () => {
          const p = kind === 'movie' ? forgetProgress([u.key]) : forgetSeriesProgress(u.parent_key ?? u.key);
          p.then(() => setLocalVersion((v) => v + 1)).catch(() => {});
        },
      },
    ]);
  };

  const back = () => {
    if (detail) refreshItem(detail.key).catch(() => {});
    setDetail(null);
    setLocalVersion((v) => v + 1);
  };
  // La ficha se dibuja encima; el catálogo queda montado (oculto) para no perder el desplazamiento.
  const detailView = detail ? (
    kind === 'movie' ? (
      <MovieDetailView item={detail} dataVersion={progressVersion} onBack={back} onPlay={onPlay} />
    ) : (
      <SeriesDetailView item={detail} dataVersion={progressVersion} onBack={back} onPlay={onPlay} />
    )
  ) : null;

  const phone = width > 0 && width < 600;
  const cols = width > 0 ? Math.max(phone ? 2 : 3, Math.floor((width + GAP) / ((phone ? TARGET_W_PHONE : TARGET_W) + GAP))) : 0;
  const cardW = cols > 0 ? (width - (cols - 1) * GAP) / cols : 0;
  const grid = results ?? items;
  const multi = (sources?.length ?? 0) > 1;

  if (sources && sources.length === 0) {
    return (
      <View style={{ flex: 1, gap: 12 }}>
        <Header title={title} now={now} query={query} setQuery={setQuery} kind={kind} />
        <View style={[styles.panel, styles.center]}>
          <Icon name={kind === 'movie' ? 'movies' : 'series'} size={44} color={colors.textTertiary} />
          <T kind="title" weight="bold" style={{ marginTop: 12 }}>Aún no hay {kind === 'movie' ? 'películas' : 'series'}</T>
          <T color={colors.textSecondary} style={{ marginTop: 6, marginBottom: 16, textAlign: 'center', maxWidth: 520 }}>
            Se descargan al actualizar una fuente Xtream que las tenga. Las listas M3U y los portales Stalker aún no traen {kind === 'movie' ? 'películas' : 'series'} en esta versión.
          </T>
          <Button variant="primary" icon="refresh" label="Ir a Ajustes → Fuentes" onPress={onOpenSettings} />
        </View>
      </View>
    );
  }

  const head = (
    <View style={{ gap: 12, paddingBottom: GAP }}>
      {!results && cont.length > 0 && (
        <View style={{ gap: 8 }}>
          <T kind="label" weight="semibold" color={colors.textSecondary} style={styles.sectionLabel}>CONTINUAR VIENDO</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP }}>
            {cont.map((u) => (
              <ContinueCard key={u.key} u={u} kind={kind} onPress={() => openContinue(u)} onLong={() => removeContinue(u)} />
            ))}
          </ScrollView>
        </View>
      )}
      {!results && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <Chip label="Todas" active={cat === VOD_ALL} onPress={() => setCat(VOD_ALL)} />
          <Chip label="Favoritos" active={cat === VOD_FAV} onPress={() => setCat(VOD_FAV)} />
          {cats.map((c) => (
            <Chip key={c.id} label={`${c.name}  ${c.count}`} active={cat === c.id} onPress={() => setCat(c.id)} />
          ))}
        </ScrollView>
      )}
      {results && (
        <T kind="title" weight="bold" style={{ marginLeft: 4 }}>Resultados <T kind="label" color={colors.textSecondary}>{results.length}</T></T>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
    <View style={[{ flex: 1, gap: 12 }, detail && styles.hidden]}>
      <Header title={title} now={now} query={query} setQuery={setQuery} kind={kind} />
      {multi && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 4 }}>
          <SourceTab label="Todas" active={filter === null} onPress={() => setFilter(null)} />
          {sources!.map((s) => <SourceTab key={s.id} label={s.name} active={filter === s.id} onPress={() => setFilter(s.id)} />)}
        </ScrollView>
      )}
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
        {cols > 0 && (
          <FlatList
            key={`cols-${cols}`}
            data={grid}
            numColumns={cols}
            keyExtractor={(it) => it.key}
            ListHeaderComponent={head}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={{ gap: GAP, paddingBottom: 24 }}
            initialNumToRender={cols * 4}
            maxToRenderPerBatch={cols * 3}
            windowSize={7}
            removeClippedSubviews
            onEndReachedThreshold={0.6}
            onEndReached={loadMore}
            ListEmptyComponent={
              <View style={[styles.panel, { padding: 24 }]}>
                <T color={colors.textSecondary}>
                  {results ? 'Sin resultados.' : cat === VOD_FAV ? 'Aún no tienes favoritos. Ábrelos desde la ficha con el botón Favorito.' : 'Esta categoría está vacía.'}
                </T>
              </View>
            }
            renderItem={({ item, index }) => <PosterCard item={item} width={cardW} tone={TONES[index % TONES.length]!} onPress={() => setDetail(item)} />}
          />
        )}
      </View>
    </View>
    {detailView}
    </View>
  );
}

function Header({ title: t, now: n, query: q, setQuery: sq, kind }: { title: string; now: number; query: string; setQuery: (s: string) => void; kind: VodKind }) {
  const phone = useIsPhone();
  return (
    <View style={styles.header}>
      <T kind={phone ? 'title' : 'display'} weight="bold">{t}</T>
      <View style={{ flex: 1 }} />
      <View style={[styles.search, phone && { width: undefined, flex: 2 }]}>
        <Icon name="search" size={18} color={colors.textSecondary} />
        <TextInput value={q} onChangeText={sq} placeholder={kind === 'movie' ? 'Buscar película' : 'Buscar serie'} placeholderTextColor={colors.textTertiary}
          autoCapitalize="none" autoCorrect={false} style={styles.searchInput} clearButtonMode="while-editing" />
      </View>
      {!phone && <T kind="title" weight="semibold" style={{ fontVariant: ['tabular-nums'] }}>{hhmm(n)}</T>}
    </View>
  );
}

function SourceTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.tab, active && { backgroundColor: colors.accent }]}>
      <T kind="label" weight="bold" color={active ? colors.onAccent : colors.text}>{label}</T>
    </Pressable>
  );
}

function PosterCard({ item, width, tone, onPress }: { item: VodItem; width: number; tone: string; onPress: () => void }) {
  const pct = item.duration > 0 ? Math.min(100, (item.position / item.duration) * 100) : 0;
  const meta = [item.year, item.rating ? `★ ${item.rating}` : null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width, gap: 6, opacity: pressed ? 0.75 : 1 }]} accessibilityLabel={item.title}>
      <View>
        <Poster uri={item.poster} title={item.title} width={width} tone={tone} />
        {item.favorite && (
          <View style={styles.favBadge}><Icon name="starFilled" size={12} color={colors.onAccent} /></View>
        )}
        {item.completed ? (
          <View style={[styles.favBadge, { left: 8, right: undefined, backgroundColor: colors.overlayPanel }]}><Icon name="check" size={12} color={colors.accent} /></View>
        ) : pct > 1 ? (
          <View style={styles.posterBar}><View style={{ height: 4, width: `${pct}%`, backgroundColor: colors.accent }} /></View>
        ) : null}
      </View>
      <T kind="label" weight="semibold" lines={1}>{item.title}</T>
      <T kind="caption" color={colors.textSecondary} lines={1}>{meta || ' '}</T>
    </Pressable>
  );
}

function ContinueCard({ u, kind, onPress, onLong }: { u: UserVod; kind: VodKind; onPress: () => void; onLong: () => void }) {
  const pct = u.duration > 0 ? Math.min(100, (u.position / u.duration) * 100) : 0;
  const left = u.duration > 0 ? Math.max(0, u.duration - u.position) : 0;
  const line = kind === 'series' && u.completed ? `${u.subtitle ?? ''} · visto` : left > 0 ? `Quedan ${clock(left)}` : '';
  return (
    <Pressable onPress={onPress} onLongPress={onLong} style={({ pressed }) => [styles.contCard, { opacity: pressed ? 0.75 : 1 }]}>
      <Poster uri={u.poster} title={u.title ?? ''} width={60} tone={TONES[3]!} radiusPx={radius.sm} />
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="bold" lines={1}>{u.title}</T>
        {kind === 'series' && u.subtitle ? <T kind="caption" color={colors.textSecondary} lines={1}>{u.subtitle}</T> : null}
        <T kind="caption" color={colors.textSecondary} lines={1}>{kind === 'series' && u.completed ? 'Siguiente episodio' : line}</T>
        <View style={styles.thinBar}><View style={{ height: 4, width: `${u.completed ? 100 : pct}%`, backgroundColor: colors.accent }} /></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  search: { height: 40, width: 280, borderRadius: radius.pill, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 15 },
  tab: { height: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg },
  hidden: { display: 'none' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  sectionLabel: { marginLeft: 4, letterSpacing: 0.6 },
  contCard: { width: 300, height: 114, borderRadius: radius.md, backgroundColor: colors.panel, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
  thinBar: { height: 4, borderRadius: 2, backgroundColor: colors.hover, overflow: 'hidden', marginTop: 2 },
  favBadge: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  posterBar: { position: 'absolute', left: 8, right: 8, bottom: 8, height: 4, borderRadius: 2, backgroundColor: '#00000099', overflow: 'hidden' },
});
