import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXmltv, parseXmltvTime, XmltvParser } from '../src/xmltv.ts';
import { chunks, fixtureJson, fixtureText } from './helpers.ts';

const expected = fixtureJson('xmltv/basic.expected.json') as Record<string, unknown>;
const { rules: _rules, ...golden } = expected;

test('XMLTV: coincide con el resultado dorado', () => {
  assert.deepEqual(parseXmltv(fixtureText('xmltv/basic.xml')), golden);
});

test('XMLTV: mismo resultado alimentando por trozos (entidades partidas incluidas)', () => {
  const p = new XmltvParser();
  for (const c of chunks(fixtureText('xmltv/basic.xml'), [1, 2, 5, 11, 3])) p.feed(c);
  assert.deepEqual(p.end(), golden);
});

test('XMLTV: horas con y sin zona horaria', () => {
  assert.equal(new Date(parseXmltvTime('20261122180000 -0600')!).toISOString(), '2026-11-23T00:00:00.000Z');
  assert.equal(new Date(parseXmltvTime('20261123063000 +0530')!).toISOString(), '2026-11-23T01:00:00.000Z');
  assert.equal(new Date(parseXmltvTime('20261123023000')!).toISOString(), '2026-11-23T02:30:00.000Z');
  assert.equal(new Date(parseXmltvTime('202611230230 +0000')!).toISOString(), '2026-11-23T02:30:00.000Z');
  assert.equal(parseXmltvTime('mañana'), null);
});

test('XMLTV: desplazamiento manual de la fuente', () => {
  const r = parseXmltv(fixtureText('xmltv/basic.xml'), { offsetMinutes: 60 });
  assert.equal(r.programmes[0]!.startUtc, '2026-11-23T01:00:00Z');
});

test('XMLTV: ventana de tiempo descarta programas fuera de rango', () => {
  const r = parseXmltv(fixtureText('xmltv/basic.xml'), {
    windowStartMs: Date.parse('2026-11-23T02:00:00Z'),
    windowEndMs: Date.parse('2026-11-23T04:00:00Z'),
  });
  const titles = r.programmes.map((p) => p.title);
  assert.ok(!titles.includes('Noticias de la Noche'));
  assert.ok(titles.includes('Sin zona horaria'));
  assert.ok(!titles.includes('Descripción extensa'));
  // El programa sin "stop" toma como fin el inicio del siguiente aunque ese quede fuera de la ventana.
  const sinFin = r.programmes.find((p) => p.title === 'Sin hora de fin');
  assert.equal(sinFin?.endUtc, '2026-11-23T04:00:00Z');
});

test('XMLTV: CDATA, entidades numéricas y prioridad de episode-num', () => {
  const xml = `<?xml version="1.0"?><tv><channel id="x"><display-name>X</display-name></channel>
<programme start="20261123000000 +0000" stop="20261123010000 +0000" channel="x">
<title><![CDATA[Tom & Jerry <especial>]]></title><desc>Caf&#233; &#x26; pan</desc>
<episode-num system="xmltv_ns">0.3.</episode-num><episode-num system="onscreen">S01E04</episode-num></programme></tv>`;
  const r = parseXmltv(xml);
  assert.equal(r.programmes[0]!.title, 'Tom & Jerry <especial>');
  assert.equal(r.programmes[0]!.description, 'Café & pan');
  assert.equal(r.programmes[0]!.episodeNum, 'S01E04');
});
