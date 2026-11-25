// Ajustes: Fuentes (cada una con sus propios ajustes), Reproductor y subtítulos, Respaldo y Acerca de.
import { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import Pressable from '../ui/Press';

import { getSetting, setSetting } from '../data/db';
import { deriveStalkerDeviceIds } from '@tmax/core';

import { exportBackup, pickBackup, restoreBackup } from '../data/backup';
import { clearLog, logAsText, readLog, type DiagEvent } from '../data/diag';
import { invalidatePlaybackCache } from '../data/playback';
import { getGlobalSubStyle, setGlobalSubStyle } from '../data/prefs';
import { DEFAULT_SUB_STYLE, type SubStyle } from '../data/settings-model';
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
import { SourceSettingsModal, SubStyleEditor } from './SourceSettings';
import { useIsCompact, useIsPhone } from '../ui/layout';

export const APP_VERSION = '0.6.1';

type Cat = 'sources' | 'player' | 'backup' | 'diag' | 'about';
const CATS: { id: Cat | 'soon'; name: string }[] = [
  { id: 'sources', name: 'Fuentes' },
  { id: 'player', name: 'Reproductor y subtítulos' },
  { id: 'backup', name: 'Respaldo' },
  { id: 'diag', name: 'Diagnóstico' },
  { id: 'soon', name: 'Apariencia' },
  { id: 'soon', name: 'Control parental' },
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
  const isPhone = useIsPhone();
  const isCompact = useIsCompact();
  const phone = isPhone || isCompact;
  const [cat, setCat] = useState<Cat>('sources');
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Source | 'new' | null>(startWithAdd ? 'new' : null);
  const [format, setFormat] = useState('auto');
  const [tuning, setTuning] = useState<Source | null>(null);
  const [subs, setSubs] = useState<SubStyle>(DEFAULT_SUB_STYLE);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [log, setLog] = useState<DiagEvent[]>([]);
  useEffect(() => {
    if (cat === 'diag') readLog().then(setLog).catch(() => setLog([]));
  }, [cat]);

  const reload = () => listSources().then(setSources).catch(() => {});
  useEffect(() => {
    reload();
    getSetting('format').then((v) => setFormat(v ?? 'auto')).catch(() => {});
    getGlobalSubStyle().then(setSubs).catch(() => {});
  }, []);

  const doExport = async () => {
    setBackupBusy('Preparando…');
    try {
      await exportBackup(APP_VERSION);
    } catch (e) {
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(null);
    }
  };

  const doImport = async () => {
    try {
      const b = await pickBackup();
      if (!b) return;
      Alert.alert(
        'Importar respaldo',
        `${b.app} · ${new Date(b.exportedAt).toLocaleString('es-MX')}\n${b.sources.length} fuentes.\n\nSe reemplazará todo lo de este iPad (las grabaciones ya hechas se conservan). Luego se actualizan las fuentes.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar',
            style: 'destructive',
            onPress: async () => {
              setBackupBusy('Importando…');
              try {
                await restoreBackup(b);
                invalidatePlaybackCache();
                const list = await listSources();
                setSources(list);
                getSetting('format').then((v) => setFormat(v ?? 'auto')).catch(() => {});
                getGlobalSubStyle().then(setSubs).catch(() => {});
                onDataChanged();
                setBackupBusy(null);
                setCat('sources');
                for (const s of list.filter((x) => x.enabled)) await refresh(s);
              } catch (e) {
                setBackupBusy(null);
                Alert.alert('No se pudo importar', e instanceof Error ? e.message : String(e));
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('No se pudo leer el archivo', e instanceof Error ? e.message : String(e));
    }
  };

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
      <View style={{ flex: 1, flexDirection: phone ? 'column' : 'row', gap: phone ? 6 : 12 }}>
        {phone && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {CATS.filter((c) => c.id !== 'soon').map((c) => <Chip key={c.name} label={c.name} active={c.id === cat} onPress={() => setCat(c.id as Cat)} />)}
          </ScrollView>
        )}
        <View style={[styles.panel, styles.cats, phone && { display: 'none' }]}>
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

        <ScrollView style={[styles.panel, { flex: 1 }]} contentContainerStyle={{ padding: phone ? 12 : 20, gap: 14 }}>
          {cat === 'sources' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T kind="title" weight="bold" style={{ flex: 1 }}>Fuentes</T>
                {sources.length > 1 && (
                  <Button icon="refresh" label="Actualizar todas" busy={Object.keys(busy).length > 0} style={{ marginRight: 10 }}
                    onPress={async () => { for (const x of sources.filter((y) => y.enabled)) await refresh(x); }} />
                )}
                <Button variant="primary" icon="plus" label="Agregar fuente" onPress={() => setEditing('new')} />
              </View>
              {sources.length === 0 && <T color={colors.textSecondary}>Todavía no hay fuentes. Agrega tu servidor Xtream, una lista M3U o un portal Stalker.</T>}
              {sources.map((s) => (
                <View key={s.id} style={[styles.card, phone && { flexWrap: 'wrap' }]}>
                  <View style={styles.type}><T kind="caption" weight="bold" color={s.enabled ? colors.accent : colors.textTertiary}>{s.type.toUpperCase()}</T></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T weight="bold" color={s.enabled ? colors.text : colors.textSecondary}>{s.name}</T>
                    <T kind="caption" color={colors.textSecondary}>
                      {busy[s.id]
                        ? busy[s.id]
                        : `Actualizada ${ago(s.lastRefresh)}${s.stats ? ` · ${s.stats.channels} canales · ${s.stats.groups} grupos · guía: ${s.stats.programmes} programas${s.stats.movies != null ? ` · ${s.stats.movies} películas · ${s.stats.series ?? 0} series` : ''}` : ''}`}
                    </T>
                    {s.lastError && !busy[s.id] ? <T kind="caption" color={s.lastResult === 'error' ? colors.danger : colors.warning}>{s.lastError}</T> : null}
                  </View>
                  <Switch label="Fuente activa" value={s.enabled} onChange={async (v) => { await setSourceEnabled(s.id, v); await reload(); onDataChanged(); }} />
                  <Button compact icon="refresh" label="Actualizar" busy={!!busy[s.id]} onPress={() => refresh(s)} />
                  <Button compact icon="settings" onPress={() => setTuning(s)} />
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
                  <Chip key={f} label={f === 'auto' ? 'Auto' : f.toUpperCase()} active={format === f} onPress={async () => { setFormat(f); await setSetting('format', f); invalidatePlaybackCache(); }} />
                ))}
              </View>
              <T kind="caption" color={colors.textSecondary}>Cada fuente puede tener su propio formato en su botón de ajustes (⚙) en Fuentes.</T>
              <T kind="title" weight="bold" style={{ marginTop: 8 }}>Subtítulos</T>
              <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <SubStyleEditor value={subs} onChange={(v) => { setSubs(v); setGlobalSubStyle(v).catch(() => {}); invalidatePlaybackCache(); }} />
              </View>
              <T kind="caption" color={colors.textSecondary}>Es el estilo general. Una fuente puede tener el suyo en su botón de ajustes (⚙). Se aplica al abrir el siguiente video.</T>
            </>
          )}

          {cat === 'backup' && (
            <>
              <T kind="title" weight="bold">Respaldo</T>
              <T color={colors.textSecondary}>
                Guarda en un archivo todo lo que configuraste: fuentes, ajustes de cada fuente, grupos ocultos y su orden, favoritos, avance de películas y series, Mis programas, grabaciones programadas y estilo de subtítulos. Sirve para pasarlo a otro iPad o como copia de seguridad.
              </T>
              <View style={[styles.card, { borderColor: colors.warning, borderWidth: 1 }]}>
                <T kind="label" color={colors.warning} style={{ flex: 1 }}>
                  El archivo incluye tus contraseñas y MAC en texto normal. Guárdalo en un lugar privado y no lo compartas.
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button variant="primary" icon="expand" label="Exportar respaldo" busy={backupBusy === 'Preparando…'} onPress={doExport} />
                <Button icon="plus" label="Importar respaldo" busy={backupBusy === 'Importando…'} onPress={doImport} />
              </View>
              <T kind="caption" color={colors.textSecondary}>No incluye canales, guía ni catálogos: se vuelven a descargar solos al importar. Las grabaciones están en Fotos.</T>
            </>
          )}

          {cat === 'diag' && (
            <>
              <T kind="title" weight="bold">Diagnóstico</T>
              <T kind="label" color={colors.textSecondary}>
                Lo que pasó al reproducir: arranques, cortes, reconexiones y sesiones de Stalker. Se guarda solo en este iPad, sin contraseñas ni MAC. Si algo falla "cada tanto", comparte este registro.
              </T>
              <T kind="caption" color={colors.textTertiary}>
                {Platform.OS === 'ios' ? `${(Platform.constants as { interfaceIdiom?: string }).interfaceIdiom === 'pad' ? 'iPad' : 'iPhone'} · iOS ${Platform.Version}` : Platform.OS} · T-Max {APP_VERSION}
              </T>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button icon="expand" label="Compartir registro" onPress={() => Share.share({ message: `T-Max ${APP_VERSION} · iOS ${Platform.Version}\n\n${logAsText(log)}` }).catch(() => {})} />
                <Button icon="refresh" label="Actualizar" onPress={() => readLog().then(setLog)} />
                <Button icon="trash" variant="danger" label="Borrar" onPress={() => clearLog().then(() => setLog([]))} />
              </View>
              {log.length === 0 && <T color={colors.textSecondary}>Sin eventos todavía.</T>}
              {log.slice(0, 150).map((e, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <T kind="caption" color={colors.textTertiary} style={{ width: 118, fontVariant: ['tabular-nums'] }}>
                    {new Date(e.at).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </T>
                  <T kind="caption" weight="bold" style={{ width: 70 }}
                    color={e.kind === 'error' ? colors.danger : e.kind === 'reconnect' ? colors.warning : e.kind === 'stalker' ? colors.accent : colors.textSecondary}>
                    {e.kind}
                  </T>
                  <T kind="caption" color={colors.textSecondary} style={{ flex: 1 }}>
                    {[e.source, e.channel].filter(Boolean).join(' · ')}{e.source || e.channel ? ' — ' : ''}{e.msg}
                  </T>
                </View>
              ))}
            </>
          )}

          {cat === 'about' && (
            <>
              <T kind="title" weight="bold">Acerca de</T>
              <T weight="bold">T-Max {APP_VERSION}</T>
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

      <SourceSettingsModal source={tuning} onClose={() => setTuning(null)} onSaved={async () => { setTuning(null); await reload(); onDataChanged(); }} />
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
        secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} keyboardType={keyboard === 'url' ? 'url' : 'default'}
        returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={() => Keyboard.dismiss()} style={styles.input} />
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
  const [adv, setAdv] = useState(false);
  const [sn, setSn] = useState('');
  const [dev1, setDev1] = useState('');
  const [dev2, setDev2] = useState('');
  const [sig, setSig] = useState('');
  const [sig2, setSig2] = useState('');
  const [pLogin, setPLogin] = useState('');
  const [pPass, setPPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const compact = useIsCompact() || useIsPhone();

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
        setSn(s.serialNumber ?? '');
        setDev1(s.deviceId1 ?? '');
        setDev2(s.deviceId2 ?? '');
        setSig(s.signature ?? '');
        setSig2(s.signature2 ?? '');
        setPLogin(s.portalLogin ?? '');
        setPPass(s.portalPassword ?? '');
        setAdv(!!(s.serialNumber || s.deviceId1 || s.portalLogin || s.signature));
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
      setAdv(false);
      setSn(''); setDev1(''); setDev2(''); setSig(''); setSig2(''); setPLogin(''); setPPass('');
    }
  }, [visible, source]);

  const save = async () => {
    Keyboard.dismiss();
    const macOk = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim());
    if (type === 'xtream' && (!server.trim() || !username.trim() || !password)) return setError('Llena servidor, usuario y contraseña.');
    if (type === 'm3u' && !/^https?:\/\//i.test(m3uUrl.trim())) return setError('La URL de la lista debe empezar con http:// o https://');
    if (type === 'stalker' && (!server.trim() || !macOk)) return setError('Llena la URL del portal y una MAC con formato 00:1A:79:XX:XX:XX.');
    const finalName = name.trim() || (type === 'xtream' ? 'Xtream' : type === 'm3u' ? 'Lista M3U' : 'Portal Stalker');
    const id = await saveSource({
      id: source?.id,
      type,
      name: finalName,
      config: { ...(source?.config ?? {}), server: server.trim() || undefined, username: username.trim() || undefined, epgUrl: epgUrl.trim() || undefined },
      secrets: {
        password: password || undefined,
        m3uUrl: m3uUrl.trim() || undefined,
        mac: mac.trim().toUpperCase() || undefined,
        ...(type === 'stalker'
          ? {
              serialNumber: sn.trim() || undefined,
              deviceId1: dev1.trim() || undefined,
              deviceId2: dev2.trim() || undefined,
              signature: sig.trim() || undefined,
              signature2: sig2.trim() || undefined,
              portalLogin: pLogin.trim() || undefined,
              portalPassword: pPass || undefined,
            }
          : {}),
      },
    });
    onSaved(id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalBack, compact && { padding: 8 }]}>
        <Pressable focusable={false} style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} />
        <View style={[styles.modal, compact && { padding: 14, gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T kind="title" weight="bold" style={{ flex: 1 }} lines={1}>{source ? 'Editar fuente' : 'Agregar fuente'}</T>
            {compact && <Button compact variant="primary" icon="check" label="Guardar" onPress={save} />}
            <Button compact icon="close" onPress={() => { Keyboard.dismiss(); onClose(); }} />
          </View>
          {compact && error && <T kind="label" color={colors.danger}>{error}</T>}
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: compact ? 10 : 14, paddingBottom: 4 }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
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
              <Pressable onPress={() => setAdv((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T kind="label" weight="bold" color={colors.accent}>{adv ? '▾' : '▸'} Avanzado (solo si tu portal lo pide)</T>
              </Pressable>
              {adv && (
                <View style={{ gap: 10 }}>
                  <T kind="caption" color={colors.textSecondary}>
                    Algunos portales atan la MAC a un aparato. Copia estos datos de tu decodificador MAG original (o de la app que ya usabas). Una vez que el portal los acepta, no los cambies.
                  </T>
                  <Field label="Número de serie (SN)" value={sn} onChange={setSn} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label="Device ID 1" value={dev1} onChange={setDev1} /></View>
                    <View style={{ flex: 1 }}><Field label="Device ID 2" value={dev2} onChange={setDev2} /></View>
                  </View>
                  <Button compact icon="refresh" label="Generar Device ID desde la MAC" style={{ alignSelf: 'flex-start' }}
                    onPress={() => {
                      const d = deriveStalkerDeviceIds(mac);
                      if (!d) return setError('Escribe primero una MAC válida.');
                      Alert.alert('Generar Device ID', 'Úsalo solo si tu portal nunca ha visto otros Device ID con esta MAC: el portal liga el primero que recibe y después rechaza cualquier otro.', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Generar', onPress: () => { setDev1(d.deviceId1); setDev2(d.deviceId2); } },
                      ]);
                    }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label="Firma (signature)" value={sig} onChange={setSig} /></View>
                    <View style={{ flex: 1 }}><Field label="Firma 2" value={sig2} onChange={setSig2} /></View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label="Usuario del portal" value={pLogin} onChange={setPLogin} /></View>
                    <View style={{ flex: 1 }}><Field label="Contraseña del portal" value={pPass} onChange={setPPass} secure /></View>
                  </View>
                </View>
              )}
            </>
          )}
          {type !== 'stalker' && (
            <Field label="Guía XMLTV (opcional)" value={epgUrl} onChange={setEpgUrl} placeholder={type === 'xtream' ? 'Vacío = la guía del propio servidor' : 'Vacío = la que indique la lista'} keyboard="url" />
          )}
          {error && <T kind="label" color={colors.danger}>{error}</T>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <Button label="Cancelar" onPress={() => { Keyboard.dismiss(); onClose(); }} />
            <Button variant="primary" label="Guardar y actualizar" onPress={save} />
          </View>
          </ScrollView>
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
  modal: { width: 620, maxWidth: '100%', maxHeight: '100%', backgroundColor: colors.panel, borderRadius: radius.xl, padding: 24, gap: 14 },
});
