/**
 * 計算した結果が「使える」か、使えないならなぜか。
 *
 * 日本の外で起動すると、標高タイルはすべて 404 になり、範囲内の山も 0 件になる。
 * そのまま出すと空の画面に「視野に山なし」とだけ出て、壊れたアプリに見える。
 * Even Hub の審査担当者は日本の外にいる可能性が高いので、理由をはっきり出し、
 * デモ（高尾山）に切り替えられるようにする（2026-10-03）。
 *
 *   ok       山稜が少なくとも一部の方位で取れた
 *   outside  通信はできたが DEM も山も無い（対応範囲外）
 *   offline  タイルの取得に失敗し、山稜が全く取れなかった（通信を確認）
 */

import type { LoadReport } from './demload.js';
import type { Horizon } from './horizon.js';

export type Coverage = 'ok' | 'outside' | 'offline';

export function assessCoverage(report: LoadReport, horizon: Horizon, peaksInRange: number): Coverage {
  const anyRidge = horizon.status.some((s) => s !== 'missing');
  if (anyRidge) return 'ok';
  // 1 枚でも取得に失敗していれば、範囲外とは言い切れない。通信のせいかもしれない。
  if (report.failed > 0) return 'offline';
  // 山稜は無いが山だけある、は起きにくい（DEM の範囲は山頂データより広い）。
  // 起きたら範囲外ではなく ok として、山の印だけでも出す。
  return peaksInRange > 0 ? 'ok' : 'outside';
}
