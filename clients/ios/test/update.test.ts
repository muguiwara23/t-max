import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  compareVersions, digestAuthorization, isNewer, md5Hex, normalizeRokuIp, parseDigestChallenge, parseUpdateInfo, rokuInstallResult, shouldCheck,
} from '../src/data/update-model.ts';

test('comparar versiones', () => {
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.equal(compareVersions('v0.7.0', '0.7.0'), 0);
  assert.ok(compareVersions('0.6.4', '0.7.0') < 0);
});

test('aviso publicado: solo enlaces del repositorio', () => {
  const info = parseUpdateInfo({ app: '0.7.0', roku: '0.3.0', android: 'https://github.com/muguiwara23/t-max/releases/download/v0.7.0/T-Max-android.apk', ios: 'https://malo.test/x.ipa' });
  assert.ok(info);
  assert.equal(info.ios, '');
  assert.ok(info.android.endsWith('.apk'));
  assert.equal(parseUpdateInfo({ app: 'nueva' }), null);
  assert.equal(isNewer(info, '0.6.4'), true);
  assert.equal(isNewer(info, '0.7.0'), false);
});

test('revisar una vez al día', () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldCheck(null, now), true);
  assert.equal(shouldCheck(now - 3600000, now), false);
  assert.equal(shouldCheck(now - 25 * 3600000, now), true);
});

test('md5 igual al de Node', () => {
  for (const s of ['', 'abc', 'rokudev:rokudev:contraseña', 'x'.repeat(200)]) {
    assert.equal(md5Hex(s), createHash('md5').update(s, 'utf8').digest('hex'));
  }
});

test('Digest: ejemplo del RFC 2617', () => {
  const ch = parseDigestChallenge('Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  assert.ok(ch);
  const h = digestAuthorization({ user: 'Mufasa', password: 'Circle Of Life', method: 'GET', uri: '/dir/index.html', ch, cnonce: '0a4f113b' });
  assert.match(h, /response="6629fae49393a05397450978507c4ef1"/);
  assert.equal(parseDigestChallenge('Basic realm="x"'), null);
});

test('IP del Roku y respuesta del instalador', () => {
  assert.equal(normalizeRokuIp(' http://192.168.1.40/ '), '192.168.1.40');
  assert.equal(normalizeRokuIp('192.168.1.400'), null);
  assert.equal(rokuInstallResult(200, '<font>Install Success.</font>').ok, true);
  assert.equal(rokuInstallResult(401, '').ok, false);
  assert.match(rokuInstallResult(200, 'Identical to previous version').text, /ya tenía/);
});
