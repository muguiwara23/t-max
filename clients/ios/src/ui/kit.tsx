// Piezas básicas reutilizables con los tokens del diseño.
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import Pressable from './Press';

import { colors, font, radius, type } from '../theme';
import Icon, { type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function T({ children, style, kind = 'body', color = colors.text, weight = 'medium', lines }: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  kind?: keyof typeof type;
  color?: string;
  weight?: keyof typeof font;
  lines?: number;
}) {
  const [size, lh] = type[kind];
  return (
    <Text numberOfLines={lines} style={[{ fontFamily: font[weight], fontSize: size, lineHeight: lh, color }, style]}>
      {children}
    </Text>
  );
}

export function Button({ label, icon, onPress, variant = 'secondary', busy, disabled, style, compact }: {
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? '#F8717126' : variant === 'ghost' ? 'transparent' : colors.raised;
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        !label && styles.btnIcon,
        !label && compact && styles.btnIconCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={compact ? 16 : 18} color={fg} /> : null}
      {label ? <T kind={compact ? 'label' : 'body'} weight="bold" color={fg}>{label}</T> : null}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={[styles.chip, { backgroundColor: active ? colors.accent : colors.raised }]}>
      <T kind="label" weight="bold" color={active ? colors.onAccent : colors.text}>{label}</T>
    </Pressable>
  );
}

export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)}
      style={[styles.sw, { backgroundColor: value ? colors.accent : colors.lineStrong, justifyContent: value ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.knob, { backgroundColor: value ? colors.onAccent : colors.text }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { height: 44, paddingHorizontal: 18, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnCompact: { height: 36, paddingHorizontal: 14 },
  btnIcon: { width: 44, paddingHorizontal: 0 },
  btnIconCompact: { width: 36 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', marginRight: 8 },
  sw: { width: 52, height: 30, borderRadius: radius.pill, padding: 3, flexDirection: 'row' },
  knob: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden' },
});
