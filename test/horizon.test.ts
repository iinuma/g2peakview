/**
 * 合成地形で山稜と可視判定を確かめる。正解が分かる地形だけを使う。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DemBand } from '../src/core/dem.js';
import { LocalSphere, toDeg, elevationAngleRad, type LatLng } from '../src/core/geodesy.js';
import { computeHorizon, horizonAt, sightPeaks, type ElevationLookup } from '../src/core/horizon.js';

const ORIGIN: LatLng = { lat: 35.5, lng: 139 };
const sphere = new LocalSphere(ORIGIN);
const BANDS: DemBand[] = [{ zoom: 12, fromM: 0, toM: 60_000 }];

interface Cone { at: LatLng; heightM: number; radiusM: number }

/** 円錐の山を置いた地形。base の高さの平地の上に建つ。 */
function coneTerrain(cones: Cone[], base = 0, holes: ((p: LatLng) => boolean) | null = null): ElevationLookup {
  const spheres = cones.map((c) => ({ c, s: new LocalSphere(c.at) }));
  return {
    elevationAt(lat, lng) {
      const p = { lat, lng };
      if (holes?.(p)) return null;
      let h = base;
      for (const { c, s } of spheres) {
        const d = s.inverse(p).distanceM;
        h = Math.max(h, base + c.heightM * Math.max(0, 1 - d / c.radiusM));
      }
      return h;
    },
  };
}

const opts = { azimuthStepDeg: 2, stepPerPixel: 1 };

test('平地: 山稜は地球の丸みのぶん水平より下（最遠点で決まる）', () => {
  const h = computeHorizon({ origin: ORIGIN, observerHeightM: 1.6, terrain: coneTerrain([]), bands: BANDS, ...opts });
  const e = horizonAt(h, 90);
  // 目の高さ 1.6m からの幾何学的な地平線はすぐ近く（約 4.5km）で、それより先は下がり続ける。
  // 最大仰角は近くの地面で、ほぼ 0 か僅かに負。
  assert.ok(e <= 0 && e > -0.1, String(e));
  assert.ok(h.status.every((s) => s === 'valid'));
});

test('単峰: 山の方位だけ山稜が持ち上がり、仰角は球の式どおり', () => {
  const peakAt = sphere.destination(90, 20_000);
  const h = computeHorizon({
    origin: ORIGIN,
    observerHeightM: 1.6,
    terrain: coneTerrain([{ at: peakAt, heightM: 2000, radiusM: 3000 }]),
    bands: BANDS,
    ...opts,
  });
  const expected = toDeg(elevationAngleRad(sphere.radiusM, 1.6, 20_000, 2000));
  const east = horizonAt(h, 90);
  assert.ok(Math.abs(east - expected) < 0.1, `${east} vs ${expected}`);
  assert.ok(horizonAt(h, 270) < 0.1);
  const i = Math.round(90 / 2);
  assert.ok(Math.abs(h.occluderDistanceM[i]! - 20_000) < 100);
});

test('近くの低い山が遠くの高い山を隠す／遠くの山は手前の山を隠さない', () => {
  // 東 5km に 800m（仰角 ≈ 9.1°）、東 40km に 3000m（仰角 ≈ 4.1°）。
  const near = { id: 'near', latDeg: 0, lonDeg: 0, elevationM: 800 };
  const far = { id: 'far', latDeg: 0, lonDeg: 0, elevationM: 3000 };
  const nearAt = sphere.destination(90, 5_000);
  const farAt = sphere.destination(90, 40_000);
  Object.assign(near, { latDeg: nearAt.lat, lonDeg: nearAt.lng });
  Object.assign(far, { latDeg: farAt.lat, lonDeg: farAt.lng });

  const terrain = coneTerrain([
    { at: nearAt, heightM: 800, radiusM: 1500 },
    { at: farAt, heightM: 3000, radiusM: 6000 },
  ]);
  const result = sightPeaks([near, far], { origin: ORIGIN, observerHeightM: 1.6, terrain, bands: BANDS, stepPerPixel: 1 });
  const byId = Object.fromEntries(result.map((r) => [r.peak.id, r]));
  assert.equal(byId.near!.visibility, 'visible');
  assert.equal(byId.far!.visibility, 'hidden');
});

