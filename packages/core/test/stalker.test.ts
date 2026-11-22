import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors.ts';
import { redact, redactHeaders } from '../src/redact.ts';
import { parseStalkerChannels, resolveStalkerApi, StalkerClient, stalkerHeaders, stripCmd } from '../src/stalker.ts';
import { fakeHttp, fixtureJson, query } from './helpers.ts';

const cfg = { portalUrl: 'http://stalker.example.test/stalker_portal/c/', mac: '00:1A:79:00:00:00', timezone: 'America/Mexico_City', lang: 'es' };
const expected = fixtureJson('stalker/expected_headers.json') as { headers: Record<string, string>; redacted: Record<string, string> };

test('Stalker: ruta del API según la URL del portal', () => {
  assert.equal(resolveStalkerApi('http://stalker.example.test/stalker_portal/c/'), 'http://stalker.example.test/stalker_portal/server/load.php');
  assert.equal(resolveStalkerApi('stalker.example.test/c'), 'http://stalker.example.test/portal.php');
  assert.equal(resolveStalkerApi('http://x.test/portal.php?x=1'), 'http://x.test/portal.php');
});

test('Stalker: cabeceras exactas y su versión redactada', () => {
  const h = stalkerHeaders(cfg, 'FAKE-TOKEN-0000000000000001');
  assert.deepEqual(h, expected.headers);
  assert.deepEqual(redactHeaders(h), expected.redacted);
});

test('Stalker: canales, catch-up en días y cmd', () => {
  const ch = parseStalkerChannels(fixtureJson('stalker/get_all_channels.json'));
  assert.equal(ch.length, 2);
  assert.equal(ch[0]!.epgChannelId, 'canal1.test');
  assert.equal(ch[1]!.epgChannelId, null);
  assert.equal(ch[1]!.catchupDays, 3);
  assert.equal(ch[0]!.stalkerCmd, 'ffmpeg http://localhost/ch/101_');
  assert.equal(stripCmd('ffmpeg http://a.test/x'), 'http://a.test/x');
});

test('Stalker: handshake → token → canales → create_link', async () => {
  const http = fakeHttp((req) => {
    const q = query(req.url);
    if (q.action === 'handshake') {
      assert.equal(req.headers?.Authorization, undefined);
      return { body: fixtureJson('stalker/handshake.json') };
    }
    assert.equal(req.headers?.Authorization, 'Bearer FAKE-TOKEN-0000000000000001');
    assert.equal(req.headers?.['User-Agent'], expected.headers['User-Agent']);
    if (q.action === 'get_genres') return { body: fixtureJson('stalker/get_genres.json') };
    if (q.action === 'get_all_channels') return { body: fixtureJson('stalker/get_all_channels.json') };
    if (q.action === 'create_link') {
      assert.equal(q.cmd, 'ffmpeg http://localhost/ch/101_');
      return { body: fixtureJson('stalker/create_link.json') };
    }
    return undefined;
  });
  const c = new StalkerClient(http, cfg);
  const genres = await c.genres();
  assert.deepEqual(genres.map((g) => g.name), ['Noticias', 'Deportes']);
  const channels = await c.channels();
  const link = await c.createLink(channels[0]!.stalkerCmd!);
  assert.ok(link.url.startsWith('http://stalker.example.test/play/live.php?'));
  assert.equal(redact(link.url), 'http://stalker.example.test/play/live.php?mac=***&stream=101&extension=ts&play_token=***');
  assert.equal(http.calls.filter((r) => query(r.url).action === 'handshake').length, 1);
});

test('Stalker: portal sin token = MAC no registrada', async () => {
  const c = new StalkerClient(fakeHttp(() => ({ body: { js: {} } })), cfg);
  await assert.rejects(c.genres(), (e: unknown) => e instanceof AppError && e.code === 'AUTH_INVALID');
});
