/**
 * 山稜（空と地形の境界）の計算と、山頂が見えるかの判定。
 *
 * 独自実装。PeakFinder など既存アプリの内部実装を説明したものではない。
 *
 * やっていること:
 *   観測点の周囲 360° を方位ビンに分け、各方位で近くから遠くへ DEM を
 *   たどり、見かけの仰角の最大値をその方位の山稜とする。
 *
 * 注意していること:
 * - **刻みは DEM の画素間隔に合わせる。** 固定の粗い刻みだと細い尾根を飛び越える。
 * - **地球の丸みを入れる**（geodesy.ts の球の式）。100km 先で約 0.45° 効く。
 * - 足元の数十 m は走査しない。観測点自身のセルを「目の前の壁」と取り違える。
 * - DEM が無い区間（海・タイル欠け）は「そこには何も無い」とはせず、
 *   その方位を partial として記録する。
 * - 山頂の可視判定は**山頂より手前だけ**を見る。全距離の最大仰角と比べると、
 *   背後のもっと高い山を遮蔽物と取り違える。
 * - 樹木・建物・雲は DEM に無い。「見えるはず」であって「見える」ではない。
 */

import { metersPerPixel, type DemBand } from './dem.js';
import { elevationAngleRad, LocalSphere, toDeg, type LatLng } from './geodesy.js';

export interface ElevationLookup {
  elevationAt(lat: number, lng: number, zoom: number): number | null;
}

export type HorizonStatus = 'valid' | 'partial' | 'missing';

export interface HorizonOptions {
  origin: LatLng;
  /** 観測点の目の高さ（標高, m）。DEM の地表高＋目の高さ、が既定の作り方。 */
  observerHeightM: number;
  terrain: ElevationLookup;
  bands: readonly DemBand[];
  /** 方位ビンの幅。表示の 1 画素より細かければ十分。 */
  azimuthStepDeg?: number;
  /** 大気差の係数。既定 0（補正しない）。 */
  refraction?: number;
  /** 足元の除外距離。 */
  startM?: number;
  /** DEM 画素間隔に対する刻みの比。1 以下にすること。 */
  stepPerPixel?: number;
}

export interface Horizon {
  origin: LatLng;
  observerHeightM: number;
  azimuthStepDeg: number;
  /** 各方位の山稜の仰角（度）。一度も DEM に当たらなければ NaN。 */
  elevationDeg: Float32Array;
  /** 山稜を作った地形までの距離（m）。 */
  occluderDistanceM: Float32Array;
  status: HorizonStatus[];
  maxRangeM: number;
  computeMs: number;
  samples: number;
}

/**
 * 1 方位ぶんの走査。距離 limitM まで進み、最大仰角とその距離を返す。
 * 山稜全体の計算と山頂の可視判定で同じ関数を使う（食い違いを作らないため）。
 */
function march(
  sphere: LocalSphere,
  radiusEff: number,
  observerHeightM: number,
  terrain: ElevationLookup,
  bands: readonly DemBand[],
  azimuthDeg: number,
  startM: number,
  limitM: number,
  stepPerPixel: number,
): { maxRad: number; atM: number; hits: number; misses: number; samples: number } {
  const ray = sphere.rayFrom(azimuthDeg);
  let maxRad = Number.NEGATIVE_INFINITY;
  let atM = Number.NaN;
  let hits = 0;
  let misses = 0;
  let samples = 0;

  for (const band of bands) {
    const from = Math.max(band.fromM, startM);
    const to = Math.min(band.toM, limitM);
    if (to <= from) continue;
    const step = metersPerPixel(sphere.origin.lat, band.zoom) * stepPerPixel;
    for (let d = from; d <= to; d += step) {
      const p = ray.at(d);
      const h = terrain.elevationAt(p.lat, p.lng, band.zoom);
      samples += 1;
      if (h === null) {
        misses += 1;
        continue;
      }
      hits += 1;
      const angle = elevationAngleRad(radiusEff, observerHeightM, d, h);
      if (angle > maxRad) {
        maxRad = angle;
        atM = d;
      }
    }
  }
  return { maxRad, atM, hits, misses, samples };
}

export function computeHorizon(options: HorizonOptions): Horizon {
  const started = performance.now();
  const {
    origin,
    observerHeightM,
    terrain,
    bands,
    azimuthStepDeg = 0.2,
    refraction = 0,
    startM = 30,
    stepPerPixel = 0.75,
  } = options;

  const sphere = new LocalSphere(origin);
  const radiusEff = sphere.radiusM / (1 - refraction);
  const bins = Math.round(360 / azimuthStepDeg);
  const elevationDeg = new Float32Array(bins);
  const occluderDistanceM = new Float32Array(bins);
  const status: HorizonStatus[] = new Array(bins);
  const maxRangeM = Math.max(...bands.map((b) => b.toM));
  let samples = 0;

  for (let i = 0; i < bins; i += 1) {
    const az = i * azimuthStepDeg;
    const result = march(sphere, radiusEff, observerHeightM, terrain, bands, az, startM, maxRangeM, stepPerPixel);
    samples += result.samples;
    if (result.hits === 0) {
      elevationDeg[i] = Number.NaN;
      occluderDistanceM[i] = Number.NaN;
      status[i] = 'missing';
      continue;
    }
    elevationDeg[i] = toDeg(result.maxRad);
    occluderDistanceM[i] = result.atM;
    status[i] = result.misses > 0 ? 'partial' : 'valid';
  }

  return {
    origin,
    observerHeightM,
    azimuthStepDeg,
    elevationDeg,
    occluderDistanceM,
    status,
    maxRangeM,
    computeMs: performance.now() - started,
    samples,
  };
}

