import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors.ts';
import { redact } from '../src/redact.ts';
import {
  chooseFormat,
  normalizeServer,
  parseAccount,
  parseCategories,
  parseLiveStreams,
  parseSeriesInfo,
  parseVodInfo,
  XtreamClient,
} from '../src/xtream.ts';
import { fakeHttp, fixtureJson, query } from './helpers.ts';

const creds = { server: 'iptv.example.test:8080/', username: 'demo_user', password: 'demo_pass' };

test('Xtream: cuenta, formatos y conexiones', () => {
  const a = parseAccount(fixtureJson('xtream/player_api_login.json'));
  assert.deepEqual(a.allowedFormats, ['m3u8', 'ts']);
  assert.equal(a.maxConnections, 2);
  assert.equal(a.serverTimezone, 'America/Mexico_City');
  assert.throws(() => parseAccount(fixtureJson('xtream/player_api_login_unauthorized.json')), (e: unknown) => e instanceof AppError && e.code === 'AUTH_INVALID');
});

test('Xtream: canales en vivo tolerando stream_id numérico o texto y catch-up', () => {
  const ch = parseLiveStreams(fixtureJson('xtream/get_live_streams.json'));
  assert.equal(ch.length, 2);
  assert.equal(ch[0]!.sourceChannelId, '1001');
  assert.equal(ch[0]!.epgChannelId, 'canal1.test');
  assert.equal(ch[1]!.sourceChannelId, '1002');
  assert.equal(ch[1]!.catchupDays, 3);
  assert.equal(ch[1]!.epgChannelId, null);
  assert.equal(parseCategories(fixtureJson('xtream/get_live_categories.json')).length, 2);
});

test('Xtream: ficha de película con datos del proveedor', () => {
  const m = parseVodInfo(fixtureJson('xtream/get_vod_info.json'), '5001');
  assert.equal(m.title, 'Último horizonte');
  assert.equal(m.tmdbId, '999001');
  assert.equal(m.year, 2025);
  assert.equal(m.durationSec, 6720);
  assert.deepEqual(m.genres, ['Acción', 'Aventura']);
  assert.deepEqual(m.cast, ['Ana Ríos', 'Mateo Torres', 'Sofía León']);
  assert.equal(m.backdrop, 'https://img.example.test/p1_bg.jpg');
  assert.equal(m.containerExtension, 'mkv');
});

test('Xtream: serie con temporadas y episodios ordenados', () => {
  const s = parseSeriesInfo(fixtureJson('xtream/get_series_info.json'), '7001');
  assert.equal(s.summary.title, 'Serie de Prueba');
  assert.deepEqual(s.seasons, [{ number: 1, name: 'Temporada 1', episodeCount: 2 }]);
  assert.deepEqual(s.episodes.map((e) => [e.season, e.episode, e.durationSec]), [[1, 1, 2700], [1, 2, 2650]]);
});

test('Xtream: elección de formato según servidor y reproductor', () => {
  const acc = { allowedFormats: ['m3u8', 'ts'] };
  assert.equal(chooseFormat('auto', acc), 'ts');
  assert.equal(chooseFormat('auto', acc, { ts: false, hls: true }), 'm3u8'); // Roku
  assert.equal(chooseFormat('auto', { allowedFormats: ['ts'] }, { ts: false, hls: true }), null); // no compatible
  assert.equal(chooseFormat('auto', { allowedFormats: [] }), 'ts'); // servidor no informa
  assert.equal(chooseFormat('m3u8', acc), 'm3u8');
});

test('Xtream: URLs y redacción de credenciales', () => {
  assert.equal(normalizeServer('https://x.test/player_api.php?username=a'), 'https://x.test');
  const c = new XtreamClient(fakeHttp(() => undefined), creds);
  const u = c.liveUrl('1001', 'ts');
  assert.equal(u, 'http://iptv.example.test:8080/live/demo_user/demo_pass/1001.ts');
  assert.equal(redact(u), 'http://iptv.example.test:8080/live/***/***/1001.ts');
  assert.equal(
    c.timeshiftUrl('1002', { y: 2026, mo: 11, d: 22, h: 19, mi: 0 }, 120),
    'http://iptv.example.test:8080/timeshift/demo_user/demo_pass/120/2026-11-22:19-00/1002.ts',
  );
  assert.equal(redact(c.xmltvUrl()), 'http://iptv.example.test:8080/xmltv.php?username=***&password=***');
});

test('Xtream: cliente completo contra un servidor falso', async () => {
  const http = fakeHttp((req) => {
    const q = query(req.url);
    if (q.username !== 'demo_user' || q.password !== 'demo_pass') return { status: 401, body: '' };
    switch (q.action) {
      case undefined: return { body: fixtureJson('xtream/player_api_login.json') };
      case 'get_live_categories': return { body: fixtureJson('xtream/get_live_categories.json') };
      case 'get_live_streams': return { body: fixtureJson('xtream/get_live_streams.json') };
      case 'get_vod_info': return q.vod_id === '5001' ? { body: fixtureJson('xtream/get_vod_info.json') } : { body: [] };
      default: return undefined;
    }
  });
  const c = new XtreamClient(http, creds);
  assert.equal((await c.login()).maxConnections, 2);
  assert.equal((await c.liveCategories()).length, 2);
  assert.equal((await c.liveStreams()).length, 2);
  assert.equal((await c.vodInfo('5001')).title, 'Último horizonte');
  assert.ok(http.calls.every((r) => r.url.startsWith('http://iptv.example.test:8080/player_api.php?')));
});

test('Xtream: errores sin filtrar la contraseña', async () => {
  const c = new XtreamClient(fakeHttp(() => ({ status: 401, body: '' })), creds);
  await assert.rejects(c.login(), (e: unknown) => {
    assert.ok(e instanceof AppError);
    assert.equal(e.code, 'AUTH_INVALID');
    assert.ok(!JSON.stringify(e.toJSON()).includes('demo_pass'));
    assert.ok(!e.message.includes('demo_pass'));
    return true;
  });
  const bad = new XtreamClient(fakeHttp(() => ({ body: '<html>' })), creds);
  await assert.rejects(bad.login(), (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_UNEXPECTED' && !e.message.includes('demo_pass'));
});
