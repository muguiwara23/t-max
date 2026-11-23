import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseSeries, parseSeriesInfo, parseVodStreams } from '@tmax/core';

import {
  cleanRating,
  clock,
  continueEpisode,
  humanDuration,
  isCompleted,
  mapVod,
  orderEpisodes,
  resumeFrom,
} from '../src/data/vod-mapping.ts';

const fx = (p: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/${p}`, import.meta.url), 'utf8'));

test('Xtream → películas y series con claves estables y categoría local', () => {
  const movies = parseVodStreams(fx('xtream/get_vod_streams.json'));
  const series = parseSeries(fx('xtream/get_series.json'));
  const { categories, items } = mapVod('x', [{ id: '20', name: 'Estrenos' }], movies, [{ id: '30', name: 'Drama' }], series);
  assert.deepEqual(categories.map((c) => [c.id, c.kind]), [['x:mc:20', 'movie'], ['x:sc:30', 'series']]);
  assert.equal(items.length, 2);
  assert.equal(items[0]!.key, 'x:m:5001');
  assert.equal(items[0]!.category_id, 'x:mc:20');
  assert.equal(items[0]!.ext, 'mp4');
  assert.equal(items[0]!.rating, '7.1');
  assert.equal(items[1]!.key, 'x:s:7001');
  // Duplicados del proveedor no rompen la clave primaria.
  assert.equal(mapVod('x', [], [...movies, ...movies], [], []).items.length, 1);
});

test('Calificación, duración y reloj', () => {
  assert.equal(cleanRating('0'), null);
  assert.equal(cleanRating('7,25'), '7.3');
  assert.equal(cleanRating('N/A'), null);
  assert.equal(humanDuration(6720), '1 h 52 min');
  assert.equal(humanDuration(2880), '48 min');
  assert.equal(humanDuration(null), null);
  assert.equal(clock(3909), '1:05:09');
  assert.equal(clock(247), '4:07');
});

test('Avance: visto al 95 % o con menos de 2 min; reanudar solo si vale la pena', () => {
  assert.equal(isCompleted(95, 100), true);
  assert.equal(isCompleted(5900, 6000), true);
  assert.equal(isCompleted(3000, 6000), false);
  assert.equal(isCompleted(10, 0), false);
  assert.equal(resumeFrom(20, 6000), null);
  assert.equal(resumeFrom(1200, 6000), 1195);
  assert.equal(resumeFrom(5950, 6000), null);
});

test('Series: qué episodio continuar', () => {
  const eps = orderEpisodes(parseSeriesInfo(fx('xtream/get_series_info.json'), '7001').episodes);
  assert.deepEqual(eps.map((e) => e.sourceItemId), ['8001', '8002']);
  // Sin avance → el primero.
  assert.equal(continueEpisode(eps, () => undefined)!.episode.sourceItemId, '8001');
  // A medias → ese mismo, reanudando.
  const half = continueEpisode(eps, (e) => (e.sourceItemId === '8001' ? { position: 900, duration: 2700, completed: false, updated: 1 } : undefined))!;
  assert.equal(half.episode.sourceItemId, '8001');
  assert.equal(half.resume, true);
  // Terminado → el siguiente desde el inicio.
  const done = continueEpisode(eps, (e) => (e.sourceItemId === '8001' ? { position: 2700, duration: 2700, completed: true, updated: 1 } : undefined))!;
  assert.equal(done.episode.sourceItemId, '8002');
  assert.equal(done.resume, false);
  assert.equal(continueEpisode([], () => undefined), null);
});
