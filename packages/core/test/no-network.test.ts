// Garantía de "todo local": el núcleo no usa red, temporizadores ni almacenamiento
// globales por su cuenta, ni contiene direcciones de servidores propios.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url);
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

test('núcleo sin red propia, sin telemetría y sin servidores de T-Max', () => {
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /localStorage|indexedDB|sessionStorage/,
    /sendBeacon/,
    /analytics|telemetry|sentry|firebase|supabase|mixpanel|amplitude/i,
    /https?:\/\/(?!localhost)[a-z0-9.-]+\.(com|net|org|io|top|app|dev)\b/i,
  ];
  for (const f of files) {
    const code = readFileSync(new URL(f, SRC), 'utf8').replace(/\/\/.*$/gm, '');
    for (const re of forbidden) assert.ok(!re.test(code), `${f} contiene ${re}`);
  }
});
