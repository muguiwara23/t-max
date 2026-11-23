// Guía por canales: filas = canales, eje horizontal = tiempo, línea lima = ahora.
import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { hhmm, layoutGuideRow, type ProgrammeRow } from '../data/mapping';
import type { ChannelItem } from '../data/queries';
import { colors, radius } from '../theme';
import { Button, T } from '../ui/kit';

const CHW = 200;
const ROWH = 62;
const SPAN_MIN = 180;

interface Props {
  channels: ChannelItem[];
  programmes: Map<string, ProgrammeRow[]>;
  windowStart: number;
  now: number;
  selected: { key: string; start: number } | null;
  onShift: (hours: number) => void;
  onSelect: (c: ChannelItem, p: ProgrammeRow | null) => void;
}

const Row = memo(function Row({ c, progs, windowStart, ppm, now, selected, onSelect }: {
  c: ChannelItem; progs: ProgrammeRow[]; windowStart: number; ppm: number; now: number;
  selected: { key: string; start: number } | null; onSelect: Props['onSelect'];
}) {
  const blocks = layoutGuideRow(progs, windowStart, windowStart + SPAN_MIN * 60000, ppm, now);
  return (
    <View style={styles.row}>
      <Pressable style={styles.chCell} onPress={() => onSelect(c, null)}>
        <T kind="caption" color={colors.textSecondary} style={styles.num}>{c.number ?? ''}</T>
        <T kind="label" weight="semibold" lines={1} style={{ flex: 1 }}>{c.name}</T>
      </Pressable>
      <View style={styles.track}>
        {blocks.length === 0 && (
          <View style={[styles.block, { left: 2, right: 2, backgroundColor: 'transparent' }]}>
            <T kind="caption" color={colors.textTertiary}>Sin guía</T>
          </View>
        )}
        {blocks.map((b) => {
          const sel = selected?.key === c.key && selected.start === b.start;
          const p = progs.find((x) => x.start === b.start)!;
          return (
            <Pressable key={b.key} onPress={() => onSelect(c, p)}
              style={[styles.block, { left: b.left, width: b.width, backgroundColor: sel ? colors.accent : b.isNow ? colors.hover : colors.raised }]}>
              <T kind="label" weight="semibold" lines={1} color={sel ? colors.onAccent : b.isPast ? colors.textTertiary : colors.text}>{b.title}</T>
              <T kind="caption" lines={1} color={sel ? '#0A0B0DB3' : colors.textTertiary}>{hhmm(b.start)} – {hhmm(b.end)}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

export default function GuideView({ channels, programmes, windowStart, now, selected, onShift, onSelect }: Props) {
  const [width, setWidth] = useState(0);
  const ppm = width > CHW ? (width - CHW) / SPAN_MIN : 5;
  const slots = useMemo(() => [0, 30, 60, 90, 120, 150].map((m) => ({ m, label: hhmm(windowStart + m * 60000) })), [windowStart]);
  const nowLeft = CHW + ((now - windowStart) / 60000) * ppm;
  const nowVisible = now >= windowStart && now < windowStart + SPAN_MIN * 60000;

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.timeline}>
        <View style={[styles.chCell, { justifyContent: 'space-between' }]}>
          <Button compact icon="back" onPress={() => onShift(-1)} />
          <Button compact icon="chevron" onPress={() => onShift(1)} />
        </View>
        <View style={styles.track}>
          {slots.map((s) => (
            <T key={s.m} kind="caption" weight="semibold" color={colors.textSecondary} style={[styles.slot, { left: s.m * ppm + 8 }]}>{s.label}</T>
          ))}
        </View>
      </View>
      <FlatList
        data={channels}
        keyExtractor={(c) => c.key}
        initialNumToRender={14}
        windowSize={7}
        getItemLayout={(_d, i) => ({ length: ROWH, offset: ROWH * i, index: i })}
        renderItem={({ item }) => (
          <Row c={item} progs={programmes.get(item.key) ?? []} windowStart={windowStart} ppm={ppm} now={now} selected={selected} onSelect={onSelect} />
        )}
      />
      {nowVisible && width > 0 && <View pointerEvents="none" style={[styles.nowLine, { left: nowLeft }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.panel, borderRadius: radius.lg, overflow: 'hidden' },
  timeline: { height: 48, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.lineSubtle },
  row: { height: ROWH, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.raised },
  chCell: { width: CHW, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  num: { width: 30, textAlign: 'right' },
  track: { flex: 1, position: 'relative' },
  slot: { position: 'absolute', top: 15 },
  block: { position: 'absolute', top: 5, bottom: 5, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.accent },
});
