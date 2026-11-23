// Póster con respaldo de color y título si la imagen no existe o no carga. Sin efectos.
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { radius } from '../theme';
import { T } from './kit';

export const TONES = ['#2B3442', '#3A2E2B', '#26382F', '#352A3D', '#3B3826', '#243540', '#40292F', '#2D3A2A'];

export default function Poster({ uri, title, width, tone, radiusPx = radius.md }: { uri: string | null; title: string; width: number; tone: string; radiusPx?: number }) {
  const [failed, setFailed] = useState(false);
  const h = width * 1.5;
  return (
    <View style={{ width, height: h, borderRadius: radiusPx, backgroundColor: tone, overflow: 'hidden', justifyContent: 'flex-end', padding: 10 }}>
      {uri && !failed ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <T weight="bold" lines={4} style={{ fontSize: 14, lineHeight: 17 }}>{title}</T>
      )}
    </View>
  );
}

