// Botón Atrás de Android (teléfono y control de TV). El último que se registra responde primero.
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/** Mientras `active` sea true, Atrás llama a `handler` en vez de cerrar la app. */
export function useBack(active: boolean, handler: () => void): void {
  const fn = useRef(handler);
  fn.current = handler;
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      fn.current();
      return true;
    });
    return () => sub.remove();
  }, [active]);
}
