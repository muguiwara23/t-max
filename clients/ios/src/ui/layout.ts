// Tamaño de pantalla: el iPhone (y teléfonos en general) usa diseño de una columna con pestañas abajo.
import { useWindowDimensions } from 'react-native';

export function useIsPhone(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) < 600;
}
