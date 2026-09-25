/**
 * 山稜・山頂・方位目盛りを、帯状の画面（既定 576×144）の座標に置く。
 *
 * ここは**描かない**。描く物のリスト（表示リスト）を返すだけにして、
 * ビットマップへの描画と文字のラスタライズは app 側に任せる。
 * そうすると投影とラベル配置を Node のテストで確かめられる。
 *
 * 頭の向き（heading）について:
 *   SDK 0.0.15 / 0.0.16 の IMU は重力加速度 x/y/z だけで、北基準の方位（yaw）は取れない。
 *   なので heading は**テンプルのスワイプで手動で合わせる値**で、
 *   pitch だけが IMU 由来（Tokyojihatsu で実測済み: pitch = asin(x), 見上げると +）。
 *   ここでは出どころを問わず「今どちらを向いているとみなすか」として受け取る。
 */

import { horizonAt, type Horizon, type PeakSighting, type PeakVisibility } from './horizon.js';
import { normalizeDeg, wrapDeltaDeg } from './geodesy.js';

export interface ViewState {
  /** 画面中央の方位（真北基準, 度）。 */
  headingDeg: number;
  /** 頭の上下角（度, 見上げると +）。pitchFollow のときだけ使う。 */
  pitchDeg: number;
  /** 画面の横幅が何度ぶんか。 */
  hfovDeg: number;
  /**
   * true: 縦も横と同じ縮尺にして、頭の上下に合わせて山稜を動かす（AR 的な表示）。
   * false: 縦を自動で引き伸ばして帯の中に収める（山名コンパス的な表示）。
   */
  pitchFollow: boolean;
  /** 上下の校正（画素）。表示面と視線のずれを合わせる。 */
  verticalOffsetPx: number;
}

export interface SceneLayout {
  width: number;
  height: number;
  /** ラベルを置く行の上端（y）。上から順に試す。 */
  labelRows: number[];
  labelHeight: number;
  /** 地形を描いてよい範囲。 */
  terrainTop: number;
  terrainBottom: number;
  /** 方位目盛りの基線。 */
  tickBaseline: number;
  maxLabels: number;
}

export const DEFAULT_LAYOUT: SceneLayout = {
  width: 576,
  height: 144,
  labelRows: [0, 18, 36],
  labelHeight: 16,
  terrainTop: 58,
  terrainBottom: 128,
  tickBaseline: 143,
  maxLabels: 6,
};

export interface SkylineSegment {
  points: { x: number; y: number }[];
}

export interface PlacedLabel<P> {
  sighting: PeakSighting<P>;
  text: string;
  x: number;
  y: number;
  width: number;
  /** 山頂の位置（引き出し線の先）。 */
  anchorX: number;
  anchorY: number;
  /** 山頂より下に置いたか（山頂が帯の上の方にあって上に場所が無いとき）。 */
  below: boolean;
}

export interface Tick {
  x: number;
  length: number;
  label: string | null;
}

export interface Scene<P> {
  skyline: SkylineSegment[];
  labels: PlacedLabel<P>[];
  /** ラベルを置けなかったが視野内にある山の印。 */
  markers: { x: number; y: number; visibility: PeakVisibility }[];
  ticks: Tick[];
  /** 画面中央にいちばん近いラベル（文字欄に詳しく出す）。 */
  focus: PlacedLabel<P> | null;
  pxPerDegX: number;
  pxPerDegY: number;
}

/**
 * 縦の縮尺と位置。
 *
 * コンパス表示では、全周の山稜の最低〜最高が地形の範囲に収まるように引き伸ばす。
 * 視野ごとに縮尺を変えると、スワイプのたびに山稜が上下に跳ねて読めないので、
 * **全周で 1 回決めて固定**する。
 */
export function verticalMapping(
  horizon: Horizon,
  view: ViewState,
  layout: SceneLayout,
): { pxPerDeg: number; toY: (elevationDeg: number) => number } {
  const pxPerDegX = layout.width / view.hfovDeg;

  if (view.pitchFollow) {
    // 水平（仰角 0°）を帯の下寄りに置く。山は水平より上に見えることが多く、
    // 上に山名の場所を残したい。表示面と視線の本当の関係は未測定なので
    // verticalOffsetPx で合わせる。
    const centerY = layout.height * 0.7 + view.verticalOffsetPx;
    return {
      pxPerDeg: pxPerDegX,
      toY: (e) => centerY - (e - view.pitchDeg) * pxPerDegX,
    };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const e of horizon.elevationDeg) {
    if (Number.isNaN(e)) continue;
    if (e < min) min = e;
    if (e > max) max = e;
  }
  if (!Number.isFinite(min)) {
    min = -1;
    max = 1;
  }
  const span = Math.max(0.5, max - min);
  const room = layout.terrainBottom - layout.terrainTop;
  const pxPerDeg = Math.min(pxPerDegX * 8, Math.max(pxPerDegX, room / span));
  // 最高点を上端に合わせる。引き伸ばしが上限に当たったら中央に寄せる。
  const used = span * pxPerDeg;
  const top = layout.terrainTop + Math.max(0, (room - used) / 2);
  return {
    pxPerDeg,
    toY: (e) => top + (max - e) * pxPerDeg + view.verticalOffsetPx,
  };
}

/** 方位 → 画面の x。視野外でも値は返す（呼び出し側で切る）。 */
export function azimuthToX(azimuthDeg: number, view: ViewState, width: number): number {
  return width / 2 + wrapDeltaDeg(azimuthDeg - view.headingDeg) * (width / view.hfovDeg);
}

