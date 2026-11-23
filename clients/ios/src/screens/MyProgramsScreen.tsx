// Mis programas: lo que guardaste desde la guía. El iPad avisa un minuto antes y al tocar el aviso abre el canal.
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { hhmm } from '../data/mapping';
import { getChannelByKey, type ChannelItem } from '../data/queries';
import { listReminders, pruneReminders, removeReminder, type Reminder } from '../data/reminders';
import { ensureNotifyPermission } from '../platform/notify';
import { colors, radius } from '../theme';
import Icon from '../ui/Icon';
import { Button, T } from '../ui/kit';

const DAY = 86400000;

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / DAY);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function MyProgramsScreen({ dataVersion, onWatch }: { dataVersion: number; onWatch: (c: ChannelItem) => void }) {
  const [list, setList] = useState<Reminder[]>([]);
  const [version, setVersion] = useState(0);
  const [notifOk, setNotifOk] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    pruneReminders().then(() => listReminders()).then(setList).catch(() => setList([]));
  }, [dataVersion, version]);

  useEffect(() => {
    ensureNotifyPermission().then(setNotifOk).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const watch = async (r: Reminder) => {
    const c = await getChannelByKey(r.channel_key);
    if (c) onWatch(c);
    else Alert.alert('Canal no disponible', 'Ese canal ya no está en tus fuentes activas.');
  };

  const rows: ({ kind: 'day'; label: string } | { kind: 'item'; r: Reminder })[] = [];
  let lastDay = '';
  for (const r of list) {
    const l = dayLabel(r.start);
    if (l !== lastDay) {
      rows.push({ kind: 'day', label: l });
      lastDay = l;
    }
    rows.push({ kind: 'item', r });
  }

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={styles.header}>
        <T kind="display" weight="bold">Mis programas</T>
      </View>
      {!notifOk && (
        <View style={[styles.panel, { padding: 14 }]}>
          <T color={colors.warning}>Las notificaciones de T-Max están apagadas: los programas se guardan, pero el iPad no te avisará. Actívalas en Ajustes del iPad → T-Max → Notificaciones.</T>
        </View>
      )}
      <View style={[styles.panel, { flex: 1, padding: 10 }]}>
        <FlatList
          data={rows}
          keyExtractor={(x) => (x.kind === 'day' ? `d:${x.label}` : x.r.id)}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
              <Icon name="bell" size={40} color={colors.textTertiary} />
              <T kind="title" weight="bold">Nada guardado todavía</T>
              <T color={colors.textSecondary} style={{ textAlign: 'center', maxWidth: 520 }}>
                En TV en vivo → Guía, toca un programa y elige "Recordarme". También desde las tarjetas de "A continuación".
              </T>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'day') return <T kind="label" weight="semibold" color={colors.textSecondary} style={styles.day}>{item.label.toUpperCase()}</T>;
            const r = item.r;
            const live = r.start <= now && r.end > now;
            return (
              <View style={styles.row}>
                <View style={{ width: 110 }}>
                  <T weight="bold" style={{ fontVariant: ['tabular-nums'] }}>{hhmm(r.start)} – {hhmm(r.end)}</T>
                  {live ? <T kind="caption" weight="bold" color={colors.live}>EN VIVO</T> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T weight="semibold" lines={1}>{r.title}</T>
                  <T kind="caption" color={colors.textSecondary} lines={1}>{r.channel_name}{r.description ? ` · ${r.description}` : ''}</T>
                </View>
                <Button compact icon="play" label={live ? 'Ver ahora' : 'Ver canal'} variant={live ? 'primary' : 'secondary'} onPress={() => void watch(r)} />
                <Pressable accessibilityLabel="Quitar" hitSlop={8} onPress={() => removeReminder(r.id).then(() => setVersion((v) => v + 1))} style={styles.remove}>
                  <Icon name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, justifyContent: 'center', paddingHorizontal: 4 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg },
  day: { marginTop: 12, marginBottom: 4, marginLeft: 10, letterSpacing: 0.6 },
  row: { minHeight: 64, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.raised, marginBottom: 6 },
  remove: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.hover, alignItems: 'center', justifyContent: 'center' },
});
