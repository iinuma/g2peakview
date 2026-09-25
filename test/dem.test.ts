import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from 'fast-png';

import {
  DEFAULT_BANDS,
  DEM_TILE_SIZE,
  decodeDemPng,
  decodeElevation,
  encodeElevation,
  tileBounds,
  tilesForBand,
  TileTerrain,
  worldPixel,
} from '../src/core/dem.js';

test('RGB → 標高: 正・ゼロ・負・noData（仕様の式）', () => {
  assert.equal(decodeElevation(0, 0, 0), 0);
  assert.ok(Math.abs(decodeElevation(0x05, 0xc3, 0x00) - 3776) < 1e-6); // 377600 = 0x05C300
  assert.ok(Math.abs(decodeElevation(0xff, 0xff, 0xff) - -0.01) < 1e-9);
  assert.ok(Math.abs(decodeElevation(0xff, 0xfc, 0x18) - -10) < 1e-9);
  assert.ok(Number.isNaN(decodeElevation(0x80, 0, 0)));
});

test('encode/decode の往復', () => {
  for (const h of [0, 0.01, 3776.24, -3.5, 8000]) {
    const [r, g, b] = encodeElevation(h);
    assert.ok(Math.abs(decodeElevation(r, g, b) - h) < 0.006, String(h));
  }
});

test('PNG を通しても値が変わらない（色補正なしのデコーダ）', () => {
  const data = new Uint8Array(DEM_TILE_SIZE * DEM_TILE_SIZE * 3);
  const heights = [3776, -12.34, 0, Number.NaN];
  for (let i = 0; i < DEM_TILE_SIZE * DEM_TILE_SIZE; i += 1) {
    const [r, g, b] = encodeElevation(heights[i % heights.length]!);
    data.set([r, g, b], i * 3);
  }
  const png = encode({ width: DEM_TILE_SIZE, height: DEM_TILE_SIZE, data, channels: 3, depth: 8 });
  const out = decodeDemPng(png);
  assert.ok(Math.abs(out[0]! - 3776) < 1e-3);
  assert.ok(Math.abs(out[1]! - -12.34) < 1e-3);
  assert.equal(out[2], 0);
  assert.ok(Number.isNaN(out[3]!));
});

test('タイル境界: 世界画素とタイルの範囲が一致する', () => {
  const b = tileBounds({ z: 10, x: 906, y: 404 });
  const nw = worldPixel({ lat: b.north, lng: b.west }, 10);
  assert.ok(Math.abs(nw.px - 906 * 256) < 1e-6);
  assert.ok(Math.abs(nw.py - 404 * 256) < 1e-6);
});

test('距離帯ごとの取得枚数（高尾山）: 通信量の目安が崩れていない', () => {
  const origin = { lat: 35.6251, lng: 139.2436 };
  const counts = DEFAULT_BANDS.map((band) => tilesForBand(origin, band).length);
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(total <= 90, `total ${total} (${counts.join('/')})`);
  for (const c of counts) assert.ok(c >= 4);
});

test('TileTerrain: 双一次補間・noData は平均から外す・未読込は null', () => {
  const terrain = new TileTerrain();
  const z = 10;
  const tile = { z, x: 906, y: 404 };
  const data = new Float32Array(DEM_TILE_SIZE * DEM_TILE_SIZE);
  for (let y = 0; y < DEM_TILE_SIZE; y += 1) for (let x = 0; x < DEM_TILE_SIZE; x += 1) data[y * DEM_TILE_SIZE + x] = x * 10;
  data[100 * DEM_TILE_SIZE + 51] = Number.NaN;
  terrain.put(tile, data);

  const b = tileBounds(tile);
  const lngAt = (px: number) => b.west + ((b.east - b.west) * px) / DEM_TILE_SIZE;
  const latAt = (py: number) => {
    // メルカトルなので緯度は画素に線形でない。worldPixel の逆で求める。
    const scale = 256 * 2 ** z;
    const n = Math.PI - (2 * Math.PI * (404 * 256 + py)) / scale;
    return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  };

  // 画素 10 と 11 の中心の中間 → 105
  const v = terrain.elevationAt(latAt(20.5), lngAt(11), z)!;
  assert.ok(Math.abs(v - 105) < 0.01, String(v));
  // 片方が noData なら残りだけで
  const w = terrain.elevationAt(latAt(100.5), lngAt(52), z)!; // 画素 51(NaN) と 52 の中間
  assert.ok(Math.abs(w - 520) < 0.01, String(w));
  // 無効画素のちょうど中心: 有効な近傍 (52,100)=520 (51,101)=510 (52,101)=520 の平均
  const c = terrain.elevationAt(latAt(100.5), lngAt(51.5), z)!;
  assert.ok(Math.abs(c - 1550 / 3) < 0.01, String(c));
  // 404 タイル
  terrain.put({ z, x: 907, y: 404 }, null);
  assert.equal(terrain.elevationAt(latAt(10), b.east + 0.01, z), null);
  // 読んでいないズーム
  assert.equal(terrain.elevationAt(latAt(10), lngAt(10), 11), null);
});
