// Ajustes: Fuentes (agregar/activar/actualizar/editar/borrar), Reproductor y Acerca de.
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { getSetting, setSetting } from '../data/db';
import { invalidatePlaybackCache } from '../data/playback';
import {
  deleteSource,
  getSecrets,
  listSources,
  saveSource,
  setSourceEnabled,
  wipeEverything,
  type Source,
  type SourceType,
} from '../data/sources';
import { refreshSource } from '../data/sync';
import { colors, font, radius } from '../theme';
import { Button, Chip, Switch, T } from '../ui/kit';

type Cat = 'sources' | 'player' | 'about';
const CATS: { id: Cat | 'soon'; name: string }[] = [
  { id: 'sources', name: 'Fuentes' },
  { id: 'soon', name: 'Guía EPG' },
  { id: 'player', name: 'Reproductor' },
  { id: 'soon', name: 'Apariencia' },
  { id: 'soon', name: 'Control parental' },
  { id: 'soon', name: 'Mis programas y DVR' },
  { id: 'soon', name: 'Respaldo' },
  { id: 'about', name: 'Acerca de' },
];

function ago(ms: number | null): string {
  if (!ms) return 'nunca';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export default function SettingsScreen({ onDataChanged, startWithAdd }: { onDataChanged: () => void; startWithAdd?: boolean }) {
  const [cat, setCat] = useState<Cat>('sources');
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Source | 'new' | null>(startWithAdd ? 'new' : null);
  const [format, setFormat] = useState('auto');

  const reload = () => listSources().then(setSources).catch(() => {});
  useEffect(() => {
    reload();
    getSetting('format').then((v) => setFormat(v ?? 'auto')).catch(() => {});
  }, []);

  const refresh = async (s: Source) => {
    setBusy((b) => ({ ...b, [s.id]: 'Iniciando…' }));
    try {
      await refreshSource(s, (msg) => setBusy((b) => ({ ...b, [s.id]: msg })));
    } catch {
      // el error queda guardado en la fuente y se muestra en la tarjeta
    } finally {
      setBusy((b) => {
        const { [s.id]: _done, ...rest } = b;
        return rest;
      });
      invalidatePlaybackCache();
      await reload();
      onDataChanged();
    }
  };

  const remove = (s: Source) =>
    Alert.alert('Borrar fuente', `Se borrará "${s.name}" con sus canales, guía y favoritos de este iPad.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteSource(s.id);
          invalidatePlaybackCache();
          await reload();
          onDataChanged();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={styles.header}><T kind="display" weight="bold">Ajustes</T></View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
        <View style={[styles.panel, styles.cats]}>
          {CATS.map((c) => {
            const active = c.id === cat;
            return (
              <Pressable key={c.name} disabled={c.id === 'soon'} onPress={() => c.id !== 'soon' && setCat(c.id)}
                style={[styles.catRow, active && { backgroundColor: colors.hover }]}>
                <T weight={active ? 'bold' : 'medium'} color={c.id === 'soon' ? colors.textTertiary : active ? colors.text : colors.textSecondary}>{c.name}</T>
                {c.id === 'soon' && <T kind="caption" color={colors.textTertiary}>pronto</T>}
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={[styles.panel, { flex: 1 }]} contentContainerStyle={{ padding: 20, gap: 14 }}>
          {cat === 'sources' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T kind="title" weight="bold" style={{ flex: 1 }}>Fuentes</T>
                <Button variant="primary" icon="plus" label="Agregar fuente" onPress={() => setEditing('new')} />
              </View>
              {sources.length === 0 && <T color={colors.textSecondary}>Todavía no hay fuentes. Agrega tu servidor Xtream, una lista M3U o un portal Stalker.</T>}
              {sources.map((s) => (
                <View key={s.id} style={styles.card}>
                  <View style={styles.type}><T kind="caption" weight="bold" color={s.enabled ? colors.accent : colors.textTertiary}>{s.type.toUpperCase()}</T></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T weight="bold" color={s.enabled ? colors.text : colors.textSecondary}>{s.name}</T>
                    <T kind="caption" color={colors.textSecondary}>
                      {busy[s.id]
                        ? busy[s.id]
                        : `Actualizada ${ago(s.lastRefresh)}${s.stats ? ` · ${s.stats.channels} canales · ${s.stats.groups} grupos · guía: ${s.stats.programmes} programas` : ''}`}
                    </T>
                    {s.lastError && !busy[s.id] ? <T kind="caption" color={s.lastResult === 'error' ? colors.danger : colors.warning}>{s.lastError}</T> : null}
                  </View>
                  <Switch label="Fuente activa" value={s.enabled} onChange={async (v) => { await setSourceEnabled(s.id, v); await reload(); onDataChanged(); }} />
                  <Button compact icon="refresh" label="Actualizar" busy={!!busy[s.id]} onPress={() => refresh(s)} />
                  <Button compact icon="edit" onPress={() => setEditing(s)} />
                  <Button compact icon="trash" variant="danger" onPress={() => remove(s)} />
                </View>
              ))}
              <T kind="caption" color={colors.textSecondary}>
                Las contraseñas y MAC se guardan cifradas en el Keychain de este iPad. T-Max no tiene servidores ni cuentas: el iPad habla directo con tus fuentes.
              </T>
            </>
          )}

          {cat === 'player' && (
            <>
              <T kind="title" weight="bold">Reproductor</T>
              <View style={styles.card}>
                <View style={{ flex: 1, gap: 3 }}>
                  <T weight="bold">Formato de canales en vivo (Xtream)</T>
                  <T kind="caption" color={colors.textSecondary}>Automático usa TS si el servidor lo permite (arranca más rápido); si no, M3U8.</T>
                </View>
                {(['auto', 'ts', 'm3u8'] as const).map((f) => (
                  <Chip key={f} label={f === 'auto' ? 'Auto' : f.toUpperCase()} active={format === f} onPress={async () => { setFormat(f); await setSetting('format', f); }} />
                ))}
              </View>
            </>
          )}

          {cat === 'about' && (
            <>
              <T kind="title" weight="bold">Acerca de</T>
              <T weight="bold">T-Max 0.2.2</T>
              <T kind="label" color={colors.textSecondary}>Software libre · GPL-3.0 · github.com/muguiwara23/t-max</T>
              <T kind="label" color={colors.textSecondary}>
                Todo corre en este iPad: sin cuentas, sin servidores de T-Max y sin telemetría. Reproducción con libmpv (MPVKit).
              </T>
              <T kind="label" color={colors.textSecondary}>T-Max es solo un reproductor: no incluye canales ni contenido. Usa únicamente fuentes que tengas derecho a ver.</T>
              <Button variant="danger" icon="trash" label="Borrar todos los datos y credenciales" style={{ alignSelf: 'flex-start' }}
                onPress={() => Alert.alert('Borrar todo', 'Se borrarán fuentes, contraseñas, favoritos y guía de este iPad.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Borrar todo', style: 'destructive', onPress: async () => { await wipeEverything(); invalidatePlaybackCache(); await reload(); onDataChanged(); } },
                ])} />
            </>
          )}
        </ScrollView>
      </View>

      <SourceForm
        visible={editing !== null}
        source={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={async (id) => {
          setEditing(null);
          const list = await listSources();
          setSources(list);
          const s = list.find((x) => x.id === id);
          if (s) await refresh(s);
        }}
      />
    </View>
  );
}

function Field({ label, value, onChange, placeholder, secure, keyboard }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; secure?: boolean; keyboard?: 'url' | 'default';
}) {
  return (
    <View style={{ gap: 6 }}>
      <T kind="label" color={colors.textSecondary}>{label}</T>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textTertiary}
        secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} keyboardType={keyboard === 'url' ? 'url' : 'default'} style={styles.input} />
    </View>
  );
}

function SourceForm({ visible, source, onClose, onSaved }: { visible: boolean; source: Source | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [type, setType] = useState<SourceType>('xtream');
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [mac, setMac] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (source) {
      setType(source.type);
      setName(source.name);
      setServer(source.config.server ?? '');
      setUsername(source.config.username ?? '');
      setEpgUrl(source.config.epgUrl ?? '');
      getSecrets(source.id).then((s) => {
        setPassword(s.password ?? '');
        setM3uUrl(s.m3uUrl ?? '');
        setMac(s.mac ?? '');
      });
    } else {
      setType('xtream');
      setName('');
      setServer('');
      setUsername('');
      setPassword('');
      setM3uUrl('');
      setEpgUrl('');
      setMac('');
    }
  }, [visible, source]);

  const save = async () => {
    const macOk = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim());
    if (type === 'xtream' && (!server.trim() || !username.trim() || !password)) return setError('Llena servidor, usuario y contraseña.');
    if (type === 'm3u' && !/^https?:\/\//i.test(m3uUrl.trim())) return setError('La URL de la lista debe empezar con http:// o https://');
    if (type === 'stalker' && (!server.trim() || !macOk)) return setError('Llena la URL del portal y una MAC con formato 00:1A:79:XX:XX:XX.');
    const finalName = name.trim() || (type === 'xtream' ? 'Xtream' : type === 'm3u' ? 'Lista M3U' : 'Portal Stalker');
    const id = await saveSource({
      id: source?.id,
      type,
      name: finalName,
      config: { server: server.trim() || undefined, username: username.trim() || undefined, epgUrl: epgUrl.trim() || undefined },
      secrets: { password: password || undefined, m3uUrl: m3uUrl.trim() || undefined, mac: mac.trim().toUpperCase() || undefined },
    });
    onSaved(id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalBack}>
        <View style={styles.modal}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T kind="title" weight="bold" style={{ flex: 1 }}>{source ? 'Editar fuente' : 'Agregar fuente'}</T>
            <Button compact icon="close" onPress={onClose} />
          </View>
          {!source && (
            <View style={{ flexDirection: 'row' }}>
              <Chip label="Xtream" active={type === 'xtream'} onPress={() => setType('xtream')} />
              <Chip label="Lista M3U" active={type === 'm3u'} onPress={() => setType('m3u')} />
              <Chip label="Stalker" active={type === 'stalker'} onPress={() => setType('stalker')} />
            </View>
          )}
          <Field label="Nombre" value={name} onChange={setName} placeholder="Ej. Mi servidor" />
          {type === 'xtream' && (
            <>
              <Field label="Servidor" value={server} onChange={setServer} placeholder="http://servidor:puerto" keyboard="url" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><Field label="Usuario" value={username} onChange={setUsername} /></View>
                <View style={{ flex: 1 }}><Field label="Contraseña" value={password} onChange={setPassword} secure /></View>
              </View>
            </>
          )}
          {type === 'm3u' && <Field label="URL de la lista" value={m3uUrl} onChange={setM3uUrl} placeholder="https://…/lista.m3u" keyboard="url" />}
          {type === 'stalker' && (
            <>
              <Field label="URL del portal" value={server} onChange={setServer} placeholder="http://portal/stalker_portal/c/" keyboard="url" />
              <Field label="MAC" value={mac} onChange={setMac} placeholder="00:1A:79:XX:XX:XX" />
            </>
          )}
          {type !== 'stalker' && (
            <Field label="Guía XMLTV (opcional)" value={epgUrl} onChange={setEpgUrl} placeholder={type === 'xtream' ? 'Vacío = la guía del propio servidor' : 'Vacío = la que indique la lista'} keyboard="url" />
          )}
          {error && <T kind="label" color={colors.danger}>{error}</T>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <Button label="Cancelar" onPress={onClose} />
            <Button variant="primary" label="Guardar y actualizar" onPress={save} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, justifyContent: 'center', paddingHorizontal: 4 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg },
  cats: { width: 250, padding: 10, gap: 4 },
  catRow: { height: 48, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { backgroundColor: colors.raised, borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  type: { minWidth: 84, height: 28, borderRadius: 8, backgroundColor: colors.hover, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  input: { height: 46, borderRadius: 12, backgroundColor: colors.hover, color: colors.text, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 16 },
  modalBack: { flex: 1, backgroundColor: '#000000B3', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: 620, maxWidth: '100%', backgroundColor: colors.panel, borderRadius: radius.xl, padding: 24, gap: 14 },
});
