// DVR: grabando ahora, programadas y terminadas. Las grabaciones MP4 pasan solas a la galería de Fotos.
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Linking, StyleSheet, View } from 'react-native';

import { getSetting, setSetting } from '../data/db';
import { cancelRecording, deleteRecording, listRecordings, retrySaveToPhotos, type Recording } from '../data/dvr';
import { hhmm } from '../data/mapping';
import type { VodPlayRequest } from '../data/vod';
import { colors, radius } from '../theme';
import Icon from '../ui/Icon';
import { Button, Chip, T } from '../ui/kit';

function size(b: number | null): string {
  if (!b) return '';
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
}

function when(r: Recording): string {
  const d = new Date(r.start).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d} · ${hhmm(r.start)} – ${hhmm(r.end)}`;
}

const STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Programada', color: colors.textSecondary },
  recording: { label: 'Grabando', color: colors.live },
  saving: { label: 'Guardando…', color: colors.warning },
  done: { label: 'Lista', color: colors.success },
  failed: { label: 'Falló', color: colors.danger },
  missed: { label: 'No se grabó', color: colors.textTertiary },
};

export default function DvrScreen({ dataVersion, onPlay }: { dataVersion: number; onPlay: (r: VodPlayRequest) => void }) {
  const [list, setList] = useState<Recording[]>([]);
  const [version, setVersion] = useState(0);
  const [container, setContainer] = useState<'mp4' | 'mkv'>('mp4');

  useEffect(() => {
    listRecordings().then(setList).catch(() => setList([]));
  }, [dataVersion, version]);
  // Mientras haya algo grabando, refrescar el tamaño/estado.
  useEffect(() => {
    if (!list.some((r) => r.status === 'recording' || r.status === 'saving')) return;
    const t = setInterval(() => setVersion((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, [list]);
  useEffect(() => {
    getSetting('dvrContainer').then((v) => setContainer(v === 'mkv' ? 'mkv' : 'mp4')).catch(() => {});
  }, []);

  const bump = () => setVersion((v) => v + 1);

  const remove = (r: Recording) => {
    const pending = r.status === 'scheduled';
    Alert.alert(pending ? 'Cancelar grabación' : 'Borrar grabación', r.in_photos ? 'Se quita de la lista. La copia en Fotos no se toca.' : r.title, [
      { text: 'No', style: 'cancel' },
      { text: pending ? 'Cancelar grabación' : 'Borrar', style: 'destructive', onPress: () => (pending ? cancelRecording(r.id) : deleteRecording(r.id)).then(bump) },
    ]);
  };

  const play = (r: Recording) =>
    onPlay({
      queue: [{ key: `rec:${r.id}`, kind: 'movie', sourceId: r.source_id, streamId: r.id, ext: null, title: r.title, subtitle: `${r.channel_name} · ${when(r)}`, localUrl: r.file }],
      index: 0,
      startAt: null,
    });

  const sections: { title: string; items: Recording[] }[] = [
    { title: 'GRABANDO AHORA', items: list.filter((r) => r.status === 'recording' || r.status === 'saving') },
    { title: 'PROGRAMADAS', items: list.filter((r) => r.status === 'scheduled').sort((a, b) => a.start - b.start) },
    { title: 'TERMINADAS', items: list.filter((r) => ['done', 'failed', 'missed'].includes(r.status)) },
  ].filter((s) => s.items.length > 0);
  const rows = sections.flatMap((s) => [{ head: s.title } as const, ...s.items.map((r) => ({ r }))]);

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={styles.header}>
        <T kind="display" weight="bold" style={{ flex: 1 }}>DVR</T>
        <Button compact icon="movies" label="Abrir Fotos" onPress={() => Linking.openURL('photos-redirect://').catch(() => {})} />
      </View>
      <View style={[styles.panel, styles.note]}>
        <View style={{ flex: 1, gap: 4 }}>
          <T kind="label" color={colors.textSecondary}>
            Graba desde el reproductor (botón de grabar) o desde la guía. iOS solo permite grabar con T-Max abierto: si sales de la app, la grabación se cierra y se guarda lo que haya.
          </T>
          <T kind="caption" color={colors.textTertiary}>
            MP4 se guarda solo en Fotos. MKV acepta cualquier canal, pero se queda en T-Max (puedes compartirlo a Archivos).
          </T>
        </View>
        <Chip label="MP4 → Fotos" active={container === 'mp4'} onPress={() => { setContainer('mp4'); setSetting('dvrContainer', 'mp4'); }} />
        <Chip label="MKV" active={container === 'mkv'} onPress={() => { setContainer('mkv'); setSetting('dvrContainer', 'mkv'); }} />
      </View>
      <View style={[styles.panel, { flex: 1, padding: 10 }]}>
        <FlatList
          data={rows}
          keyExtractor={(x, i) => ('head' in x ? `h${i}` : x.r.id)}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
              <Icon name="dvr" size={40} color={colors.textTertiary} />
              <T kind="title" weight="bold">Sin grabaciones</T>
            </View>
          }
          renderItem={({ item }) => {
            if ('head' in item) return <T kind="label" weight="semibold" color={colors.textSecondary} style={styles.head}>{item.head}</T>;
            const r = item.r;
            const st = STATUS[r.status] ?? STATUS.done!;
            return (
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: st.color }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T weight="semibold" lines={1}>{r.title}</T>
                  <T kind="caption" color={colors.textSecondary} lines={1}>
                    {r.channel_name} · {when(r)}{r.bytes ? ` · ${size(r.bytes)}` : ''} · <T kind="caption" weight="bold" color={st.color}>{r.in_photos ? 'En Fotos' : st.label}</T>
                  </T>
                  {r.error ? <T kind="caption" color={r.status === 'failed' ? colors.danger : colors.warning} lines={2}>{r.error}</T> : null}
                </View>
                {r.file && r.status === 'done' ? (
                  <>
                    <Button compact icon="play" label="Ver" onPress={() => play(r)} />
                    {/\.(mp4|mov|m4v)$/i.test(r.file) ? (
                      <Button compact icon="movies" label="A Fotos" onPress={() => retrySaveToPhotos(r.id).then((err) => { if (err) Alert.alert('No se pudo', err); bump(); })} />
                    ) : null}
                    <Button compact icon="expand" label="Compartir" onPress={() => Sharing.shareAsync(r.file!).catch(() => {})} />
                  </>
                ) : null}
                {r.status !== 'recording' && r.status !== 'saving' ? <Button compact icon="trash" variant="danger" onPress={() => remove(r)} /> : null}
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  panel: { backgroundColor: colors.panel, borderRadius: radius.lg },
  note: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  head: { marginTop: 12, marginBottom: 4, marginLeft: 10, letterSpacing: 0.6 },
  row: { minHeight: 64, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.raised, marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
