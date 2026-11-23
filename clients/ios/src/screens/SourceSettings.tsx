// Ajustes propios de una fuente y editor de estilo de subtítulos (general o por fuente).
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { invalidatePlaybackCache } from '../data/playback';
import { getGlobalSubStyle } from '../data/prefs';
import { saveSourceSettings, sourceSettings, type Source } from '../data/sources';
import { DEFAULT_SUB_STYLE, type SourceSettings, type SubStyle } from '../data/settings-model';
import { colors, font, radius } from '../theme';
import { Button, Chip, Switch, T } from '../ui/kit';

export function SubStyleEditor({ value, onChange }: { value: SubStyle; onChange: (s: SubStyle) => void }) {
  const set = (p: Partial<SubStyle>) => onChange({ ...value, ...p });
  const box = value.background === 'box';
  return (
    <View style={{ gap: 12 }}>
      <Row label="Tamaño">
        {(['small', 'medium', 'large', 'xlarge'] as const).map((s) => (
          <Chip key={s} label={{ small: 'Chico', medium: 'Normal', large: 'Grande', xlarge: 'Muy grande' }[s]} active={value.size === s} onPress={() => set({ size: s })} />
        ))}
      </Row>
      <Row label="Color">
        <Chip label="Blanco" active={value.color === 'white'} onPress={() => set({ color: 'white' })} />
        <Chip label="Amarillo" active={value.color === 'yellow'} onPress={() => set({ color: 'yellow' })} />
      </Row>
      <Row label="Fondo">
        <Chip label="Contorno" active={value.background === 'outline'} onPress={() => set({ background: 'outline' })} />
        <Chip label="Caja oscura" active={box} onPress={() => set({ background: 'box' })} />
        <Chip label="Nada" active={value.background === 'none'} onPress={() => set({ background: 'none' })} />
      </Row>
      <Row label="Altura">
        {[100, 95, 90, 85].map((p) => (
          <Chip key={p} label={p === 100 ? 'Abajo del todo' : p === 95 ? 'Normal' : p === 90 ? 'Más arriba' : 'Alto'} active={value.position === p} onPress={() => set({ position: p })} />
        ))}
      </Row>
      <Row label="Negritas"><Switch label="Negritas" value={value.bold} onChange={(b) => set({ bold: b })} /></Row>
      <View style={styles.preview}>
        <View style={[box && { backgroundColor: '#000000B3', paddingHorizontal: 8, borderRadius: 4 }]}>
          <T weight={value.bold ? 'bold' : 'semibold'} color={value.color === 'yellow' ? '#FFE45C' : '#FFFFFF'}
            style={{ fontSize: { small: 15, medium: 19, large: 24, xlarge: 30 }[value.size], lineHeight: { small: 20, medium: 25, large: 31, xlarge: 38 }[value.size],
              textShadowColor: value.background === 'outline' ? '#000' : 'transparent', textShadowRadius: 3, textShadowOffset: { width: 1, height: 1 } }}>
            Así se verán los subtítulos
          </T>
        </View>
      </View>
      <T kind="caption" color={colors.textTertiary}>Aplica a subtítulos de texto (SRT, VTT, de canales). Los subtítulos ASS con estilo propio se muestran como vienen.</T>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      <T kind="label" color={colors.textSecondary} style={{ width: 90 }}>{label}</T>
      {children}
    </View>
  );
}

