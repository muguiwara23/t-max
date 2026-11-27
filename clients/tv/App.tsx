// T-Max TV (Android TV; Apple TV más adelante). Comparte datos, reproductor y tipografía con la
// app del celular (clients/ios/src) y tiene pantallas propias pensadas para control remoto.
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@shared/data/db';
import type { ChannelItem } from '@shared/data/queries';
import { colors } from '@shared/theme';

import TvHome from './src/TvHome';
import TvPlayer from './src/TvPlayer';

const TV_VERSION = '0.1.1';

// ---- Diagnóstico: cualquier error de JavaScript se muestra en pantalla en vez de dejarla en negro ----
type Fatal = { message: string; stack?: string };
let reportFatal: (f: Fatal) => void = () => {};
const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } };
if (g.ErrorUtils) {
  const prev = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => {
    const err = e instanceof Error ? e : new Error(String(e));
    reportFatal({ message: err.message, stack: err.stack });
    if (!fatal) prev(e, fatal);
  });
}

function ErrorScreen({ f, step }: { f: Fatal; step: string }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 32, gap: 12 }}>
      <Text style={[styles.mono, { color: colors.danger, fontSize: 22 }]}>T-Max TV {TV_VERSION} · error en: {step}</Text>
      <Text style={[styles.mono, { color: colors.text, fontSize: 18 }]}>{f.message}</Text>
      <Text style={[styles.mono, { color: colors.textSecondary, fontSize: 13 }]}>{(f.stack ?? '').split('\n').slice(0, 14).join('\n')}</Text>
      <Text style={[styles.mono, { color: colors.textTertiary, fontSize: 14 }]}>Toma una foto de esta pantalla y mándala.</Text>
    </ScrollView>
  );
}

class Boundary extends Component<{ step: string; children: ReactNode }, { f: Fatal | null }> {
  state = { f: null as Fatal | null };
  static getDerivedStateFromError(e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { f: { message: err.message, stack: err.stack } };
  }
  render() {
    return this.state.f ? <ErrorScreen f={this.state.f} step={this.props.step} /> : this.props.children;
  }
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [fontsTimeout, setFontsTimeout] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [step, setStep] = useState('arranque');
  const [player, setPlayer] = useState<{ list: ChannelItem[]; index: number } | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    reportFatal = setFatal;
    const t = setTimeout(() => setFontsTimeout(true), 8000);
    setStep('base de datos');
    getDb()
      .then(() => setDbReady(true))
      .catch((e: unknown) => setFatal({ message: `Base de datos: ${e instanceof Error ? e.message : String(e)}`, stack: e instanceof Error ? e.stack : undefined }));
    return () => clearTimeout(t);
  }, []);

  const fontsOk = fontsLoaded || !!fontError || fontsTimeout;

  if (fatal) return <ErrorScreen f={fatal} step={step} />;

  if (!fontsOk || !dbReady) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={{ color: colors.textSecondary, fontSize: 18 }}>
          T-Max TV {TV_VERSION} · preparando {!fontsOk ? 'letras' : 'base de datos'}…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Boundary step="inicio">
        <TvHome hidden={!!player} focusKey={lastKey} onPlay={(list, index) => { setStep('reproductor'); setPlayer({ list, index }); }} />
      </Boundary>
      {player && (
        <Boundary step="reproductor">
          <TvPlayer
            list={player.list}
            startIndex={player.index}
            onClose={(last) => {
              setLastKey(last.key);
              setPlayer(null);
              setStep('inicio');
            }}
          />
        </Boundary>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mono: { fontFamily: 'monospace' },
});
