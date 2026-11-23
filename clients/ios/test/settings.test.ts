import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dvrTick, overlaps, PAD_AFTER_MS, PAD_BEFORE_MS, recordingFileName } from '../src/data/dvr-model.ts';
import { DEFAULT_SUB_STYLE, needsAutoRefresh, normalizeSourceSettings, normalizeSubStyle, subStyleToMpv } from '../src/data/settings-model.ts';

test('Ajustes por fuente: valores inválidos vuelven a los de siempre', () => {
  const s = normalizeSourceSettings({ format: 'xyz', epgOffsetHours: 99, autoRefreshHours: -3, userAgent: '  VLC/3  ' });
  assert.equal(s.format, 'global');
  assert.equal(s.epgOffsetHours, 14);
  assert.equal(s.autoRefreshHours, 0);
  assert.equal(s.userAgent, 'VLC/3');
  assert.equal(s.subStyle, null);
  assert.equal(normalizeSourceSettings({ epgOffsetHours: -1.3 }).epgOffsetHours, -1.5);
});

test('Actualizar sola: solo cuando pasó el tiempo', () => {
  const h = 3600000;
  assert.equal(needsAutoRefresh({ autoRefreshHours: 0 }, null, 0), false);
  assert.equal(needsAutoRefresh({ autoRefreshHours: 12 }, null, 0), true);
  assert.equal(needsAutoRefresh({ autoRefreshHours: 12 }, 10 * h, 21 * h), false);
  assert.equal(needsAutoRefresh({ autoRefreshHours: 12 }, 10 * h, 22 * h), true);
});

test('Subtítulos → propiedades de mpv', () => {
  const m = new Map(subStyleToMpv({ ...DEFAULT_SUB_STYLE, size: 'large', color: 'yellow', background: 'box', bold: true }));
  assert.equal(m.get('sub-font-size'), '56');
  assert.equal(m.get('sub-color'), '#FFE45C');
  assert.equal(m.get('sub-border-style'), 'background-box');
  assert.equal(m.get('sub-bold'), 'yes');
  assert.equal(m.get('sub-outline-size'), '0');
  assert.deepEqual(normalizeSubStyle({ size: 'enorme', position: 10 }), DEFAULT_SUB_STYLE);
});

test('DVR: cuándo arrancar, detener o dar por perdida una grabación', () => {
  const base = { start: 1_000_000, end: 2_000_000 };
  const a = { id: 'a', ...base, status: 'scheduled' as const };
  const b = { id: 'b', ...base, status: 'recording' as const };
  assert.deepEqual(dvrTick([a, b], base.start - PAD_BEFORE_MS - 1), { start: [], stop: [], missed: [] });
  assert.deepEqual(dvrTick([a], base.start - PAD_BEFORE_MS).start, [a]);
  assert.deepEqual(dvrTick([b], base.end + PAD_AFTER_MS).stop, [b]);
  assert.deepEqual(dvrTick([a], base.end + PAD_AFTER_MS).missed, [a]);
  assert.equal(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }), false);
  assert.equal(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 }), true);
});

test('DVR: nombre de archivo sin acentos ni símbolos, con fecha local', () => {
  const name = recordingFileName({ channel_name: 'Canal Ñ Deportes!', title: 'Fútbol: final', start: Date.UTC(2026, 10, 23, 2, 5) }, 'mp4', 360);
  assert.equal(name, 'Canal-N-Deportes-Futbol-final-20261122-2005.mp4');
});
