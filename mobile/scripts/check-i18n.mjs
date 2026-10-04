/**
 * Ensure mobile i18n locale files share the same key structure as en.json.
 *
 * Usage (from repo root or mobile/):
 *   node mobile/scripts/check-i18n.mjs
 *
 * Exit 0 when ta.json and si.json contain every English key (and no extras).
 * Exit 1 when structure drifts. Does not compare translation quality.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(__dirname, '..', 'src', 'i18n');

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function load(name) {
  return flatten(JSON.parse(fs.readFileSync(path.join(i18nDir, name), 'utf8')));
}

const en = load('en.json');
const ta = load('ta.json');
const si = load('si.json');

const enKeys = Object.keys(en);
const missingTa = enKeys.filter((k) => !(k in ta));
const missingSi = enKeys.filter((k) => !(k in si));
const extraTa = Object.keys(ta).filter((k) => !(k in en));
const extraSi = Object.keys(si).filter((k) => !(k in en));
const uncertainTa = enKeys.filter(
  (k) => typeof ta[k] === 'string' && ta[k].includes('[uncertain]'),
);
const uncertainSi = enKeys.filter(
  (k) => typeof si[k] === 'string' && si[k].includes('[uncertain]'),
);

let failed = false;

function report(label, keys) {
  if (keys.length === 0) return;
  failed = true;
  console.error(`\n${label} (${keys.length}):`);
  for (const k of keys) console.error(`  - ${k}`);
}

report('Missing in ta.json', missingTa);
report('Missing in si.json', missingSi);
report('Extra in ta.json (not in en)', extraTa);
report('Extra in si.json (not in en)', extraSi);

if (uncertainTa.length || uncertainSi.length) {
  // Soft warning — structure is ok, but CLAUDE.md asks not to leave English
  // silently; [uncertain] markers should be resolved.
  console.warn(
    `\nWarning: ${uncertainTa.length} ta / ${uncertainSi.length} si keys still marked [uncertain].`,
  );
}

if (failed) {
  console.error('\ni18n structure check FAILED.');
  process.exit(1);
}

console.log(
  `i18n structure OK — ${enKeys.length} keys present in en, ta, and si.`,
);
if (!uncertainTa.length && !uncertainSi.length) {
  console.log('No [uncertain] placeholders remain.');
}
