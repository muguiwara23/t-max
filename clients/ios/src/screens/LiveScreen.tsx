// TV en vivo: una sola lista (Grupos → canales → Atrás), vista previa y guía por canales.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import Pressable from '../ui/Press';

import { scheduleRecording, scheduledKeys } from '../data/dvr';
import { addReminder, reminderId, reminderKeys, removeReminder } from '../data/reminders';

import { getSetting, setSetting } from '../data/db';
import { hhmm, type ProgrammeRow } from '../data/mapping';
import {
  ALL,
  channelsIn,
  listGroups,
  programmesFor,
  searchChannels,
  toggleFavorite,
  type ChannelItem,
  type GroupItem,
  type SourceFilter,
} from '../data/queries';
import { listSources, type Source } from '../data/sources';
import { isStale } from '../data/settings-model';
import { refreshSource } from '../data/sync';
import { colors, font, radius } from '../theme';
import Icon from '../ui/Icon';
import { Button, T } from '../ui/kit';
import Video from '../ui/Video';
import { useBack } from '../ui/back';
import { useIsCompact, useIsPhone } from '../ui/layout';
import GroupsList from './GroupsList';
import GuideView from './GuideView';

interface Props {
  dataVersion: number;
  previewEnabled: boolean;
  onFullscreen: (list: ChannelItem[], index: number, opts?: { autoRecord?: { until: number | null } }) => void;
  onOpenSettings: () => void;
  /** Canal en el que quedó la pantalla completa: la vista previa sigue en ese. */
  focus?: { channel: ChannelItem; n: number } | null;
  /** Avisar a la app que cambiaron los datos (p. ej. tras actualizar listas desde el aviso). */
  onDataChanged?: () => void;
}

const HALF_HOUR = 30 * 60000;

function useClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function LiveScreen({ dataVersion, previewEnabled, onFullscreen, onOpenSettings, focus, onDataChanged }: Props) {
  const now = useClock();
  const phone = useIsPhone();
  const compact = useIsCompact();
  const [mode, setMode] = useState<'list' | 'guide'>('list');
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilterState] = useState<SourceFilter>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const [staleHidden, setStaleHidden] = useState(false);
  const [staleBusy, setStaleBusy] = useState(false);
  const [allGroup, setAllGroup] = useState<GroupItem | null>(null);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChannelItem[] | null>(null);
  const [selected, setSelected] = useState<ChannelItem | null>(null);
  // iPad/tablet: ocultar la lista de canales para ver la vista previa más grande.
  const [listHidden, setListHidden] = useState(false);
  const [programmes, setProgrammes] = useState<Map<string, ProgrammeRow[]>>(new Map());
  const [guideStart, setGuideStart] = useState(() => Math.floor(Date.now() / HALF_HOUR) * HALF_HOUR - HALF_HOUR);
  const [guideSel, setGuideSel] = useState<{ key: string; start: number } | null>(null);

  const [marks, setMarks] = useState<{ rem: Set<string>; rec: Set<string> }>({ rem: new Set(), rec: new Set() });
  useEffect(() => {
    Promise.all([reminderKeys(), scheduledKeys()]).then(([rem, rec]) => setMarks({ rem, rec })).catch(() => {});
  }, [dataVersion, localVersion]);

  /** Recordarme / Grabar para un programa (desde la guía o "A continuación"). */
  const toggleReminder = async (c: ChannelItem, p: ProgrammeRow) => {
    const id = reminderId(c.key, p.start);
    if (marks.rem.has(id)) await removeReminder(id);
    else {
      const r = await addReminder(c, p);
      if (!r.notified && p.start > Date.now())
        Alert.alert('Guardado en Mis programas', 'No se pudo programar el aviso: permite las notificaciones de T-Max en Ajustes del iPad.');
    }
    setLocalVersion((v) => v + 1);
  };
  const recordProgramme = async (c: ChannelItem, p: ProgrammeRow) => {
    const r = await scheduleRecording(c, p);
    if (!r.ok) Alert.alert('No se programó', r.reason ?? '');
    else Alert.alert('Grabación programada', `${p.title}\n\nDeja T-Max abierto a esa hora: iOS no permite grabar con la app cerrada. Si a esa hora estás viendo ese canal, se graba ahí mismo; si tu proveedor permite 1 sola conexión, no veas otro canal de esa fuente. Al terminar se guarda en Fotos.`);
    setLocalVersion((v) => v + 1);
  };
  const programmeActions = (c: ChannelItem, p: ProgrammeRow) => {
    const remOn = marks.rem.has(reminderId(c.key, p.start));
    const recOn = marks.rec.has(`${c.key}@${p.start}`);
    Alert.alert(p.title, `${c.name} · ${hhmm(p.start)} – ${hhmm(p.end)}`, [
      ...(p.start > Date.now() || remOn ? [{ text: remOn ? 'Quitar de Mis programas' : 'Recordarme', onPress: () => void toggleReminder(c, p) }] : []),
      ...(p.end > Date.now() && !recOn ? [{ text: 'Grabar', onPress: () => (p.start <= Date.now() ? recordNow(c, p) : void recordProgramme(c, p)) }] : []),
      { text: 'Cerrar', style: 'cancel' as const },
    ]);
  };

  useEffect(() => {
    if (!focus) return;
    setSelected(focus.channel);
    setGuideSel((g) => (g ? { key: focus.channel.key, start: -1 } : g));
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const list = (await listSources()).filter((x) => x.enabled);
      setSources(list);
      const saved = await getSetting('liveSource');
      // Con una sola fuente no hay pestañas: se trabaja directo sobre ella (así se pueden editar sus grupos).
      if (list.length === 1) setFilterState(list[0]!.id);
      else setFilterState(saved && list.some((x) => x.id === saved) ? saved : null);
    })().catch(() => {});
  }, [dataVersion]);

  useEffect(() => {
    listGroups(filter).then((g) => setAllGroup(g.all)).catch(() => {});
  }, [filter, dataVersion, localVersion]);

  const setFilter = (f: SourceFilter) => {
    setFilterState(f);
    setGroup(null);
    setSetting('liveSource', f ?? '').catch(() => {});
  };

  useEffect(() => {
    if (!group) return;
    channelsIn(group.id, filter).then(setChannels).catch(() => setChannels([]));
  }, [group, filter, dataVersion, localVersion]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) searchChannels(query, filter).then(setResults).catch(() => setResults([]));
      else setResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [query, filter]);

  const visible = results ?? (group ? channels : []);
  const guideChannels = results ?? (group ? channels : []);

  // Programas de los canales visibles (ventana amplia para lista y guía).
  const progKey = visible.map((c) => c.key).join('|');
  useEffect(() => {
    if (visible.length === 0) {
      setProgrammes(new Map());
      return;
    }
    const from = Math.min(now - 6 * 3600000, guideStart);
    programmesFor(visible.slice(0, 800), from, Math.max(now, guideStart) + 6 * 3600000).then(setProgrammes).catch(() => {});
  }, [progKey, guideStart, Math.floor(now / 300000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowNext = useCallback(
    (key: string) => {
      const list = programmes.get(key) ?? [];
      const i = list.findIndex((p) => p.start <= now && p.end > now);
      return { current: i >= 0 ? list[i] : undefined, next: i >= 0 ? list.slice(i + 1, i + 4) : list.filter((p) => p.start > now).slice(0, 3) };
    },
    [programmes, now],
  );

  const sel = selected ? nowNext(selected.key) : { current: undefined, next: [] as ProgrammeRow[] };
  const empty = sources.length === 0 || (filter === null && allGroup !== null && allGroup.count === 0);

  useBack(previewEnabled && (listHidden || !!group || !!query || mode === 'guide'), () => {
    if (listHidden) setListHidden(false);
    else if (query) setQuery('');
    else if (mode === 'guide') setMode('list');
    else setGroup(null);
  });

  const stale = sources.filter((x) => isStale(x.lastRefresh, now));
  const refreshStale = async () => {
    setStaleBusy(true);
    for (const x of stale) await refreshSource(x).catch(() => {});
    setStaleBusy(false);
    setLocalVersion((v) => v + 1);
    onDataChanged?.();
  };

  const openFull = (c: ChannelItem, opts?: { autoRecord?: { until: number | null } }) => {
    const list = visible.length ? visible : [c];
    const idx = Math.max(0, list.findIndex((x) => x.key === c.key));
    onFullscreen(list, idx, opts);
  };

  /** Grabar lo que está pasando: se abre a pantalla completa y graba ahí (misma conexión). */
  const recordNow = (c: ChannelItem, cur?: ProgrammeRow) => {
    Alert.alert(cur?.title ?? c.name, 'Se abre en pantalla completa y graba ahí mismo. Al terminar se guarda en Fotos.', [
      ...(cur ? [{ text: `Grabar hasta que termine (${hhmm(cur.end)})`, onPress: () => openFull(c, { autoRecord: { until: cur.end } }) }] : []),
      { text: 'Grabar hasta que la detenga', onPress: () => openFull(c, { autoRecord: { until: null } }) },
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  const fav = async () => {
    if (!selected) return;
    await toggleFavorite(selected.key, !selected.favorite);
    setSelected({ ...selected, favorite: !selected.favorite });
    setLocalVersion((v) => v + 1);
  };

  const guideSelected = useMemo(() => {
    if (!guideSel) return null;
    const c = guideChannels.find((x) => x.key === guideSel.key);
    const p = (programmes.get(guideSel.key) ?? []).find((x) => x.start === guideSel.start) ?? null;
    return c ? { c, p } : null;
  }, [guideSel, guideChannels, programmes]);

  return (
    <View style={{ flex: 1, gap: compact ? 6 : 12 }}>
      <View style={[styles.header, compact && { height: 44 }]}>
        <T kind={phone || compact ? 'title' : 'display'} weight="bold">{phone || compact ? 'En vivo' : 'TV en vivo'}</T>
        <View style={styles.segment}>
          <Pressable onPress={() => setMode('list')} style={[styles.segBtn, mode === 'list' && styles.segOn]}>
            <T kind="label" weight="bold" color={mode === 'list' ? colors.text : colors.textSecondary}>Lista</T>
          </Pressable>
          <Pressable onPress={() => { setMode('guide'); if (!group && !results && allGroup) setGroup(allGroup); }} style={[styles.segBtn, mode === 'guide' && styles.segOn]}>
            <T kind="label" weight="bold" color={mode === 'guide' ? colors.text : colors.textSecondary}>Guía</T>
          </Pressable>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[styles.search, (phone || compact) && { width: undefined, flex: 2 }, compact && { height: 36 }]}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar canal o número" placeholderTextColor={colors.textTertiary}
            autoCapitalize="none" autoCorrect={false} style={styles.searchInput} />
        </View>
        {!phone && !compact && <T kind="title" weight="semibold" style={{ fontVariant: ['tabular-nums'] }}>{hhmm(now)}</T>}
      </View>

      {sources.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 4 }}>
          <SourceTab label="Todas" active={filter === null} onPress={() => setFilter(null)} />
          {sources.map((src) => (
            <SourceTab key={src.id} label={src.name} active={filter === src.id} onPress={() => setFilter(src.id)} />
          ))}
        </ScrollView>
      )}

      {!staleHidden && stale.length > 0 && (
        <View style={styles.staleBox}>
          <Icon name="refresh" size={20} color={colors.warning} />
          <T kind="label" color={colors.text} style={{ flex: 1 }} lines={2}>
            {stale.length === 1
              ? `«${stale[0]!.name}» lleva ${staleAge(stale[0]!.lastRefresh, now)} sin actualizarse. Los canales y la guía pueden estar viejos.`
              : `${stale.length} listas llevan más de 1 día sin actualizarse: ${stale.map((x) => x.name).join(', ')}.`}
          </T>
          <Button compact variant="primary" label={staleBusy ? 'Actualizando…' : 'Actualizar'} disabled={staleBusy} onPress={() => void refreshStale()} />
          <Button compact label="Ahora no" onPress={() => setStaleHidden(true)} />
        </View>
      )}

      {empty ? (
        <View style={[styles.panel, styles.center]}>
          <T kind="title" weight="bold">Agrega tu primera fuente</T>
          <T color={colors.textSecondary} style={{ marginTop: 6, marginBottom: 16, textAlign: 'center' }}>
            Xtream, lista M3U o portal Stalker. Todo se guarda solo en este iPad.
          </T>
          <Button variant="primary" icon="plus" label="Ir a Ajustes → Fuentes" onPress={onOpenSettings} />
        </View>
      ) : mode === 'guide' ? (
        <View style={{ flex: 1, gap: 12 }}>
          <View style={[styles.guideTop, phone && { height: undefined, minHeight: 120 }, compact && { display: 'none' }]}>
            {!phone && <Video channel={previewEnabled ? (guideSelected?.c ?? selected) : null} style={styles.guideVideo} />}
            <View style={[styles.panel, { flex: 1, padding: 16, gap: 6 }]}>
              {guideSelected ? (
                <>
                  <T kind="label" color={colors.textSecondary}>{guideSelected.c.number ?? ''} · {guideSelected.c.name}{guideSelected.p ? ` · ${hhmm(guideSelected.p.start)} – ${hhmm(guideSelected.p.end)}` : ''}</T>
                  <T kind="title" weight="bold" lines={2}>{guideSelected.p?.title ?? guideSelected.c.name}</T>
                  {guideSelected.p?.description ? <T kind="label" color={colors.textSecondary} lines={3}>{guideSelected.p.description}</T> : null}
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <Button variant="primary" icon="play" label="Ver canal" onPress={() => openFull(guideSelected.c)} />
                    {guideSelected.p && (guideSelected.p.start > now || marks.rem.has(reminderId(guideSelected.c.key, guideSelected.p.start))) && (
                      <Button icon="bell" label={marks.rem.has(reminderId(guideSelected.c.key, guideSelected.p.start)) ? 'En Mis programas' : 'Recordarme'}
                        onPress={() => void toggleReminder(guideSelected.c, guideSelected.p!)} />
                    )}
                    {guideSelected.p && guideSelected.p.end > now && (
                      marks.rec.has(`${guideSelected.c.key}@${guideSelected.p.start}`)
                        ? <Button icon="dvr" label="Grabación programada" disabled />
                        : <Button icon="dvr" label="Grabar" onPress={() => (guideSelected.p!.start <= now ? recordNow(guideSelected.c, guideSelected.p!) : void recordProgramme(guideSelected.c, guideSelected.p!))} />
                    )}
                  </View>
                </>
              ) : (
                <T color={colors.textSecondary}>Toca un programa para ver su ficha. Toca un canal para verlo aquí.</T>
              )}
            </View>
          </View>
          <GuideView
            channels={guideChannels}
            programmes={programmes}
            windowStart={guideStart}
            now={now}
            selected={guideSel}
            onShift={(h) => setGuideStart((s) => s + h * 3600000)}
            onSelect={(c, p) => {
              if (compact) {
                // iPhone: tocar un programa = ver el canal o sus opciones, sin panel arriba.
                if (!p || (p.start <= now && p.end > now)) openFull(c);
                else programmeActions(c, p);
                return;
              }
              setGuideSel(p ? { key: c.key, start: p.start } : { key: c.key, start: -1 });
              if (!p || (p.start <= now && p.end > now)) setSelected(c);
            }}
          />
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: phone ? 'column-reverse' : 'row', gap: phone || compact ? 8 : 12 }}>
          <View style={[styles.panel, styles.listCol, (phone || compact) && { width: undefined, flex: 1 }, listHidden && !phone && !compact && { display: 'none' }]}>
            {results ? (
              <>
                <View style={styles.listHead}><T kind="title" weight="bold">Resultados</T><T kind="label" color={colors.textSecondary}>{results.length}</T></View>
                <ChannelList channels={results} selectedKey={selected?.key} nowNext={nowNext} onPick={compact ? openFull : setSelected} onLong={openFull} />
              </>
            ) : group ? (
              <>
                <View style={styles.listHead}>
                  <Button compact icon="back" label="Grupos" onPress={() => setGroup(null)} />
                  <T kind="title" weight="bold" lines={1} style={{ flex: 1, marginLeft: 8 }}>{group.name}</T>
                  <T kind="label" color={colors.textSecondary}>{channels.length}</T>
                </View>
                <ChannelList channels={channels} selectedKey={selected?.key} nowNext={nowNext} onPick={compact ? openFull : setSelected} onLong={openFull} />
              </>
            ) : (
              <GroupsList filter={filter} dataVersion={dataVersion + localVersion} onOpen={setGroup} onChanged={() => setLocalVersion((v) => v + 1)} />
            )}
          </View>

          <ScrollView style={compact ? { display: 'none' } : phone ? { flexGrow: 0, display: selected ? 'flex' : 'none' } : { flex: 1 }}
            contentContainerStyle={{ gap: phone ? 8 : 12 }} scrollEnabled={!phone} showsVerticalScrollIndicator={false}>
            <View>
              <Video channel={previewEnabled ? selected : null} style={[styles.preview, phone && { borderRadius: radius.md }]} />
              {selected && (
                <View style={styles.previewBadges} pointerEvents="box-none">
                  <View style={styles.badge}><T kind="label" weight="semibold" lines={1}>{selected.number ?? ''} · {selected.name}</T></View>
                  <View style={{ flex: 1 }} />
                  <View style={styles.badge}><View style={styles.liveDot} /><T kind="caption" weight="bold">EN VIVO</T></View>
                </View>
              )}
              {selected && (
                <Pressable accessibilityLabel="Pantalla completa" onPress={() => openFull(selected)} style={styles.fullBtn}>
                  <Icon name="expand" size={20} />
                </Pressable>
              )}
            </View>
            {phone ? null : selected ? (
              <View style={[styles.panel, { padding: 16, gap: 8 }]}>
                {sel.current ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={styles.nowPill}><T kind="caption" weight="bold" color={colors.accent}>AHORA</T></View>
                      <T kind="label" color={colors.textSecondary}>{hhmm(sel.current.start)} – {hhmm(sel.current.end)} · quedan {Math.max(0, Math.round((sel.current.end - now) / 60000))} min</T>
                    </View>
                    <T kind="title" weight="semibold" lines={2}>{sel.current.title}</T>
                    <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, ((now - sel.current.start) / (sel.current.end - sel.current.start)) * 100))}%` }]} /></View>
                    {sel.current.description ? <T kind="label" color={colors.textSecondary} lines={3}>{sel.current.description}</T> : null}
                  </>
                ) : (
                  <T kind="title" weight="semibold">{selected.name}</T>
                )}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  <Button variant="primary" icon="play" label="Ver en pantalla completa" onPress={() => openFull(selected)} />
                  <Button icon="dvr" label="Grabar" onPress={() => recordNow(selected, sel.current)} />
                  <Button icon={selected.favorite ? 'starFilled' : 'star'} label={selected.favorite ? 'En favoritos' : 'Favorito'} onPress={fav} />
                  <Button icon="list" label={listHidden ? 'Mostrar canales' : 'Ocultar canales'} onPress={() => setListHidden((v) => !v)} />
                </View>
              </View>
            ) : (
              <View style={[styles.panel, { padding: 16 }]}>
                <T color={colors.textSecondary}>Elige un grupo y luego un canal para verlo aquí. Mantén presionado un canal para abrirlo a pantalla completa.</T>
              </View>
            )}
            {!phone && selected && sel.next.length > 0 && (
              <View style={{ gap: 8 }}>
                <T kind="label" weight="semibold" color={colors.textSecondary} style={{ marginLeft: 4 }}>A CONTINUACIÓN</T>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {sel.next.map((p) => (
                    <Pressable key={p.start} onPress={() => programmeActions(selected, p)} style={[styles.panel, styles.nextCard]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <T kind="label" color={colors.textSecondary} style={{ flex: 1 }}>{hhmm(p.start)} – {hhmm(p.end)}</T>
                        {marks.rem.has(reminderId(selected.key, p.start)) ? <Icon name="bell" size={14} color={colors.accent} /> : null}
                        {marks.rec.has(`${selected.key}@${p.start}`) ? <Icon name="dvr" size={14} color={colors.live} /> : null}
                      </View>
                      <T weight="semibold" lines={2}>{p.title}</T>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function SourceTab({ label, kind, active, onPress }: { label: string; kind?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}
      style={[styles.tab, active && { backgroundColor: colors.accent }]}>
      {kind ? <T kind="caption" weight="bold" color={active ? '#0A0B0DB3' : colors.textTertiary}>{kind.toUpperCase()}</T> : null}
      <T kind="label" weight="bold" color={active ? colors.onAccent : colors.text}>{label}</T>
    </Pressable>
  );
}

function ChannelList({ channels, selectedKey, nowNext, onPick, onLong }: {
  channels: ChannelItem[];
  selectedKey?: string;
  nowNext: (key: string) => { current?: ProgrammeRow };
  onPick: (c: ChannelItem) => void;
  onLong: (c: ChannelItem) => void;
}) {
  const now = Date.now();
  return (
    <FlatList
      data={channels}
      keyExtractor={(c) => c.key}
      initialNumToRender={16}
      windowSize={9}
      getItemLayout={(_d, i) => ({ length: 68, offset: 68 * i, index: i })}
      renderItem={({ item }) => {
        const cur = nowNext(item.key).current;
        const sel = item.key === selectedKey;
        const pct = cur ? Math.min(100, ((now - cur.start) / (cur.end - cur.start)) * 100) : 0;
        return (
          <Pressable onPress={() => (sel ? onLong(item) : onPick(item))} onLongPress={() => onLong(item)}
            style={[styles.chRow, sel && { backgroundColor: colors.hover }]}>
            <T kind="label" color={colors.textSecondary} style={styles.chNum}>{item.number ?? ''}</T>
            <View style={styles.logo}>
              {item.logo ? <Image source={{ uri: item.logo }} style={styles.logoImg} resizeMode="contain" /> : <T kind="label" weight="bold">{item.name.slice(0, 2).toUpperCase()}</T>}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T weight={sel ? 'bold' : 'medium'} lines={1}>{item.name}</T>
              <T kind="caption" color={colors.textSecondary} lines={1}>{cur?.title ?? ' '}</T>
              <View style={styles.thinBar}><View style={{ height: 3, width: `${pct}%`, backgroundColor: sel ? colors.accent : colors.textTertiary }} /></View>
            </View>
            {item.favorite ? <Icon name="starFilled" size={14} color={colors.accent} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

function staleAge(last: number | null, now: number): string {
  if (!last) return 'tiempo';
  const d = Math.floor((now - last) / 86400000);
  return d <= 1 ? 'más de 1 día' : `${d} días`;
}

const styles = StyleSheet.create({
  staleBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: '#FBBF241F', borderWidth: 1, borderColor: '#FBBF2459' },
  tab: { height: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  segment: { flexDirection: 'row', backgroundColor: colors.panel, borderRadius: radius.pill, padding: 4, gap: 4 },
  segBtn: { height: 32, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center' },
  segOn: { backgroundColor: colors.hover },
  search: { height: 40, width: 260, borderRadius: radius.pill, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 15 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  listCol: { width: 380, paddingVertical: 10, paddingHorizontal: 8 },
  listHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 10, gap: 6 },
  sectionLabel: { marginTop: 10, marginBottom: 4, marginLeft: 12, letterSpacing: 0.6 },
  groupRow: { height: 52, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chRow: { height: 66, marginBottom: 2, borderRadius: radius.md, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chNum: { width: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.hover, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: 40, height: 40 },
  thinBar: { height: 3, borderRadius: 2, backgroundColor: colors.hover, overflow: 'hidden' },
  preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },
  previewBadges: { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', gap: 8 },
  badge: { height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.overlayPanel, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 360 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  fullBtn: { position: 'absolute', right: 12, bottom: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.overlayPanel, alignItems: 'center', justifyContent: 'center' },
  nowPill: { height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.accentSoft, justifyContent: 'center' },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.hover, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.accent },
  nextCard: { flex: 1, padding: 14, gap: 6, borderRadius: radius.md },
  guideTop: { height: 230, flexDirection: 'row', gap: 12 },
  guideVideo: { height: 230, aspectRatio: 16 / 9, borderRadius: radius.lg },
});
