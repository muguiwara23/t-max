// T-Max para iPhone/iPad. Todo corre en el dispositivo: sin cuentas, sin servidores de T-Max.
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { getDb } from './src/data/db';
import { invalidatePlaybackCache } from './src/data/playback';
import { getChannelByKey, type ChannelItem } from './src/data/queries';
import { needsAutoRefresh } from './src/data/settings-model';
import { listSources, sourceSettings } from './src/data/sources';
import { refreshSource } from './src/data/sync';
import type { VodPlayRequest } from './src/data/vod';
import DvrEngine from './src/dvr/DvrEngine';
import { onNotificationTap } from './src/platform/notify';
import DvrScreen from './src/screens/DvrScreen';
import LiveScreen from './src/screens/LiveScreen';
import MyProgramsScreen from './src/screens/MyProgramsScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import VodPlayerScreen from './src/screens/VodPlayerScreen';
import VodScreen from './src/screens/VodScreen';
import { colors } from './src/theme';
import Rail, { type Section } from './src/ui/Rail';
import { useIsCompact, useIsPhone } from './src/ui/layout';
import { useBack } from './src/ui/back';


export default function App() {
  const phone = useIsPhone();
  const compact = useIsCompact();
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('live');
  const [dataVersion, setDataVersion] = useState(0);
  const [player, setPlayer] = useState<{ list: ChannelItem[]; index: number; autoRecord?: { until: number | null } } | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [vodPlayer, setVodPlayer] = useState<VodPlayRequest | null>(null);
  // Android: Atrás fuera de TV en vivo regresa a TV en vivo (las pantallas internas responden antes).
  useBack(section !== 'live', () => setSection('live'));
  const [progressVersion, setProgressVersion] = useState(0);
  const [liveFocus, setLiveFocus] = useState<{ channel: ChannelItem; n: number } | null>(null);
  const [dvrVersion, setDvrVersion] = useState(0);

  // Fuentes con "Actualizar sola": al abrir T-Max o al volver a ella, si ya toca.
  useEffect(() => {
    if (!ready) return;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const due = (await listSources()).filter((s) => s.enabled && needsAutoRefresh(sourceSettings(s), s.lastRefresh, Date.now()));
        for (const s of due) await refreshSource(s).catch(() => {});
        if (due.length) {
          invalidatePlaybackCache();
          setDataVersion((v) => v + 1);
        }
      } finally {
        running = false;
      }
    };
    run();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void run());
    return () => sub.remove();
  }, [ready]);

  // Tocar un aviso de Mis programas (o de una grabación) abre ese canal.
  useEffect(() => {
    if (!ready) return;
    return onNotificationTap((d) => {
      getChannelByKey(d.channelKey).then((c) => {
        if (!c) return;
        setVodPlayer(null);
        setSection('live');
        setPlayer({ list: [c], index: 0 });
      }).catch(() => {});
    });
  }, [ready]);
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
        <View style={[styles.shell, compact && styles.shellCompact, phone && styles.shellPhone]}>
          {phone ? <Rail horizontal section={section} onChange={setSection} /> : <Rail compact={compact} section={section} onChange={setSection} />}
          <View style={{ flex: 1 }}>
            <View style={[styles.fill, section !== 'live' && styles.hidden]}>
              <LiveScreen
                dataVersion={dataVersion}
                previewEnabled={section === 'live' && !player}
                onFullscreen={(list, index, opts) => setPlayer({ list, index, autoRecord: opts?.autoRecord })}
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
            {section === 'my' && <MyProgramsScreen dataVersion={dataVersion + dvrVersion} onWatch={(c) => setPlayer({ list: [c], index: 0 })} />}
            {section === 'dvr' && <DvrScreen dataVersion={dataVersion + dvrVersion} onPlay={setVodPlayer} />}
          </View>
        </View>
      </SafeAreaView>
      <DvrEngine onChange={() => setDvrVersion((v) => v + 1)} />
      {vodPlayer && <VodPlayerScreen request={vodPlayer} onClose={() => { setVodPlayer(null); setProgressVersion((v) => v + 1); }} />}
      {player && <PlayerScreen list={player.list} startIndex={player.index} autoRecord={player.autoRecord} onClose={(last) => { setPlayer(null); setLiveFocus({ channel: last, n: Date.now() }); bump(); }} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  shell: { flex: 1, flexDirection: 'row', gap: 12, padding: 16 },
  shellCompact: { padding: 6, gap: 6 },
  shellPhone: { flexDirection: 'column-reverse', padding: 8, gap: 8 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
});
