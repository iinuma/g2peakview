/**
 * 手元で山稜を計算して、見える山を並べる。実機の前にここで数字を確かめる。
 *
 *   npm run horizon -- --lat 35.6251 --lng 139.2436          # 高尾山
 *   npm run horizon -- --lat 35.6251 --lng 139.2436 --eye 1.6 --refraction 0.13
 *
 * タイルは .cache/dem/ に保存して 2 回目から通信しない（手元検証専用。
 * アプリに同梱・再配布はしない）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULT_BANDS, demTileUrl, tileKey, type TileRef } from '../src/core/dem.js';
import { loadTerrain } from '../src/core/demload.js';
import { cardinal8, formatDistance } from '../src/core/geodesy.js';
import { computeHorizon, groundHeightM, sightPeaks } from '../src/core/horizon.js';
import type { PeakDataset } from '../src/core/peaks.js';

const { values } = parseArgs({
  options: {
    lat: { type: 'string' },
    lng: { type: 'string' },
    eye: { type: 'string', default: '1.6' },
    refraction: { type: 'string', default: '0' },
    all: { type: 'boolean', default: false },
  },
});
const origin = { lat: Number(values.lat), lng: Number(values.lng) };
if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
  console.error('usage: npm run horizon -- --lat <deg> --lng <deg>');
  process.exit(1);
}

async function cachedFetch(tile: TileRef): Promise<Uint8Array | null> {
  const path = `.cache/dem/${tileKey(tile)}.png`;
  const missing = `${path}.404`;
  if (existsSync(path)) return new Uint8Array(readFileSync(path));
  if (existsSync(missing)) return null;
  const response = await fetch(demTileUrl(tile));
  mkdirSync(dirname(path), { recursive: true });
  if (response.status === 404) {
    writeFileSync(missing, '');
    return null;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(path, bytes);
  return bytes;
}

const { terrain, report } = await loadTerrain(origin, DEFAULT_BANDS, cachedFetch);
console.log(
  `tiles ${report.requested} (404 ${report.notFound}, failed ${report.failed})  ` +
    `${(report.bytes / 1e6).toFixed(1)}MB  ${Math.round(report.ms)}ms`,
);

const ground = groundHeightM(terrain, origin, DEFAULT_BANDS);
const observerHeightM = (ground ?? 0) + Number(values.eye);
console.log(`ground ${ground === null ? 'noData' : ground.toFixed(1) + 'm'}  eye ${observerHeightM.toFixed(1)}m`);

const refraction = Number(values.refraction);
const horizon = computeHorizon({ origin, observerHeightM, terrain, bands: DEFAULT_BANDS, refraction });
console.log(`horizon ${horizon.elevationDeg.length} bins  ${horizon.samples} samples  ${Math.round(horizon.computeMs)}ms`);

const dataset = JSON.parse(readFileSync('src/data/peaks.json', 'utf8')) as PeakDataset;
const t0 = performance.now();
const sightings = sightPeaks(dataset.peaks, { origin, observerHeightM, terrain, bands: DEFAULT_BANDS, refraction });
console.log(`peaks in range ${sightings.length}  ${Math.round(performance.now() - t0)}ms`);

const counts = new Map<string, number>();
for (const s of sightings) counts.set(s.visibility, (counts.get(s.visibility) ?? 0) + 1);
console.log([...counts.entries()].map(([k, v]) => `${k} ${v}`).join('  '));

const shown = sightings
  .filter((s) => values.all || s.visibility !== 'hidden')
  .sort((a, b) => a.azimuthDeg - b.azimuthDeg);
for (const s of shown) {
  console.log(
    `${s.azimuthDeg.toFixed(1).padStart(6)}° ${cardinal8(s.azimuthDeg).padEnd(2)} ` +
      `${s.visibility.padEnd(9)} ${s.elevationDeg.toFixed(2).padStart(6)}° (手前 ${Number.isNaN(s.blockingDeg) ? '  -  ' : s.blockingDeg.toFixed(2)}) ` +
      `${formatDistance(s.distanceM).padStart(6)}  ${s.peak.name} ${s.peak.elevationM}m`,
  );
}

// 8 方位の山稜の仰角
console.log(
  'skyline',
  [0, 45, 90, 135, 180, 225, 270, 315]
    .map((az) => `${cardinal8(az)}:${horizon.elevationDeg[Math.round(az / horizon.azimuthStepDeg)]!.toFixed(2)}`)
    .join(' '),
);
