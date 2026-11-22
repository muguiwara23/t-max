import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchEpg, normalizeChannelName } from '../src/epg-match.ts';
import { parseM3u } from '../src/m3u.ts';
import { parseXmltv } from '../src/xmltv.ts';
import { fixtureText } from './helpers.ts';

test('EPG: normalización de nombres', () => {
  assert.equal(normalizeChannelName('MX: Canal Uno FHD'), 'canal uno');
  assert.equal(normalizeChannelName('Señal Ñandú (Backup) HD'), 'senal nandu');
  assert.equal(normalizeChannelName('US | ESPN 2 [720p]'), 'espn 2');
});

test('EPG: primero por id, luego por nombre, si no queda para asignación manual', () => {
  const epg = parseXmltv(fixtureText('xmltv/basic.xml')).channels;
  const m3u = parseM3u(fixtureText('m3u/basic.m3u')).entries;
  const input = [
    ...m3u.map((e, i) => ({ key: 'm' + i, epgId: e.attributes['tvg-id'] ?? null, name: e.name })),
    { key: 'x1', epgId: null, name: 'MX: Canal Uno FHD' },
    { key: 'x2', epgId: 'CANAL1.TEST', name: 'otro' },
  ];
  const r = matchEpg(input, epg);
  assert.deepEqual(r.get('m0'), { epgChannelId: 'canal1.test', method: 'id' });
  assert.deepEqual(r.get('m1'), { epgChannelId: null, method: 'none' });
  assert.deepEqual(r.get('x1'), { epgChannelId: 'canal1.test', method: 'name' });
  assert.deepEqual(r.get('x2'), { epgChannelId: 'canal1.test', method: 'id' });
});
