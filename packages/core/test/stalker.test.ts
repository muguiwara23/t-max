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
    if (q.action === 'get_profile') return { body: fixtureJson('stalker/get_profile.json') };
    return undefined;
  });
  const c = new StalkerClient(http, cfg);
  // Dos peticiones en paralelo sin token → un solo handshake.
  const [genres] = await Promise.all([c.genres(), c.channels()]);
  assert.deepEqual(genres.map((g) => g.name), ['Noticias', 'Deportes']);
  const channels = await c.channels();
  const link = await c.createLink(channels[0]!.stalkerCmd!);
  assert.ok(link.url.startsWith('http://stalker.example.test/play/live.php?'));
  assert.equal(redact(link.url), 'http://stalker.example.test/play/live.php?mac=***&stream=101&extension=ts&play_token=***');
  assert.equal(http.calls.filter((r) => query(r.url).action === 'handshake').length, 1);
  assert.equal(link.headers['User-Agent'], expected.headers['User-Agent']);
  assert.ok(link.headers.Cookie?.startsWith('mac=00%3A1A%3A79'));
});

test('Stalker: token invalidado → renueva el token y reintenta create_link una vez', async () => {
  let handshakes = 0;
  const http = fakeHttp((req) => {
    const q = query(req.url);
    if (q.action === 'handshake') {
      handshakes++;
      return { body: { js: { token: `TOKEN-${handshakes}` } } };
    }
    if (q.action === 'get_profile') return { body: { js: {} } };
    if (q.action === 'create_link') {
      // El primer token ya no sirve: el portal devuelve el cmd sin resolver.
      if (req.headers?.Authorization === 'Bearer TOKEN-1') return { body: { js: { cmd: 'ffmpeg http://localhost/ch/101_' } } };
      return { body: fixtureJson('stalker/create_link.json') };
    }
    return undefined;
  });
  const c = new StalkerClient(http, cfg);
  const link = await c.createLink('ffmpeg http://localhost/ch/101_');
  assert.ok(link.url.startsWith('http://stalker.example.test/play/'));
  assert.equal(handshakes, 2);
});

test('Stalker: portal sin token = MAC no registrada', async () => {
  const c = new StalkerClient(fakeHttp(() => ({ body: { js: {} } })), cfg);
  await assert.rejects(c.genres(), (e: unknown) => e instanceof AppError && e.code === 'AUTH_INVALID');
});

test('Stalker: sesión rechazada (401) o caducada → handshake nuevo', async () => {
  let handshakes = 0;
  let rejectOnce = true;
  const http = fakeHttp((req) => {
    const q = query(req.url);
    if (q.action === 'handshake') {
      handshakes++;
      return { body: { js: { token: `TOKEN-${handshakes}` } } };
    }
    if (q.action === 'get_profile') return { body: { js: {} } };
    if (q.action === 'get_genres') {
      if (rejectOnce) {
        rejectOnce = false;
        return { status: 401, body: '' };
      }
      assert.equal(req.headers?.Authorization, `Bearer TOKEN-${handshakes}`);
      return { body: fixtureJson('stalker/get_genres.json') };
    }
    return undefined;
  });
  const c = new StalkerClient(http, cfg);
  assert.equal((await c.genres()).length, 2);
  assert.equal(handshakes, 2);
  // Pasado el tiempo de vida del token, la siguiente petición hace handshake sola.
  const realNow = Date.now;
  Date.now = () => realNow() + StalkerClient.TOKEN_TTL_MS + 1000;
  try {
    await c.genres();
  } finally {
    Date.now = realNow;
  }
  assert.equal(handshakes, 3);
});

test('Stalker: watchdog manda señal de vida con el token y no rompe si falla', async () => {
  const events: string[] = [];
  let calls = 0;
  const http = fakeHttp((req) => {
    const q = query(req.url);
    if (q.action === 'handshake') return { body: { js: { token: 'TOKEN-W' } } };
    if (q.action === 'get_profile') return { body: { js: {} } };
    if (q.type === 'watchdog') {
      calls++;
      assert.equal(q.action, 'get_events');
      assert.equal(q.cur_play_type, '1');
      assert.equal(req.headers?.Authorization, 'Bearer TOKEN-W');
      return calls === 1 ? { body: { js: { data: {} } } } : { status: 401, body: '' };
    }
    if (q.action === 'get_genres') return { body: fixtureJson('stalker/get_genres.json') };
    return undefined;
  });
  const c = new StalkerClient(http, { ...cfg, onEvent: (e) => events.push(e) });
  await c.watchdog(true); // sin token todavía: no hace nada
  assert.equal(calls, 0);
  await c.genres();
  await c.watchdog(true);
  await c.watchdog(true);
  assert.equal(calls, 2);
  assert.ok(events.includes('handshake'));
  assert.ok(events.includes('watchdog-fail'));
});
