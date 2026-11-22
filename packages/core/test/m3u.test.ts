import assert from 'node:assert/strict';
import { test } from 'node:test';
import { M3uParser, parseM3u } from '../src/m3u.ts';
import type { M3uEntry } from '../src/models.ts';
import { chunks, fixtureJson, fixtureText } from './helpers.ts';

for (const name of ['basic', 'malformed']) {
  test(`M3U ${name}: coincide con el resultado dorado`, () => {
    const got = parseM3u(fixtureText(`m3u/${name}.m3u`));
    assert.deepEqual(got, fixtureJson(`m3u/${name}.expected.json`));
  });

  test(`M3U ${name}: mismo resultado alimentando por trozos`, () => {
    const p = new M3uParser();
    for (const c of chunks(fixtureText(`m3u/${name}.m3u`))) p.feed(c);
    assert.deepEqual(p.end(), fixtureJson(`m3u/${name}.expected.json`));
  });
}

test('M3U: onEntry entrega entradas sin acumularlas', () => {
  const seen: M3uEntry[] = [];
  const p = new M3uParser({ onEntry: (e) => seen.push(e) });
  p.feed(fixtureText('m3u/basic.m3u'));
  const r = p.end();
  assert.equal(seen.length, 4);
  assert.equal(r.entries.length, 0);
});

test('M3U: lista grande (50 000 entradas) por trozos sin errores', () => {
  const lines = ['#EXTM3U'];
  for (let i = 0; i < 50000; i++) {
    lines.push(`#EXTINF:-1 tvg-id="c${i}.test" group-title="G${i % 20}",Canal ${i}`);
    lines.push(`http://iptv.example.test/live/u/p/${i}.ts`);
  }
  const text = lines.join('\n');
  let count = 0;
  const p = new M3uParser({ onEntry: () => count++ });
  for (let i = 0; i < text.length; i += 65536) p.feed(text.slice(i, i + 65536));
  const r = p.end();
  assert.equal(count, 50000);
  assert.equal(r.warnings.length, 0);
});
