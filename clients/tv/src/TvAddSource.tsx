// Agregar una fuente con el control (paso 1). En el paso 3 se suma "configurar desde el celular".
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { saveSource, listSources, type SourceType } from '@shared/data/sources';
import { refreshSource } from '@shared/data/sync';
import { colors, font, radius } from '@shared/theme';
import { T } from '@shared/ui/kit';

import { TvButton } from './TvHome';

export default function TvAddSource({ canCancel, onCancel, onSaved }: { canCancel: boolean; onCancel: () => void; onSaved: () => void }) {
  const [type, setType] = useState<SourceType>('xtream');
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [url, setUrl] = useState('');
  const [mac, setMac] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (type === 'xtream' && (!server.trim() || !user.trim() || !pass)) return setMsg('Llena servidor, usuario y contraseña.');
    if (type === 'm3u' && !/^https?:\/\//i.test(url.trim())) return setMsg('La URL de la lista debe empezar con http:// o https://');
    if (type === 'stalker' && (!server.trim() || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim()))) return setMsg('Llena la URL del portal y una MAC 00:1A:79:XX:XX:XX.');
    setBusy(true);
    try {
      const id = await saveSource({
        type,
        name: name.trim() || (type === 'xtream' ? 'Xtream' : type === 'm3u' ? 'Lista M3U' : 'Portal Stalker'),
        config: { server: server.trim() || undefined, username: user.trim() || undefined },
        secrets: { password: pass || undefined, m3uUrl: url.trim() || undefined, mac: mac.trim().toUpperCase() || undefined },
      });
      const src = (await listSources()).find((s) => s.id === id);
      if (src) await refreshSource(src, (m) => setMsg(m));
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <T kind="display" weight="bold">Agregar fuente</T>
      <T color={colors.textSecondary}>Se guarda solo en esta TV. Usa el teclado de la pantalla o el de tu control.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['xtream', 'm3u', 'stalker'] as const).map((t) => (
          <Pressable key={t} onPress={() => setType(t)} style={({ focused }) => [styles.tab, type === t && styles.tabOn, focused && styles.focus]}>
            {({ focused }) => <T weight="bold" color={focused || type === t ? colors.onAccent : colors.text}>{t === 'xtream' ? 'Xtream' : t === 'm3u' ? 'Lista M3U' : 'Stalker'}</T>}
          </Pressable>
        ))}
      </View>
      <Field label="Nombre" value={name} onChange={setName} />
      {type !== 'm3u' && <Field label={type === 'xtream' ? 'Servidor' : 'URL del portal'} value={server} onChange={setServer} />}
      {type === 'xtream' && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Usuario" value={user} onChange={setUser} /></View>
          <View style={{ flex: 1 }}><Field label="Contraseña" value={pass} onChange={setPass} secure /></View>
        </View>
      )}
      {type === 'm3u' && <Field label="URL de la lista" value={url} onChange={setUrl} />}
      {type === 'stalker' && <Field label="MAC" value={mac} onChange={setMac} />}
      {msg ? <T color={colors.warning}>{msg}</T> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TvButton primary label={busy ? 'Guardando…' : 'Guardar y actualizar'} onPress={() => void save()} />
        {canCancel && <TvButton label="Cancelar" onPress={onCancel} />}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, secure }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T kind="label" color={colors.textSecondary}>{label}</T>
      <TextInput value={value} onChangeText={onChange} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={[styles.input, focused && { borderColor: colors.accent }]} placeholderTextColor={colors.textTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, maxWidth: 720, alignSelf: 'center', width: '100%', gap: 12, paddingTop: 12 },
  tab: { height: 40, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.raised, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.accentSoft },
  focus: { backgroundColor: colors.accent, transform: [{ scale: 1.05 }] },
  input: { height: 48, borderRadius: 12, backgroundColor: colors.hover, color: colors.text, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 18, borderWidth: 2, borderColor: 'transparent' },
});
