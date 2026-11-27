// Aviso flotante "Ya salió T-Max X": se revisa al abrir la app y al volver a ella (máx. 1 vez al día).
// Solo aparece si de verdad hay una versión publicada más nueva que la instalada.
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';

import { checkForUpdate, dismissUpdate, dismissedVersion, hasAppUpdate, installAndroidUpdate } from '../data/updates';
import type { UpdateInfo } from '../data/update-model';
import { colors, radius } from '../theme';
import Icon from './Icon';
import { Button, T } from './kit';

export default function UpdateBanner({ hidden }: { hidden?: boolean }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const i = await checkForUpdate(false).catch(() => null);
      if (!hasAppUpdate(i)) return setInfo(null);
      if ((await dismissedVersion()) === i!.app) return;
      setInfo(i);
    };
    void run();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void run());
    return () => sub.remove();
  }, []);

  if (!info || hidden) return null;

  const install = async () => {
    if (Platform.OS !== 'android') {
      await Linking.openURL(info.page || info.ios).catch(() => {});
      return;
    }
    setBusy('Descargando 0%…');
    try {
      await installAndroidUpdate(info, (p) => setBusy(`Descargando ${p}%…`));
      setBusy(null);
    } catch (e) {
      setBusy(e instanceof Error ? e.message : 'No se pudo descargar.');
    }
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Icon name="refresh" size={22} color={colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="bold">Ya salió T-Max {info.app}</T>
          <T kind="caption" color={colors.textSecondary} lines={2}>
            {busy ?? (info.notes || (Platform.OS === 'android' ? 'Toca Actualizar y luego Instalar.' : 'Descárgala y fírmala como siempre.'))}
          </T>
        </View>
        <Button compact variant="primary" label={Platform.OS === 'android' ? 'Actualizar' : 'Ver descarga'} disabled={!!busy && busy.startsWith('Descargando')} onPress={() => void install()} />
        <Button compact label="Después" onPress={() => { void dismissUpdate(info.app); setInfo(null); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', zIndex: 50, elevation: 50, paddingHorizontal: 12 },
  card: {
    width: 640, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: radius.xl, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.accentSoft,
  },
});
