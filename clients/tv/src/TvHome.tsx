// Inicio de T-Max TV (paso 1): grupos | canales con lo que pasa ahora | ficha del canal.
// Con el control: moverse por un grupo carga sus canales; OK en un canal = pantalla completa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { hhmm, type ProgrammeRow } from '@shared/data/mapping';
import { channelsIn, listGroups, programmesFor, type ChannelItem, type GroupItem } from '@shared/data/queries';
import { listSources, type Source } from '@shared/data/sources';
import { refreshSource } from '@shared/data/sync';
import { invalidatePlaybackCache } from '@shared/data/playback';
import { colors, radius } from '@shared/theme';
import { T } from '@shared/ui/kit';

import TvAddSource from './TvAddSource';

export default function TvHome({ hidden, focusKey, onPlay }: { hidden: boolean; focusKey: string | null; onPlay: (list: ChannelItem[], index: number) => void }) {
  const [version, setVersion] = useState(0);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [progs, setProgs] = useState<Map<string, ProgrammeRow[]>>(new Map());
  const [focused, setFocused] = useState<ChannelItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const groupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const src = await listSources();
      setSources(src);
      const g = await listGroups(null);
      const list = [...g.pinned, g.all, ...g.sections.flatMap((s) => s.groups)].filter((x) => x.count > 0 || x.special);
      setGroups(list);
      if (!group && list.length) setGroup(list.find((x) => !x.special) ?? list[0]!);
    })().catch(() => setSources([]));
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!group) return;
    let alive = true;
    channelsIn(group.id, null)
      .then(async (chs) => {
        if (!alive) return;
        setChannels(chs);
        const t = Date.now();
        const m = await programmesFor(chs.slice(0, 600), t - 4 * 3600000, t + 4 * 3600000);
        if (alive) setProgs(m);
      })
      .catch(() => setChannels([]));
    return () => {
      alive = false;
    };
  }, [group, version]);

  const nowNext = (key: string) => {
    const list = progs.get(key) ?? [];
    const i = list.findIndex((p) => p.start <= now && p.end > now);
    return { cur: i >= 0 ? list[i] : undefined, next: i >= 0 ? list.slice(i + 1, i + 3) : list.filter((p) => p.start > now).slice(0, 2) };
  };

  const pickGroup = (g: GroupItem) => {
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = setTimeout(() => setGroup(g), 250);
  };

  const refreshAll = async () => {
    for (const s of sources ?? []) {
      if (!s.enabled) continue;
      setBusy(`Actualizando ${s.name}…`);
      await refreshSource(s, (m) => setBusy(`${s.name}: ${m}`)).catch(() => {});
    }
    invalidatePlaybackCache();
    setBusy(null);
    setVersion((v) => v + 1);
  };

  const focusIdx = useMemo(() => (focusKey ? channels.findIndex((c) => c.key === focusKey) : -1), [focusKey, channels]);

  if (sources === null) return null;
  if (sources.length === 0 || adding) {
    return (
      <View style={[styles.root, hidden && styles.hidden]}>
        <TvAddSource
          canCancel={sources.length > 0}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setVersion((v) => v + 1);
          }}
        />
      </View>
    );
  }

  const info = focused ? nowNext(focused.key) : null;

  return (
    <View style={[styles.root, hidden && styles.hidden]}>
      <View style={styles.header}>
        <T kind="title" weight="bold" color={colors.accent}>T-Max TV</T>
        <T kind="label" color={colors.textSecondary} style={{ flex: 1, marginLeft: 16 }}>{busy ?? group?.name ?? ''}</T>
        <TvButton label="Actualizar listas" onPress={() => void refreshAll()} />
        <TvButton label="Agregar fuente" onPress={() => setAdding(true)} />
        <T kind="title" weight="semibold" style={{ marginLeft: 16, fontVariant: ['tabular-nums'] }}>{hhmm(now)}</T>
      </View>

      <View style={styles.body}>
        <View style={[styles.panel, { width: 250 }]}>
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            renderItem={({ item }) => (
              <Pressable onFocus={() => pickGroup(item)} onPress={() => setGroup(item)}
                style={({ focused: f }) => [styles.row, f && styles.rowFocus, !f && group?.id === item.id && styles.rowOn]}>
                {({ focused: f }) => (
                  <>
                    <T weight="semibold" lines={1} color={f ? colors.onAccent : colors.text} style={{ flex: 1 }}>{item.name}</T>
                    <T kind="caption" color={f ? colors.onAccent : colors.textTertiary}>{item.count}</T>
                  </>
                )}
              </Pressable>
            )}
          />
        </View>

        <View style={[styles.panel, { flex: 1 }]}>
          <FlatList
            data={channels}
            keyExtractor={(c) => c.key}
            initialNumToRender={14}
            windowSize={7}
            getItemLayout={(_d, i) => ({ length: 58, offset: 58 * i, index: i })}
            initialScrollIndex={focusIdx > 3 ? focusIdx - 3 : undefined}
            renderItem={({ item, index }) => {
              const p = nowNext(item.key).cur;
              return (
                <Pressable hasTVPreferredFocus={index === focusIdx} onFocus={() => setFocused(item)} onPress={() => onPlay(channels, index)}
                  style={({ focused: f }) => [styles.chRow, f && styles.rowFocus]}>
                  {({ focused: f }) => (
                    <>
                      <T kind="label" color={f ? colors.onAccent : colors.textSecondary} style={{ width: 48, textAlign: 'right' }}>{item.number ?? ''}</T>
                      <View style={{ flex: 1 }}>
                        <T weight="bold" lines={1} color={f ? colors.onAccent : colors.text}>{item.name}</T>
                        <T kind="caption" lines={1} color={f ? colors.onAccent : colors.textSecondary}>{p ? `${hhmm(p.start)} · ${p.title}` : 'Sin guía'}</T>
                      </View>
                      {item.favorite ? <T color={f ? colors.onAccent : colors.accent}>★</T> : null}
                    </>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={<T color={colors.textSecondary} style={{ padding: 16 }}>Este grupo no tiene canales.</T>}
          />
        </View>

        <View style={[styles.panel, { width: 300, padding: 16, gap: 8 }]}>
          {focused ? (
            <>
              <T kind="label" color={colors.textSecondary}>{focused.number ?? ''} · {focused.name}</T>
              {info?.cur ? (
                <>
                  <T kind="caption" weight="bold" color={colors.accent}>AHORA · {hhmm(info.cur.start)} – {hhmm(info.cur.end)}</T>
                  <T kind="title" weight="bold" lines={3}>{info.cur.title}</T>
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, ((now - info.cur.start) / (info.cur.end - info.cur.start)) * 100))}%` }]} /></View>
                  {info.cur.description ? <T kind="label" color={colors.textSecondary} lines={6}>{info.cur.description}</T> : null}
                </>
              ) : (
                <T color={colors.textSecondary}>Sin información de guía.</T>
              )}
              {info?.next.map((p) => (
                <T key={p.start} kind="label" lines={1} color={colors.textSecondary}>{hhmm(p.start)}  {p.title}</T>
              ))}
              <T kind="caption" color={colors.textTertiary} style={{ marginTop: 'auto' }}>OK = ver en pantalla completa</T>
            </>
          ) : (
            <T color={colors.textSecondary}>Elige un grupo a la izquierda y luego un canal.</T>
          )}
        </View>
      </View>
    </View>
  );
}

export function TvButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ focused }) => [styles.btn, primary && { backgroundColor: colors.accent }, focused && styles.btnFocus]}>
      {({ focused }) => <T kind="label" weight="bold" color={focused || primary ? colors.onAccent : colors.text}>{label}</T>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 14 },
  hidden: { display: 'none' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  body: { flex: 1, flexDirection: 'row', gap: 14 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg, padding: 8 },
  row: { height: 46, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  chRow: { height: 56, borderRadius: radius.md, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  rowFocus: { backgroundColor: colors.accent },
  rowOn: { backgroundColor: colors.hover },
  btn: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.raised, justifyContent: 'center' },
  btnFocus: { backgroundColor: colors.accent, transform: [{ scale: 1.05 }] },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.hover, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.accent },
});
