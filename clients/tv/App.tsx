// T-Max TV (Android TV; Apple TV más adelante). Comparte datos, reproductor y tipografía con la
// app del celular (clients/ios/src) y tiene pantallas propias pensadas para control remoto.
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getDb } from '@shared/data/db';
import type { ChannelItem } from '@shared/data/queries';
import { colors } from '@shared/theme';

import TvHome from './src/TvHome';
import TvPlayer from './src/TvPlayer';

export default function App() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [ready, setReady] = useState(false);
  const [player, setPlayer] = useState<{ list: ChannelItem[]; index: number } | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    getDb().then(() => setReady(true)).catch(() => setReady(true));
  }, []);

  if (!fontsLoaded || !ready) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <TvHome hidden={!!player} focusKey={lastKey} onPlay={(list, index) => setPlayer({ list, index })} />
      {player && (
        <TvPlayer
          list={player.list}
          startIndex={player.index}
          onClose={(last) => {
            setLastKey(last.key);
            setPlayer(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
