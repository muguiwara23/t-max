import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import PlayerScreen, { type PlayItem } from './src/PlayerScreen';
import { redact } from './src/redact';
import * as store from './src/storage';
import { colors } from './src/theme';
import {
  chooseFormat,
  getLiveCategories,
  getLiveStreams,
  liveUrl,
  login,
  type FormatPreference,
  type LiveCategory,
  type LiveChannel,
  type XtreamAccount,
  type XtreamCredentials,
} from './src/xtream';

// Streams públicos de ejemplo de Apple (HLS con segmentos TS, varias pistas de audio y subtítulos).
const PUBLIC_TESTS: PlayItem[] = [
  {
    title: 'Apple · Advanced (TS, audio y subtítulos)',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
    format: 'm3u8',
  },
  {
    title: 'Apple · BipBop 4x3',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8',
    format: 'm3u8',
  },
];

type Playing = { items: PlayItem[]; index: number } | null;

export default function App() {
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [formatPref, setFormatPref] = useState<FormatPreference>('auto');
  const [account, setAccount] = useState<XtreamAccount | null>(null);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Playing>(null);

  const creds: XtreamCredentials = { server, username, password };
  const secrets = useMemo(() => [password, username].filter(Boolean), [password, username]);

  useEffect(() => {
    (async () => {
      const saved = await store.loadXtream();
      if (saved) {
        setServer(saved.server);
        setUsername(saved.username);
        setPassword(saved.password);
      }
      setDirectUrl(await store.loadDirectUrl());
      setFormatPref(await store.loadFormat());
    })();
  }, []);

  const format = chooseFormat(formatPref, account);

  const connect = async () => {
    if (!server || !username || !password) {
      setMessage('Llena servidor, usuario y contraseña.');
      return;
    }
    setBusy(true);
    setMessage('Conectando…');
    const t0 = Date.now();
    try {
      const acc = await login(creds);
      setAccount(acc);
      await store.saveXtream(creds);
      setMessage('Descargando categorías y canales…');
      const [cats, chs] = await Promise.all([getLiveCategories(creds), getLiveStreams(creds)]);
      setCategories(cats);
      setChannels(chs);
      setMessage(`${chs.length} canales en ${cats.length} categorías (${Date.now() - t0} ms).`);
    } catch (e: any) {
      setMessage(redact(String(e?.message ?? e), secrets));
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(
      (c) =>
        (!category || c.categoryId === category) &&
        (!q || c.name.toLowerCase().includes(q) || String(c.number ?? '') === q),
    );
  }, [channels, category, query]);

  const playChannel = (i: number) => {
    const items: PlayItem[] = filtered.map((c) => ({
      title: c.number != null ? `${c.number} · ${c.name}` : c.name,
      url: liveUrl(creds, c.streamId, format),
      format,
    }));
    setPlaying({ items, index: i });
  };

  const playDirect = async () => {
    const url = directUrl.trim();
    if (!url) return;
    await store.saveDirectUrl(url);
    const ext = /\.m3u8(\?|$)/i.test(url) ? 'm3u8' : /\.ts(\?|$)/i.test(url) ? 'ts' : 'directa';
    setPlaying({ items: [{ title: 'URL directa', url, format: ext }], index: 0 });
  };

  const setPref = (f: FormatPreference) => {
    setFormatPref(f);
    store.saveFormat(f);
  };

  const wipe = async () => {
    await store.clearAll();
    setServer('');
    setUsername('');
    setPassword('');
    setDirectUrl('');
    setAccount(null);
    setChannels([]);
    setCategories([]);
    setMessage('Datos locales borrados.');
  };

  if (playing) {
    return (
      <PlayerScreen
        items={playing.items}
        startIndex={playing.index}
        secrets={secrets}
        onClose={() => setPlaying(null)}
      />
    );
  }

  const header = (
    <View style={{ gap: 16 }}>
      <Text style={styles.h1}>T-Max · prueba de reproducción</Text>
      <Text style={styles.muted}>Motor: libmpv (MPVKit). Los datos se guardan solo en este dispositivo.</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Fuente Xtream</Text>
        <TextInput
          style={styles.input}
          placeholder="Servidor (ej. http://mi-servidor:9191)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={server}
          onChangeText={setServer}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Usuario"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Contraseña"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>
        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={connect} disabled={busy}>
            <Text style={styles.btnText}>{busy ? 'Conectando…' : 'Conectar'}</Text>
          </Pressable>
          {busy && <ActivityIndicator color={colors.text} />}
        </View>
        {message && <Text style={styles.muted}>{message}</Text>}
        {account && (
          <Text style={styles.muted}>
            Estado: {account.status || '—'} · Formatos del servidor:{' '}
            {account.allowedFormats.length ? account.allowedFormats.join(', ') : 'no informa'} · Conexiones:{' '}
            {account.activeConnections ?? '?'}/{account.maxConnections ?? '?'}
            {account.expiresAt ? ` · Vence: ${account.expiresAt.toLocaleDateString()}` : ''}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Formato para canales en vivo</Text>
        <View style={styles.row}>
          {(['auto', 'ts', 'm3u8'] as FormatPreference[]).map((f) => (
            <Pressable key={f} style={[styles.chip, formatPref === f && styles.chipOn]} onPress={() => setPref(f)}>
              <Text style={styles.chipText}>{f === 'auto' ? 'Automático' : f.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.muted}>Se usará: .{format}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>URL directa</Text>
        <TextInput
          style={styles.input}
          placeholder="Pega aquí cualquier URL de stream (.ts, .m3u8, .mp4, .mkv…)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={directUrl}
          onChangeText={setDirectUrl}
        />
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={playDirect}>
            <Text style={styles.btnText}>Reproducir URL</Text>
          </Pressable>
          {PUBLIC_TESTS.map((t, i) => (
            <Pressable key={t.url} style={styles.btn} onPress={() => setPlaying({ items: PUBLIC_TESTS, index: i })}>
              <Text style={styles.btnText}>{t.title}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {channels.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.h2}>Canales ({filtered.length})</Text>
          <TextInput
            style={styles.input}
            placeholder="Buscar por nombre o número"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Pressable style={[styles.chip, !category && styles.chipOn]} onPress={() => setCategory(null)}>
              <Text style={styles.chipText}>Todas</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, category === c.id && styles.chipOn]}
                onPress={() => setCategory(c.id)}
              >
                <Text style={styles.chipText}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <FlatList
        contentContainerStyle={styles.content}
        data={filtered}
        keyExtractor={(c) => c.streamId}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={30}
        windowSize={10}
        renderItem={({ item, index }) => (
          <Pressable style={styles.channel} onPress={() => playChannel(index)}>
            <Text style={styles.channelNum}>{item.number ?? ''}</Text>
            <Text style={styles.channelName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.hasArchive && <Text style={styles.badge}>catch-up</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable style={[styles.btn, { alignSelf: 'flex-start', marginTop: 24 }]} onPress={wipe}>
            <Text style={styles.btnText}>Borrar datos locales y credenciales</Text>
          </Pressable>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 60, gap: 4, maxWidth: 900, width: '100%', alignSelf: 'center' },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  btn: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  btnPrimary: { backgroundColor: colors.accent },
  btnText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  chip: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, marginRight: 8 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceAlt,
  },
  channelNum: { color: colors.muted, width: 48, textAlign: 'right', fontVariant: ['tabular-nums'] },
  channelName: { color: colors.text, fontSize: 16, flex: 1 },
  badge: { color: colors.ok, fontSize: 12 },
});
