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
  /**
   * 世界画素座標（Web メルカトル, zoom での px/py）で引く速い経路。あれば使う。
   * 走査の内側ループで緯度経度→メルカトルの log/tan を毎回計算せずに済む。
   */
  elevationAtWorld?(zoom: number, px: number, py: number): number | null;
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
 * 走査の段取り。方位によらず共通のもの（各サンプルの距離と、その距離での
 * 地球の丸みの cos/sin）を 1 回だけ計算しておく。
 *
 * 実機（iPhone の WebView）で 5.6 秒かかっていたので速くした（2026-09-25）。
 * 1 サンプルごとに destination の三角関数とメルカトルの log/tan を計算していたのを、
 * 1km ごとの基準点で正確に求めてその間を線形補間するようにした。1km の間での
 * 大円と直線の差は 1mm 未満で、DEM の画素（8〜250m）に比べて無視できる。
 */
interface BandPlan {
  zoom: number;
  from: number;
  dist: Float64Array;
  cos: Float64Array;
  sin: Float64Array;
}

interface MarchPlan {
  sphere: LocalSphere;
  radiusEff: number;
  observerRadius: number;
  terrain: ElevationLookup;
  bands: BandPlan[];
}

const KNOT_M = 1000;

function makePlan(
  sphere: LocalSphere,
  radiusEff: number,
  observerHeightM: number,
  terrain: ElevationLookup,
  bands: readonly DemBand[],
  startM: number,
  stepPerPixel: number,
): MarchPlan {
  const plans: BandPlan[] = [];
  for (const band of bands) {
    const from = Math.max(band.fromM, startM);
    if (band.toM <= from) continue;
    const step = metersPerPixel(sphere.origin.lat, band.zoom) * stepPerPixel;
    const count = Math.floor((band.toM - from) / step) + 1;
    const dist = new Float64Array(count);
    const cos = new Float64Array(count);
    const sin = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      const d = from + i * step;
      dist[i] = d;
      cos[i] = Math.cos(d / radiusEff);
      sin[i] = Math.sin(d / radiusEff);
    }
    plans.push({ zoom: band.zoom, from, dist, cos, sin });
  }
  return { sphere, radiusEff, observerRadius: radiusEff + observerHeightM, terrain, bands: plans };
}

/**
 * 1 方位ぶんの走査。距離 limitM まで進み、最大仰角とその距離を返す。
 * 山稜全体の計算と山頂の可視判定で同じ関数を使う（食い違いを作らないため）。
 *
 * 仰角そのもの（atan2）は最後に 1 回だけ求める。水平距離は常に正なので、
 * 「上がり / 水平」の比が最大の点が仰角も最大になる。
 */
