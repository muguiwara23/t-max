// Valores de design/tokens.json (densidad "touch"). Una prueba verifica que coincidan.
export const colors = {
  bg: '#0A0B0D',
  panel: '#14161A',
  raised: '#1C1F24',
  hover: '#252930',
  lineSubtle: '#23272E',
  lineStrong: '#343943',
  text: '#F4F5F7',
  textSecondary: '#A4AAB4',
  textTertiary: '#6C727C',
  onAccent: '#0A0B0D',
  accent: '#D7F36A',
  accentPressed: '#C3E054',
  accentSoft: '#D7F36A26',
  live: '#FF5A4E',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  overlayPanel: '#121418E6',
} as const;

export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

export const font = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

/** [tamaño, alto de línea] en pt. */
export const type = {
  display: [28, 34],
  title: [20, 26],
  body: [15, 21],
  label: [13, 18],
  caption: [12, 16],
} as const;