/** 方位（度）での山稜の仰角。隣のビンと線形補間する。 */
export function horizonAt(horizon: Horizon, azimuthDeg: number): number {
  const bins = horizon.elevationDeg.length;
  const f = (((azimuthDeg % 360) + 360) % 360) / horizon.azimuthStepDeg;
  const i0 = Math.floor(f) % bins;
  const i1 = (i0 + 1) % bins;
  const t = f - Math.floor(f);
  const a = horizon.elevationDeg[i0]!;
  const b = horizon.elevationDeg[i1]!;
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return a + (b - a) * t;
}

/* ---------- 山頂の可視判定 ---------- */

export type PeakVisibility = 'visible' | 'uncertain' | 'hidden' | 'unknown';

export interface PeakSighting<P> {
  peak: P;
  azimuthDeg: number;
  distanceM: number;
  /** 山頂の見かけの仰角。 */
  elevationDeg: number;
  /** 山頂より手前の地形の最大仰角。手前に DEM が無ければ NaN。 */
  blockingDeg: number;
  visibility: PeakVisibility;
}

export interface SightingOptions {
  origin: LatLng;
  observerHeightM: number;
  terrain: ElevationLookup;
  bands: readonly DemBand[];
  refraction?: number;
  startM?: number;
  stepPerPixel?: number;
  /**
   * 判定を「不確か」にする幅の下限（度）。境界付近は DEM 誤差でどちらにも転ぶ。
   * 実際の幅は、遮蔽地形までの距離で DEM の高さ誤差を角度にしたものと大きい方。
   */
  minToleranceDeg?: number;
  /** DEM の高さ誤差の見込み（m）。 */
  demErrorM?: number;
}

export interface PeakLike {
  latDeg: number;
  lonDeg: number;
  elevationM: number | null;
}

export function sightPeaks<P extends PeakLike>(peaks: readonly P[], options: SightingOptions): PeakSighting<P>[] {
  const {
    origin,
    observerHeightM,
    terrain,
    bands,
    refraction = 0,
    startM = 30,
    stepPerPixel = 0.75,
    minToleranceDeg = 0.05,
    demErrorM = 10,
  } = options;
  const sphere = new LocalSphere(origin);
  const radiusEff = sphere.radiusM / (1 - refraction);
  const maxRangeM = Math.max(...bands.map((b) => b.toM));

  const out: PeakSighting<P>[] = [];
  for (const peak of peaks) {
    if (peak.elevationM === null) continue;
    const { distanceM, azimuthDeg } = sphere.inverse({ lat: peak.latDeg, lng: peak.lonDeg });
    if (distanceM > maxRangeM || distanceM < startM) continue;

    const elevationDeg = toDeg(elevationAngleRad(radiusEff, observerHeightM, distanceM, peak.elevationM));
    // 山頂の肩（自分自身の斜面）で自分を隠さないよう、手前で止める。
    const stopM = distanceM - Math.max(200, distanceM * 0.01);
    const before = march(sphere, radiusEff, observerHeightM, terrain, bands, azimuthDeg, startM, stopM, stepPerPixel);

    let visibility: PeakVisibility;
    let blockingDeg = Number.NaN;
    if (before.hits === 0) {
      // 手前の DEM が全く無い（すぐ近くの山、または海越し）。遮るものが分からない。
      visibility = stopM <= startM ? 'visible' : 'unknown';
    } else {
      blockingDeg = toDeg(before.maxRad);
      const tolerance = Math.max(minToleranceDeg, toDeg(Math.atan2(demErrorM, before.atM)));
      if (elevationDeg > blockingDeg + tolerance) visibility = 'visible';
      else if (elevationDeg < blockingDeg - tolerance) visibility = 'hidden';
      else visibility = 'uncertain';
      // 手前に DEM の欠けが多ければ、見えると言い切らない。
      if (visibility === 'visible' && before.misses > before.hits) visibility = 'uncertain';
    }

    out.push({ peak, azimuthDeg, distanceM, elevationDeg, blockingDeg, visibility });
  }
  return out;
}

/** 観測点の目の高さ。DEM が無ければ null（海上・範囲外）。 */
export function groundHeightM(terrain: ElevationLookup, origin: LatLng, bands: readonly DemBand[]): number | null {
  const finest = [...bands].sort((a, b) => b.zoom - a.zoom)[0];
  if (!finest) return null;
  return terrain.elevationAt(origin.lat, origin.lng, finest.zoom);
}