function march(
  plan: MarchPlan,
  azimuthDeg: number,
  limitM: number,
): { maxRad: number; atM: number; hits: number; misses: number; samples: number } {
  const { sphere, radiusEff, observerRadius, terrain } = plan;
  const ray = sphere.rayFrom(azimuthDeg);
  const fast = typeof terrain.elevationAtWorld === 'function';
  let maxRatio = Number.NEGATIVE_INFINITY;
  let atM = Number.NaN;
  let hits = 0;
  let misses = 0;
  let samples = 0;

  for (const band of plan.bands) {
    const { dist, cos, sin, from, zoom } = band;
    let n = dist.length;
    if (dist[n - 1]! > limitM) {
      n = Math.floor((limitM - from) / (dist.length > 1 ? dist[1]! - dist[0]! : 1)) + 1;
      while (n > 0 && dist[n - 1]! > limitM) n -= 1;
    }
    if (n <= 0) continue;

    // 基準点（1km ごと）。速い経路なら世界画素、なければ緯度経度で持つ。
    const knots = Math.floor((dist[n - 1]! - from) / KNOT_M) + 2;
    const kx = new Float64Array(knots);
    const ky = new Float64Array(knots);
    const scale = 256 * 2 ** zoom;
    for (let k = 0; k < knots; k += 1) {
      const p = ray.at(from + k * KNOT_M);
      if (fast) {
        const latRad = (p.lat * Math.PI) / 180;
        kx[k] = ((p.lng + 180) / 360) * scale;
        ky[k] = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
      } else {
        kx[k] = p.lng;
        ky[k] = p.lat;
      }
    }

    for (let i = 0; i < n; i += 1) {
      const f = (dist[i]! - from) / KNOT_M;
      const k = Math.floor(f);
      const t = f - k;
      const x = kx[k]! + (kx[k + 1]! - kx[k]!) * t;
      const y = ky[k]! + (ky[k + 1]! - ky[k]!) * t;
      const h = fast ? terrain.elevationAtWorld!(zoom, x, y) : terrain.elevationAt(y, x, zoom);
      samples += 1;
      if (h === null) {
        misses += 1;
        continue;
      }
      hits += 1;
      const r = radiusEff + h;
      const ratio = (r * cos[i]! - observerRadius) / (r * sin[i]!);
      if (ratio > maxRatio) {
        maxRatio = ratio;
        atM = dist[i]!;
      }
    }
  }
  return { maxRad: Math.atan(maxRatio), atM, hits, misses, samples };
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
  const plan = makePlan(sphere, radiusEff, observerHeightM, terrain, bands, startM, stepPerPixel);
  const bins = Math.round(360 / azimuthStepDeg);
  const elevationDeg = new Float32Array(bins);
  const occluderDistanceM = new Float32Array(bins);
  const status: HorizonStatus[] = new Array(bins);
  const maxRangeM = Math.max(...bands.map((b) => b.toM));
  let samples = 0;

  for (let i = 0; i < bins; i += 1) {
    const az = i * azimuthStepDeg;
    const result = march(plan, az, maxRangeM);
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
  /**
   * 山頂からこれ以上低くなるまでを「その山の頂上部」とみなし、遮蔽物に数えない（m）。
   * {@link summitMassifStartM} を見よ。
   */
  summitDropM?: number;
}

export interface PeakLike {
  latDeg: number;
  lonDeg: number;
  elevationM: number | null;
}

/**
 * 山頂から観測点の方へたどって、標高が山頂より summitDropM 以上低くなる地点までの距離。
 * そこより手前だけを遮蔽物として見る。
 *
 * 山頂データの点は「最高点」であって「いちばん手前に見える点」ではない。富士山を
 * 北から見ると、最高点の剣ヶ峯は火口の向こう側にあり、手前の火口縁（3,700m 台）の
 * ほうが高い角度に見える。最高点だけで判定すると「富士山は見えない」になる
 * （三ツ峠山で実際に起きた）。山の頂上部が見えていれば、その山は見えているとする。
 *
 * 最低でも山頂の 200m または距離の 1% 手前で止める（DEM の丸めで山頂付近が
 * 山頂データより高く出ることがあるため）。遡るのは最大 5km まで。
 */
function summitMassifStartM(
  sphere: LocalSphere,
  terrain: ElevationLookup,
  bands: readonly DemBand[],
  azimuthDeg: number,
  distanceM: number,
  summitM: number,
  summitDropM: number,
  startM: number,
): number {
  const minBack = Math.max(200, distanceM * 0.01);
  const band = bands.find((b) => distanceM >= b.fromM && distanceM <= b.toM) ?? bands[bands.length - 1]!;
  const step = metersPerPixel(sphere.origin.lat, band.zoom);
  const ray = sphere.rayFrom(azimuthDeg);
  const limit = Math.max(startM, distanceM - 5_000);

  let d = distanceM - minBack;
  while (d > limit) {
    const p = ray.at(d);
    const h = terrain.elevationAt(p.lat, p.lng, band.zoom);
    // DEM が無いところは頂上部かどうか分からないので、そこで止める。
    if (h === null || h < summitM - summitDropM) break;
    d -= step;
  }
  return d;
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
    summitDropM = 100,
  } = options;
  const sphere = new LocalSphere(origin);
  const radiusEff = sphere.radiusM / (1 - refraction);
  const plan = makePlan(sphere, radiusEff, observerHeightM, terrain, bands, startM, stepPerPixel);
  const maxRangeM = Math.max(...bands.map((b) => b.toM));

  const out: PeakSighting<P>[] = [];
  for (const peak of peaks) {
    if (peak.elevationM === null) continue;
    const { distanceM, azimuthDeg } = sphere.inverse({ lat: peak.latDeg, lng: peak.lonDeg });
    if (distanceM > maxRangeM || distanceM < startM) continue;

    const elevationDeg = toDeg(elevationAngleRad(radiusEff, observerHeightM, distanceM, peak.elevationM));
    const stopM = summitMassifStartM(
      sphere, terrain, bands, azimuthDeg, distanceM, peak.elevationM, summitDropM, startM,
    );
    const before = march(plan, azimuthDeg, stopM);

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
