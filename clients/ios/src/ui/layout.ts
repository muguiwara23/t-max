// Tamaños de pantalla. La app va siempre en horizontal; en iPhone la pantalla es baja,
// así que se usa un modo compacto (botones y márgenes más chicos).
import { useWindowDimensions } from 'react-native';

/** Pantalla angosta (solo si el sistema la pone en vertical): una columna con pestañas abajo. */
export function useIsPhone(): boolean {
  const { width } = useWindowDimensions();
  return width < 600;
}

/** Pantalla baja (iPhone en horizontal): controles más chicos. */
export function useIsCompact(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) < 500;
}
