import { StyleSheet, View } from 'react-native';

import Pressable from './Press';

import { colors, radius } from '../theme';
import Icon, { type IconName } from './Icon';
import { T } from './kit';

export type Section = 'live' | 'movies' | 'series' | 'my' | 'dvr' | 'settings';

const ITEMS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'live', label: 'En vivo', icon: 'live' },
  { id: 'movies', label: 'Películas', icon: 'movies' },
  { id: 'series', label: 'Series', icon: 'series' },
  { id: 'my', label: 'Mis prog.', icon: 'bell' },
  { id: 'dvr', label: 'DVR', icon: 'dvr' },
];

function Item({ id, label, icon, active, onPress, compact }: { id: Section; label: string; icon: IconName; active: boolean; onPress: (s: Section) => void; compact?: boolean }) {
  const fg = active ? colors.onAccent : colors.textSecondary;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onPress(id)}
      style={[styles.item, compact && styles.itemCompact, active && { backgroundColor: colors.accent }]}>
      <Icon name={icon} size={compact ? 18 : 22} color={fg} />
      <T kind="caption" weight="bold" color={fg} style={{ fontSize: 10, lineHeight: 12 }}>{label}</T>
    </Pressable>
  );
}

export default function Rail({ section, onChange, horizontal, compact }: { section: Section; onChange: (s: Section) => void; horizontal?: boolean; compact?: boolean }) {
  if (compact) {
    // iPhone acostado: barra delgada sin logo; caben las 6 secciones (Ajustes incluido).
    return (
      <View style={styles.railCompact}>
        {ITEMS.map((it) => <Item key={it.id} {...it} compact active={section === it.id} onPress={onChange} />)}
        <View style={{ flex: 1 }} />
        <Item id="settings" label="Ajustes" icon="settings" compact active={section === 'settings'} onPress={onChange} />
      </View>
    );
  }
  if (horizontal) {
    // Teléfono: pestañas abajo.
    return (
      <View style={styles.tabs}>
        {[...ITEMS, { id: 'settings' as Section, label: 'Ajustes', icon: 'settings' as IconName }].map((it) => (
          <View key={it.id} style={{ flex: 1, alignItems: 'center' }}>
            <Item {...it} active={section === it.id} onPress={onChange} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.rail}>
      <View style={styles.logo}><T weight="bold" color={colors.onAccent} style={{ fontSize: 17 }}>TM</T></View>
      {ITEMS.map((it) => <Item key={it.id} {...it} active={section === it.id} onPress={onChange} />)}
      <View style={{ flex: 1 }} />
      <Item id="settings" label="Ajustes" icon="settings" active={section === 'settings'} onPress={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 76, backgroundColor: colors.panel, borderRadius: radius.lg, alignItems: 'center', paddingVertical: 16, gap: 6 },
  logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  railCompact: { width: 60, backgroundColor: colors.panel, borderRadius: radius.md, alignItems: 'center', paddingVertical: 6, gap: 2 },
  itemCompact: { width: 52, height: 46, gap: 1 },
  tabs: { height: 66, flexDirection: 'row', backgroundColor: colors.panel, borderRadius: radius.lg, paddingHorizontal: 4, alignItems: 'center' },
  item: { width: 64, height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
