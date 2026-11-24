// Lista de grupos con modo edición: mostrar/ocultar (persiste entre actualizaciones) y orden
// por lista, por nombre o manual. Las preferencias viven en user_groups / settings, no en la fuente.
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import Pressable from '../ui/Press';

import { moveItem, type GroupSortMode } from '../data/mapping';
import {
  listGroups,
  saveManualOrder,
  setGroupHidden,
  setGroupSortMode,
  type GroupItem,
  type SourceFilter,
  type SourceSection,
} from '../data/queries';
import { colors, radius } from '../theme';
import Icon from '../ui/Icon';
import { Button, Chip, Switch, T } from '../ui/kit';

type Row =
  | { kind: 'label'; id: string; text: string }
  | { kind: 'group'; id: string; g: GroupItem };

interface Props {
  filter: SourceFilter;
  dataVersion: number;
  onOpen: (g: GroupItem) => void;
  onChanged: () => void;
}

const MODES: { id: GroupSortMode; label: string }[] = [
  { id: 'provider', label: 'Lista' },
  { id: 'name', label: 'Nombre' },
  { id: 'manual', label: 'Manual' },
];

export default function GroupsList({ filter, dataVersion, onOpen, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<{ pinned: GroupItem[]; all: GroupItem; sections: SourceSection[] } | null>(null);

  const load = () => listGroups(filter, { includeHidden: editing }).then(setData).catch(() => {});
  useEffect(() => {
    load();
  }, [filter, dataVersion, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filter) setEditing(false);
  }, [filter]);

  if (!data) return null;
  const section = filter ? data.sections.find((s) => s.sourceId === filter) : undefined;

  const after = async () => {
    await load();
    onChanged();
  };

  if (editing && section) {
    const groups = section.groups;
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.head}>
          <T kind="title" weight="bold" style={{ flex: 1 }}>Editar grupos</T>
          <Button compact variant="primary" label="Listo" onPress={() => setEditing(false)} />
        </View>
        <View style={styles.modes}>
          <T kind="label" color={colors.textSecondary} style={{ marginRight: 8 }}>Orden</T>
          {MODES.map((m) => (
            <Chip key={m.id} label={m.label} active={section.mode === m.id} onPress={async () => {
              if (m.id === 'manual' && section.mode !== 'manual') {
                // Al pasar a manual se parte del orden que se ve ahora.
                await saveManualOrder(section.sourceId, groups.map((g) => g.source_group_id!));
              }
              await setGroupSortMode(section.sourceId, m.id);
              after();
            }} />
          ))}
        </View>
        <T kind="caption" color={colors.textSecondary} style={{ marginHorizontal: 12, marginBottom: 8 }}>
          Lo que ocultes y el orden manual se conservan aunque actualices la fuente.
        </T>
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          renderItem={({ item, index }) => (
            <View style={styles.editRow}>
              <Switch label={`Mostrar ${item.name}`} value={!item.hidden} onChange={async (v) => {
                await setGroupHidden(section.sourceId, item.source_group_id!, !v);
                after();
              }} />
              <View style={{ flex: 1 }}>
                <T weight="semibold" lines={1} color={item.hidden ? colors.textTertiary : colors.text}>{item.name}</T>
                <T kind="caption" color={colors.textTertiary}>{item.count} canales{item.hidden ? ' · oculto' : ''}</T>
              </View>
              {section.mode === 'manual' && (
                <>
                  <Pressable accessibilityLabel="Subir" disabled={index === 0} style={[styles.arrow, index === 0 && { opacity: 0.3 }]}
                    onPress={async () => { await saveManualOrder(section.sourceId, moveItem(groups, index, -1).map((g) => g.source_group_id!)); after(); }}>
                    <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="chevronDown" size={20} /></View>
                  </Pressable>
                  <Pressable accessibilityLabel="Bajar" disabled={index === groups.length - 1} style={[styles.arrow, index === groups.length - 1 && { opacity: 0.3 }]}
                    onPress={async () => { await saveManualOrder(section.sourceId, moveItem(groups, index, 1).map((g) => g.source_group_id!)); after(); }}>
                    <Icon name="chevronDown" size={20} />
                  </Pressable>
                </>
              )}
            </View>
          )}
        />
      </View>
    );
  }

  const rows: Row[] = [{ kind: 'label', id: 'h-mis', text: 'MIS LISTAS' }];
  for (const g of data.pinned) rows.push({ kind: 'group', id: g.id, g });
  rows.push({ kind: 'label', id: 'h-grp', text: 'GRUPOS' });
  rows.push({ kind: 'group', id: data.all.id, g: data.all });
  for (const s of data.sections) {
    if (!filter && data.sections.length > 1) rows.push({ kind: 'label', id: 'h-' + s.sourceId, text: s.sourceName.toUpperCase() });
    for (const g of s.groups) rows.push({ kind: 'group', id: g.id, g });
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.head}>
        <T kind="title" weight="bold" style={{ flex: 1 }}>Grupos</T>
        {filter ? (
          <Button compact icon="edit" label="Editar" onPress={() => setEditing(true)} />
        ) : data.sections.length > 1 ? (
          <T kind="caption" color={colors.textTertiary}>Elige una fuente para editar</T>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) =>
          item.kind === 'label' ? (
            <T kind="label" weight="semibold" color={colors.textSecondary} style={styles.sectionLabel}>{item.text}</T>
          ) : (
            <Pressable style={({ pressed }) => [styles.groupRow, pressed && { backgroundColor: colors.raised }]} onPress={() => onOpen(item.g)}>
              <T weight={item.g.special ? 'bold' : 'medium'} style={{ flex: 1 }} lines={1}>{item.g.name}</T>
              <T kind="label" color={colors.textSecondary}>{item.g.count}</T>
              <Icon name="chevron" size={18} color={colors.textTertiary} />
            </Pressable>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, gap: 8, minHeight: 44 },
  modes: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  sectionLabel: { marginTop: 10, marginBottom: 4, marginLeft: 12, letterSpacing: 0.6 },
  groupRow: { height: 52, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  editRow: { minHeight: 60, borderRadius: radius.md, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
});
