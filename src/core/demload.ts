/**
 * 必要なタイルを並列で取ってきて TileTerrain に詰める。
 *
 * 取得の手段（fetch・ディスクキャッシュ）は呼び出し側が渡す。ブラウザと
 * Node で同じ流れを通すため。404 は「その範囲に DEM が無い」なので null を
 * 入れて先へ進む（海上のタイルは 404 が返る）。通信失敗も null だが、数は
 * 別に数える。圏外で地形が丸ごと抜けたのに「山が無い」と見せないため。
 */

import { decodeDemPng, tilesForBand, TileTerrain, type DemBand, type TileRef } from './dem.js';
import type { LatLng } from './geodesy.js';

/** 404 なら null。通信失敗は throw。 */
export type TileFetcher = (tile: TileRef) => Promise<Uint8Array | null>;

export interface LoadReport {
  requested: number;
  notFound: number;
  failed: number;
  bytes: number;
  ms: number;
}

export async function loadTerrain(
  origin: LatLng,
  bands: readonly DemBand[],
  fetcher: TileFetcher,
  options: { terrain?: TileTerrain; concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ terrain: TileTerrain; report: LoadReport }> {
  const started = performance.now();
  const terrain = options.terrain ?? new TileTerrain();
  const tiles = bands.flatMap((band) => tilesForBand(origin, band)).filter((tile) => !terrain.has(tile));
  const report: LoadReport = { requested: tiles.length, notFound: 0, failed: 0, bytes: 0, ms: 0 };

  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < tiles.length) {
      const tile = tiles[next++]!;
      try {
        const bytes = await fetcher(tile);
        if (bytes) {
          report.bytes += bytes.length;
          terrain.put(tile, decodeDemPng(bytes));
        } else {
          report.notFound += 1;
          terrain.put(tile, null);
        }
      } catch {
        // 失敗したタイルは入れない（次の読み込みで取り直せるように）。
        report.failed += 1;
      }
      done += 1;
      options.onProgress?.(done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 6 }, worker));

  report.ms = performance.now() - started;
  return { terrain, report };
}