export function SourceSettingsModal({ source, onClose, onSaved }: { source: Source | null; onClose: () => void; onSaved: () => void }) {
  const [st, setSt] = useState<SourceSettings>({});
  const [ownSubs, setOwnSubs] = useState(false);
  const [subs, setSubs] = useState<SubStyle>(DEFAULT_SUB_STYLE);

  useEffect(() => {
    if (!source) return;
    const s = sourceSettings(source);
    setSt(s);
    setOwnSubs(!!s.subStyle);
    if (s.subStyle) setSubs(s.subStyle);
    else getGlobalSubStyle().then(setSubs).catch(() => {});
  }, [source]);

  if (!source) return null;
  const set = (p: Partial<SourceSettings>) => setSt((x) => ({ ...x, ...p }));

  const save = async () => {
    await saveSourceSettings(source.id, { ...st, subStyle: ownSubs ? subs : null });
    invalidatePlaybackCache();
    onSaved();
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.back}>
        <View style={styles.modal}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T kind="title" weight="bold">Ajustes de "{source.name}"</T>
              <T kind="caption" color={colors.textSecondary}>Solo afectan a esta fuente. Las demás siguen con los suyos.</T>
            </View>
            <Button compact icon="close" onPress={onClose} />
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 16, paddingVertical: 4 }}>
            {source.type === 'xtream' && (
              <Section title="Formato de canales en vivo">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(['global', 'auto', 'ts', 'm3u8'] as const).map((f) => (
                    <Chip key={f} label={f === 'global' ? 'Como el general' : f === 'auto' ? 'Auto' : f.toUpperCase()} active={(st.format ?? 'global') === f} onPress={() => set({ format: f })} />
                  ))}
                </View>
              </Section>
            )}
            {source.type !== 'stalker' && (
              <Section title="User-Agent" hint="Algunos proveedores solo aceptan ciertos reproductores. Vacío = el de siempre.">
                <TextInput value={st.userAgent ?? ''} onChangeText={(v) => set({ userAgent: v })} placeholder="Vacío = predeterminado" placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none" autoCorrect={false} style={styles.input} />
              </Section>
            )}
            {source.type !== 'stalker' && (
              <Section title="Corregir hora de la guía" hint="Si la guía va adelantada o atrasada respecto al canal. Se aplica al actualizar la fuente.">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Button compact label="−½ h" onPress={() => set({ epgOffsetHours: (st.epgOffsetHours ?? 0) - 0.5 })} />
                  <T weight="bold" style={{ width: 80, textAlign: 'center' }}>{(st.epgOffsetHours ?? 0) > 0 ? '+' : ''}{st.epgOffsetHours ?? 0} h</T>
                  <Button compact label="+½ h" onPress={() => set({ epgOffsetHours: (st.epgOffsetHours ?? 0) + 0.5 })} />
                  <Button compact label="Sin corrección" variant="ghost" onPress={() => set({ epgOffsetHours: 0 })} />
                </View>
              </Section>
            )}
            <Section title="Actualizar sola" hint="Al abrir T-Max, si pasó este tiempo desde la última actualización.">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {[0, 6, 12, 24, 72].map((h) => (
                  <Chip key={h} label={h === 0 ? 'Nunca' : h < 24 ? `Cada ${h} h` : h === 24 ? 'Cada día' : 'Cada 3 días'} active={(st.autoRefreshHours ?? 0) === h} onPress={() => set({ autoRefreshHours: h })} />
                ))}
              </View>
            </Section>
            <Section title="Subtítulos">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Switch label="Estilo propio para esta fuente" value={ownSubs} onChange={setOwnSubs} />
                <T kind="label" color={colors.textSecondary}>{ownSubs ? 'Estilo propio para esta fuente' : 'Usa el estilo general (Ajustes → Reproductor)'}</T>
              </View>
              {ownSubs && <SubStyleEditor value={subs} onChange={setSubs} />}
            </Section>
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <Button label="Cancelar" onPress={onClose} />
            <Button variant="primary" label="Guardar" onPress={save} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <T weight="bold">{title}</T>
      {hint ? <T kind="caption" color={colors.textSecondary}>{hint}</T> : null}
      <View style={{ marginTop: 6, gap: 10 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: '#000000B3', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: 720, maxWidth: '100%', maxHeight: '92%', backgroundColor: colors.panel, borderRadius: radius.xl, padding: 24, gap: 14 },
  section: { backgroundColor: colors.raised, borderRadius: radius.md, padding: 14, gap: 2 },
  input: { height: 46, borderRadius: 12, backgroundColor: colors.hover, color: colors.text, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15 },
  preview: { height: 90, borderRadius: radius.md, backgroundColor: '#3A4A5A', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
});
