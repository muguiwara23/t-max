// Pressable con foco visible para control remoto (Android TV y teclado/D-pad).
// En pantallas táctiles se comporta igual que Pressable; con D-pad dibuja el anillo lima del diseño de TV.
import { forwardRef, useState } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';

import { colors } from '../theme';

const FOCUS_RING: ViewStyle = { borderWidth: 3, borderColor: colors.accent, transform: [{ scale: 1.04 }] };

const Press = forwardRef<View, PressableProps>(function Press({ style, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <RNPressable
      ref={ref}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={(state) => {
        const base = typeof style === 'function' ? style(state) : style;
        return (focused ? [base, FOCUS_RING] : base) as StyleProp<ViewStyle>;
      }}
    />
  );
});

export default Press;
