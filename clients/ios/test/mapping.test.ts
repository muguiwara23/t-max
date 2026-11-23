import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseLiveStreams, parseCategories, parseM3u, parseXmltv } from '@tmax/core';

import { layoutGuideRow, mapM3u, mapProgrammes, mapProviderLive, resolveEpgIds, stableHash } from '../src/data/mapping.ts';
import { colors, radius } from '../src/theme.ts';

const fx = (p: string) => readFileSync(new URL(`../../../contracts/fixtures/${p}`, import.meta.url), 'utf8');

test('M3U → grupos y canales con id estable y guía resuelta', () => {
  const { groups, channels } = mapM3u('s1', parseM3u(fx('m3u/basic.m3u')).entries);
  assert.deepEqual(groups.map((g) => g.name), ['Noticias', 'Deportes, En Vivo', 'Películas', 'Radio']);
  assert.equal(channels[0]!.id, `s1:${stableHash('https://iptv.example.test/live/demo_user/demo_pass/1001.ts')}`);
  assert.equal(channels[0]!.number, 1);
  const epg = parseXmltv(fx('xmltv/basic.xml'));
  assert.equal(resolveEpgIds(channels, epg.channels), 1);
  const progs = mapProgrammes('s1', epg.programmes, new Set(['canal1.test']));
  assert.equal(progs.length, 5);
  assert.equal(progs[0]!.start, Date.parse('2026-11-23T00:00:00Z'));
});

test('Xtream → canales agrupados por categoría', () => {
  const live = parseLiveStreams(JSON.parse(fx('xtream/get_live_streams.json')));
  const cats = parseCategories(JSON.parse(fx('xtream/get_live_categories.json')));
  const { groups, channels } = mapProviderLive('x', cats, live);
  assert.equal(groups.length, 2);
  assert.equal(channels[0]!.group_id, 'x:g:10');
  assert.equal(channels[1]!.catchup_days, 3);
  assert.equal(channels[0]!.stream_url, null); // la URL con credenciales no se guarda; se arma al reproducir
});

test('Guía: posiciones dentro de la ventana', () => {
  const t0 = Date.parse('2026-11-23T00:00:00Z');
  const b = layoutGuideRow(
    [{ start: t0 - 30 * 60000, end: t0 + 30 * 60000, title: 'A' }, { start: t0 + 30 * 60000, end: t0 + 90 * 60000, title: 'B' }],
    t0, t0 + 180 * 60000, 5, t0 + 10 * 60000,
  );
  assert.equal(b[0]!.left, 2);
  assert.equal(b[0]!.width, 30 * 5 - 4);
  assert.equal(b[0]!.isNow, true);
  assert.equal(b[1]!.left, 30 * 5 + 2);
});

test('Tema = design/tokens.json', () => {
  const t = JSON.parse(readFileSync(new URL('../../../design/tokens.json', import.meta.url), 'utf8'));
  assert.equal(colors.bg, t.color.bg.base);
  assert.equal(colors.panel, t.color.bg.panel);
  assert.equal(colors.raised, t.color.bg.raised);
  assert.equal(colors.hover, t.color.bg.hover);
  assert.equal(colors.text, t.color.text.primary);
  assert.equal(colors.textSecondary, t.color.text.secondary);
  assert.equal(colors.accent, t.color.accent.base);
  assert.equal(colors.live, t.color.live.base);
  assert.equal(colors.overlayPanel, t.color.overlay.panel.value);
  assert.equal(radius.lg, t.radius.lg);
});
