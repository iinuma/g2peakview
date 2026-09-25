/**
 * 国土地理院 1003 山の CSV（Shift_JIS）→ src/data/peaks.json。
 *
 *   npm run build:peaks
 *
 * 元ファイル data/raw/1003zan20260331.csv は公式配布元から取得したもの:
 * https://www.gsi.go.jp/KOKUJYOHO/MOUNTAIN/1003zan20260331.csv
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { GSI_1003_SOURCE, GSI_1003_URL, PEAK_ATTRIBUTION, parseGsi1003Csv, type PeakDataset } from '../src/core/peaks.js';

const SOURCE_FILE = 'data/raw/1003zan20260331.csv';
const SOURCE_VERSION = '2026-03-31';
const OUT = 'src/data/peaks.json';

const text = new TextDecoder('shift_jis').decode(readFileSync(SOURCE_FILE));
const { peaks, skipped } = parseGsi1003Csv(text, SOURCE_VERSION);

const dataset: PeakDataset = {
  source: GSI_1003_SOURCE,
  sourceVersion: SOURCE_VERSION,
  sourceUrl: GSI_1003_URL,
  attribution: PEAK_ATTRIBUTION,
  peaks,
};
writeFileSync(OUT, JSON.stringify(dataset));

const names = new Map<string, number>();
for (const peak of peaks) names.set(peak.name, (names.get(peak.name) ?? 0) + 1);
const dupes = [...names.entries()].filter(([, n]) => n > 1).length;

console.log(`peaks ${peaks.length}  skipped ${skipped.length}  same-name groups ${dupes}`);
console.log(`no elevation ${peaks.filter((p) => p.elevationM === null).length}`);
for (const s of skipped.slice(0, 10)) console.log('  skip', s);
console.log(`→ ${OUT} (${(JSON.stringify(dataset).length / 1024).toFixed(0)}KB)`);