test('高い山が手前でも、その奥のさらに高い山は見える（全距離の最大と比べない）', () => {
  // 東 10km に 500m（≈2.8°）、東 30km に 3000m（≈5.6°）。奥の方が高く見える。
  const a = sphere.destination(90, 10_000);
  const b = sphere.destination(90, 30_000);
  const terrain = coneTerrain([
    { at: a, heightM: 500, radiusM: 1500 },
    { at: b, heightM: 3000, radiusM: 5000 },
  ]);
  const peaks = [
    { id: 'a', latDeg: a.lat, lonDeg: a.lng, elevationM: 500 },
    { id: 'b', latDeg: b.lat, lonDeg: b.lng, elevationM: 3000 },
  ];
  const result = sightPeaks(peaks, { origin: ORIGIN, observerHeightM: 1.6, terrain, bands: BANDS, stepPerPixel: 1 });
  // 手前の山の山頂は、奥の山より手前だけを見るので隠れない。
  assert.equal(result.find((r) => r.peak.id === 'a')!.visibility, 'visible');
  assert.equal(result.find((r) => r.peak.id === 'b')!.visibility, 'visible');
});

test('DEM の欠け: 方位ごとに partial / missing を記録し、0m とみなさない', () => {
  // 観測点より東（経度が大きい側）を全部欠けにする。
  const terrain = coneTerrain([], 100, (p) => p.lng > ORIGIN.lng + 1e-9);
  const h = computeHorizon({ origin: ORIGIN, observerHeightM: 101.6, terrain, bands: BANDS, ...opts });
  assert.equal(h.status[Math.round(90 / 2)], 'missing');
  assert.ok(Number.isNaN(h.elevationDeg[Math.round(90 / 2)]!));
  assert.equal(h.status[Math.round(270 / 2)], 'valid');
  // 北は東寄りの欠けに少し掛かるかどうかの境目なので問わない。
  assert.equal(h.status[Math.round(0 / 2)] === 'missing', false);
});

test('狭い尾根を飛び越えない（DEM 画素間隔で刻む）', () => {
  // 北 8,040〜8,070m に幅 30m・高さ 400m の壁（z12 の画素は約 25m）。
  const wall: ElevationLookup = {
    elevationAt(lat, lng) {
      const { distanceM, azimuthDeg } = sphere.inverse({ lat, lng });
      const north = distanceM * Math.cos((azimuthDeg * Math.PI) / 180);
      return north >= 8_040 && north <= 8_070 ? 400 : 0;
    },
  };
  const expected = toDeg(elevationAngleRad(sphere.radiusM, 1.6, 8_040, 400));
  const fine = computeHorizon({ origin: ORIGIN, observerHeightM: 1.6, terrain: wall, bands: BANDS, azimuthStepDeg: 2, stepPerPixel: 0.75 });
  assert.ok(Math.abs(horizonAt(fine, 0) - expected) < 0.05, `${horizonAt(fine, 0)} vs ${expected}`);
  // 対照: 画素の 4 倍（約 100m）刻みだと壁を踏まずに通り過ぎる。この試験が意味を持つことの確認。
  const coarse = computeHorizon({ origin: ORIGIN, observerHeightM: 1.6, terrain: wall, bands: BANDS, azimuthStepDeg: 2, stepPerPixel: 4 });
  assert.ok(horizonAt(coarse, 0) < 0.1, String(horizonAt(coarse, 0)));
});

test('火口の手前の縁が最高点より高く見えても、その山は見える（頂上部の自己遮蔽）', () => {
  // 東 20km に最高点 3,776m。その 700m 手前に 3,740m の縁（見かけは最高点より高い）。
  const summitAt = sphere.destination(90, 20_000);
  const rimAt = sphere.destination(90, 19_300);
  const terrain = coneTerrain([
    { at: summitAt, heightM: 3776, radiusM: 12_000 },
    { at: rimAt, heightM: 3740, radiusM: 300 },
  ]);
  const rimAngle = toDeg(elevationAngleRad(sphere.radiusM, 1.6, 19_300, 3740));
  const summitAngle = toDeg(elevationAngleRad(sphere.radiusM, 1.6, 20_000, 3776));
  assert.ok(rimAngle > summitAngle, '前提: 縁のほうが高く見える');

  const peak = { latDeg: summitAt.lat, lonDeg: summitAt.lng, elevationM: 3776 };
  const [result] = sightPeaks([peak], { origin: ORIGIN, observerHeightM: 1.6, terrain, bands: BANDS, stepPerPixel: 1 });
  assert.equal(result!.visibility, 'visible');
});

test('頂上部より手前の別の山にはきちんと隠れる', () => {
  // 東 20km の 2,000m 峰を、東 8km の 1,500m 峰（間は平地）が隠す。
  const target = sphere.destination(90, 20_000);
  const blocker = sphere.destination(90, 8_000);
  const terrain = coneTerrain([
    { at: target, heightM: 2000, radiusM: 3000 },
    { at: blocker, heightM: 1500, radiusM: 2000 },
  ]);
  const peak = { latDeg: target.lat, lonDeg: target.lng, elevationM: 2000 };
  const [result] = sightPeaks([peak], { origin: ORIGIN, observerHeightM: 1.6, terrain, bands: BANDS, stepPerPixel: 1 });
  assert.equal(result!.visibility, 'hidden');
});
