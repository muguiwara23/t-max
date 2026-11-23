// T-Max para iPhone/iPad. Todo corre en el dispositivo: sin cuentas, sin servidores de T-Max.
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { getDb } from './src/data/db';
import type { ChannelItem } from './src/data/queries';
import { listSources } from './src/data/sources';
import LiveScreen from './src/screens/LiveScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import VodPlayerScreen from './src/screens/VodPlayerScreen';
import VodScreen from './src/screens/VodScreen';
import type { VodPlayRequest } from './src/data/vod';
import { colors } from './src/theme';
import type { IconName } from './src/ui/Icon';
import Icon from './src/ui/Icon';
import { T } from './src/ui/kit';
import Rail, { type Section } from './src/ui/Rail';

const SOON: Record<'my' | 'dvr', { title: string; icon: IconName; text: string }> = {
  my: { title: 'Mis programas', icon: 'bell', text: 'Guardar programas desde la guía y recibir avisos llega en la versión 0.4.' },
  dvr: { title: 'DVR', icon: 'dvr', text: 'Grabar en este iPad llega en la versión 0.4.' },
};

export default function App() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('live');
  const [dataVersion, setDataVersion] = useState(0);
  const [player, setPlayer] = useState<{ list: ChannelItem[]; index: number } | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [vodPlayer, setVodPlayer] = useState<VodPlayRequest | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const [liveFocus, setLiveFocus] = useState<{ channel: ChannelItem; n: number } | null>(null);
  // Películas y Series se montan la primera vez que se abren y luego conservan su estado.
  const [visited, setVisited] = useState<{ movies: boolean; series: boolean }>({ movies: false, series: false });

  useEffect(() => {
    if ((section === 'movies' || section === 'series') && !visited[section]) setVisited((v) => ({ ...v, [section]: true }));
  }, [section, visited]);

  useEffect(() => {
    (async () => {
      await getDb();
      const sources = await listSources();
      if (sources.length === 0) {
        setFirstRun(true);
        setSection('settings');
      }
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  if (!fontsLoaded || !ready) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const bump = () => setDataVersion((v) => v + 1);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.shell}>
          <Rail section={section} onChange={setSection} />
          <View style={{ flex: 1 }}>
            <View style={[styles.fill, section !== 'live' && styles.hidden]}>
              <LiveScreen
                dataVersion={dataVersion}
                previewEnabled={section === 'live' && !player}
                onFullscreen={(list, index) => setPlayer({ list, index })}
                onOpenSettings={() => setSection('settings')}
                focus={liveFocus}
              />
            </View>
            {visited.movies && (
              <View style={[styles.fill, section !== 'movies' && styles.hidden]}>
                <VodScreen kind="movie" dataVersion={dataVersion} progressVersion={progressVersion} onPlay={setVodPlayer} onOpenSettings={() => setSection('settings')} />
              </View>
            )}
            {visited.series && (
              <View style={[styles.fill, section !== 'series' && styles.hidden]}>
                <VodScreen kind="series" dataVersion={dataVersion} progressVersion={progressVersion} onPlay={setVodPlayer} onOpenSettings={() => setSection('settings')} />
              </View>
            )}
            {section === 'settings' && <SettingsScreen onDataChanged={bump} startWithAdd={firstRun} />}
            {(section === 'my' || section === 'dvr') && (
              <View style={[styles.fill, styles.soon]}>
                <Icon name={SOON[section].icon} size={44} color={colors.textTertiary} />
                <T kind="display" weight="bold" style={{ marginTop: 12 }}>{SOON[section].title}</T>
                <T color={colors.textSecondary} style={{ marginTop: 6, textAlign: 'center' }}>{SOON[section].text}</T>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
      {vodPlayer && <VodPlayerScreen request={vodPlayer} onClose={() => { setVodPlayer(null); setProgressVersion((v) => v + 1); }} />}
      {player && <PlayerScreen list={player.list} startIndex={player.index} onClose={(last) => { setPlayer(null); setLiveFocus({ channel: last, n: Date.now() }); bump(); }} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  shell: { flex: 1, flexDirection: 'row', gap: 12, padding: 16 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
  soon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderRadius: 20, padding: 32 },
});