const VISIBILITY_RANK: Record<PeakVisibility, number> = { visible: 0, uncertain: 1, unknown: 2, hidden: 3 };

export interface SceneOptions<P> {
  horizon: Horizon;
  sightings: readonly PeakSighting<P>[];
  view: ViewState;
  layout?: SceneLayout;
  /** ラベルの文字列。 */
  labelText: (sighting: PeakSighting<P>) => string;
  /** 文字列の描画幅（画素）。ブラウザでは canvas で測る。 */
  measure: (text: string) => number;
  /** 隠れている山も出すか。 */
  includeHidden?: boolean;
  /** ラベルの優先度（大きいほど先に置く）。既定は標高。 */
  priority?: (sighting: PeakSighting<P>) => number;
}

export function buildScene<P>(options: SceneOptions<P>): Scene<P> {
  const { horizon, sightings, view, labelText, measure, includeHidden = false } = options;
  const layout = options.layout ?? DEFAULT_LAYOUT;
  const pxPerDegX = layout.width / view.hfovDeg;
  const { pxPerDeg: pxPerDegY, toY } = verticalMapping(horizon, view, layout);
  const half = view.hfovDeg / 2;

  // 山稜: 1 列ずつ方位を求めて仰角を引く。NaN（DEM 無し）で線を切る。
  const skyline: SkylineSegment[] = [];
  let current: SkylineSegment | null = null;
  for (let x = 0; x < layout.width; x += 1) {
    const az = view.headingDeg + (x + 0.5 - layout.width / 2) / pxPerDegX;
    const e = horizonAt(horizon, az);
    if (Number.isNaN(e)) {
      current = null;
      continue;
    }
    if (!current) {
      current = { points: [] };
      skyline.push(current);
    }
    current.points.push({ x, y: toY(e) });
  }

  // 目盛り: 10° ごと、45° ごとに方位名。
  const ticks: Tick[] = [];
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  const tickStep = view.hfovDeg > 90 ? 15 : view.hfovDeg > 40 ? 5 : 1;
  const first = Math.ceil((view.headingDeg - half) / tickStep) * tickStep;
  for (let az = first; az <= view.headingDeg + half; az += tickStep) {
    const n = Math.round(normalizeDeg(az));
    const x = azimuthToX(n, view, layout.width);
    if (x < 0 || x >= layout.width) continue;
    const label = n % 45 === 0 ? names[n % 360] ?? null : null;
    ticks.push({ x, length: label ? 8 : n % 10 === 0 ? 5 : 2, label });
  }

  // 山: 視野内だけ。
  const inView = sightings
    .filter((s) => includeHidden || s.visibility !== 'hidden')
    .map((s) => ({ s, x: azimuthToX(s.azimuthDeg, view, layout.width), dx: wrapDeltaDeg(s.azimuthDeg - view.headingDeg) }))
    .filter((e) => Math.abs(e.dx) <= half);

  const priority = options.priority ?? ((s: PeakSighting<P>) => (s as { peak: { elevationM?: number | null } }).peak.elevationM ?? 0);
  inView.sort(
    (a, b) =>
      VISIBILITY_RANK[a.s.visibility] - VISIBILITY_RANK[b.s.visibility] ||
      priority(b.s) - priority(a.s) ||
      a.s.distanceM - b.s.distanceM,
  );

  const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
  const labels: PlacedLabel<P>[] = [];
  const markers: Scene<P>['markers'] = [];
  const gap = 4;
  // 下に置くときの下限。方位目盛りと中央の印（約 14px）にかからないように。
  const belowLimit = layout.tickBaseline - 14;

  for (const { s, x } of inView) {
    const anchorY = toY(s.elevationDeg);
    if (anchorY < 0 || anchorY >= layout.height) continue;
    if (labels.length >= layout.maxLabels) {
      markers.push({ x, y: anchorY, visibility: s.visibility });
      continue;
    }
    const text = labelText(s);
    const width = Math.ceil(measure(text));
    const left = Math.min(Math.max(0, Math.round(x - width / 2)), layout.width - width);
    const right = left + width;
    const h = layout.labelHeight;

    // 候補: 上の行を上から順に（引き出し線がラベルを貫かないよう山頂より上だけ）、
    // 無ければ山頂のすぐ下。
    const candidates: { y: number; below: boolean }[] = layout.labelRows
      .filter((y) => y + h <= anchorY - 2)
      .map((y) => ({ y, below: false }));
    const underY = Math.round(anchorY + 4);
    if (underY + h <= belowLimit) candidates.push({ y: underY, below: true });

    const spot = candidates.find(
      ({ y }) => !occupied.some((o) => left < o.right + gap && right + gap > o.left && y < o.bottom + 1 && y + h + 1 > o.top),
    );
    if (!spot) {
      markers.push({ x, y: anchorY, visibility: s.visibility });
      continue;
    }
    occupied.push({ left, right, top: spot.y, bottom: spot.y + h });
    labels.push({ sighting: s, text, x: left, y: spot.y, width, anchorX: x, anchorY, below: spot.below });
  }

  let focus: PlacedLabel<P> | null = null;
  for (const label of labels) {
    if (!focus || Math.abs(label.anchorX - layout.width / 2) < Math.abs(focus.anchorX - layout.width / 2)) focus = label;
  }

  return { skyline, labels, markers, ticks, focus, pxPerDegX, pxPerDegY };
}
