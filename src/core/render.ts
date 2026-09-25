/**
 * 表示リスト（scene.ts）を G2 向けのビットマップに描く。
 *
 * 透過ディスプレイなので**光る＝描いたもの、黒＝現実が透ける**。
 * 面は塗らずに線と文字だけにする。明るさは 3 段:
 *   山稜・山名   bright  いちばん読ませたいもの
 *   目盛り・印   mid
 *   引き出し線   dim     山名と山頂の対応が分かれば足りる
 *
 * 文字のラスタライズは環境依存（ブラウザは canvas）なので外から受け取る。
 */

import { Bitmap, LEVEL, MAX_IMAGE_HEIGHT, MAX_IMAGE_WIDTH } from './bitmap.js';
import type { Scene } from './scene.js';

export interface Glyphs {
  /** 1 画素 1 バイト（0〜255）の濃淡。 */
  alpha: Uint8Array;
  width: number;
  height: number;
}

export type TextRasterizer = (text: string, sizePx: number) => Glyphs;

/** 濃淡を 2 値にして打つ。中間調は屋外で飛ぶので、にじませない。 */
export function blitText(bitmap: Bitmap, glyphs: Glyphs, x: number, y: number, level: number, threshold = 110): void {
  for (let gy = 0; gy < glyphs.height; gy += 1) {
    for (let gx = 0; gx < glyphs.width; gx += 1) {
      if ((glyphs.alpha[gy * glyphs.width + gx] ?? 0) >= threshold) bitmap.set(x + gx, y + gy, level);
    }
  }
}

export function renderScene<P>(
  scene: Scene<P>,
  size: { width: number; height: number; tickBaseline: number },
  rasterize: TextRasterizer | null,
): Bitmap {
  const bitmap = new Bitmap(size.width, size.height);

  // 目盛り
  for (const tick of scene.ticks) {
    bitmap.line(tick.x, size.tickBaseline, tick.x, size.tickBaseline - tick.length + 1, LEVEL.mid);
    if (tick.label && rasterize) {
      const glyphs = rasterize(tick.label, 12);
      blitText(bitmap, glyphs, Math.round(tick.x + 3), size.tickBaseline - glyphs.height + 1, LEVEL.mid);
    }
  }
  // 画面中央の印（下端の三角）
  const cx = Math.floor(size.width / 2);
  for (let i = 0; i < 5; i += 1) bitmap.line(cx - i, size.tickBaseline - 12 + i, cx + i, size.tickBaseline - 12 + i, LEVEL.bright);

  // 山稜
  for (const segment of scene.skyline) {
    for (let i = 1; i < segment.points.length; i += 1) {
      const a = segment.points[i - 1]!;
      const b = segment.points[i]!;
      bitmap.line(a.x, a.y, b.x, b.y, LEVEL.bright);
    }
    if (segment.points.length === 1) bitmap.set(segment.points[0]!.x, segment.points[0]!.y, LEVEL.bright);
  }

  // ラベルを置けなかった山の印
  for (const marker of scene.markers) {
    bitmap.line(marker.x, marker.y - 3, marker.x, marker.y - 6, marker.visibility === 'visible' ? LEVEL.mid : LEVEL.dim);
  }

  // 山名と引き出し線
  for (const label of scene.labels) {
    const level = label.sighting.visibility === 'visible' ? LEVEL.bright : LEVEL.mid;
    // 点線にして山稜の実線と区別する。
    if (label.below) {
      for (let y = label.anchorY + 2; y < label.y; y += 2) bitmap.set(label.anchorX, y, LEVEL.dim);
    } else {
      for (let y = label.y + 17; y < label.anchorY - 2; y += 2) bitmap.set(label.anchorX, y, LEVEL.dim);
    }
    bitmap.disc(label.anchorX, label.anchorY, 1, level);
    if (rasterize) {
      blitText(bitmap, rasterize(label.text, 16), label.x, label.y, level);
    } else {
      bitmap.rect(label.x, label.y, label.width, 16, level);
    }
  }

  return bitmap;
}

/** 576 幅を 288 幅 2 枚に分ける（SDK の画像コンテナは 1 枚 288×144 まで）。 */
export function splitHalves(bitmap: Bitmap): [Bitmap, Bitmap] {
  if (bitmap.width !== MAX_IMAGE_WIDTH * 2 || bitmap.height > MAX_IMAGE_HEIGHT) {
    throw new Error(`expected ${MAX_IMAGE_WIDTH * 2}x<=${MAX_IMAGE_HEIGHT}, got ${bitmap.width}x${bitmap.height}`);
  }
  const halves: [Bitmap, Bitmap] = [new Bitmap(MAX_IMAGE_WIDTH, bitmap.height), new Bitmap(MAX_IMAGE_WIDTH, bitmap.height)];
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const level = bitmap.get(x, y);
      if (level) halves[x < MAX_IMAGE_WIDTH ? 0 : 1].set(x % MAX_IMAGE_WIDTH, y, level);
    }
  }
  return halves;
}
