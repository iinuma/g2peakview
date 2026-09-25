/**
 * 国土地理院の標高タイル（dem_png）。
 *
 * 仕様: https://maps.gsi.go.jp/development/demtile.html
 *
 *   v = 65536·R + 256·G + B
 *   v == 2^23      → 無効値（noData）
 *   v <  2^23      → 標高 = v × 0.01 m
 *   v >  2^23      → 標高 = (v − 2^24) × 0.01 m
 *
 * **PNG は自前の純 JS デコーダ（fast-png）で読む。** canvas に描いてから
 * getImageData すると、ブラウザの色管理やプリマルチプライで RGB が 1 だけ
 * ずれることがあり、それは標高で ±655m の誤差になる。Node のテストと実機で
 * 同じデコーダを通すので、手元で確かめた値がそのまま実機でも出る。
 *
 * 0.01m は符号化の刻みであって、測量の精度ではない。DEM10B の実際の精度は
 * 数メートル。
 *
 * 無効値（海・範囲外）は NaN で持つ。**0m で埋めない。** 海を 0m とみなして
 * よい根拠は、このタイルだけからは得られない。
 */

import { decode } from 'fast-png';
import type { LatLng } from './geodesy.js';

export const DEM_TILE_SIZE = 256;
const NO_DATA = 2 ** 23;

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

export const tileKey = (tile: TileRef): string => `${tile.z}/${tile.x}/${tile.y}`;

/** 1 画素（R,G,B）を標高に。無効値は NaN。 */
export function decodeElevation(r: number, g: number, b: number): number {
  const v = r * 65536 + g * 256 + b;
  if (v === NO_DATA) return Number.NaN;
  return v < NO_DATA ? v * 0.01 : (v - 2 ** 24) * 0.01;
}

/** 標高を RGB に（テスト用の合成タイルを作るため）。 */
export function encodeElevation(elevationM: number): [number, number, number] {
  if (!Number.isFinite(elevationM)) return [128, 0, 0];
  let v = Math.round(elevationM * 100);
  if (v < 0) v += 2 ** 24;
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** PNG バイト列 → 256×256 の標高（m, noData は NaN）。 */
export function decodeDemPng(bytes: Uint8Array): Float32Array {
  const image = decode(bytes);
  if (image.width !== DEM_TILE_SIZE || image.height !== DEM_TILE_SIZE) {
    throw new Error(`unexpected DEM tile size ${image.width}x${image.height}`);
  }
  if (image.depth !== 8) throw new Error(`unexpected DEM bit depth ${image.depth}`);

  const out = new Float32Array(DEM_TILE_SIZE * DEM_TILE_SIZE);
  const data = image.data;
  const palette = image.palette;

  if (palette) {
    // パレット PNG で来ることは仕様上想定されていないが、来ても読めるようにする。
    for (let i = 0; i < out.length; i += 1) {
      const entry = palette[data[i]!];
      out[i] = entry ? decodeElevation(entry[0]!, entry[1]!, entry[2]!) : Number.NaN;
    }
    return out;
  }

  const channels = image.channels;
  if (channels !== 3 && channels !== 4) throw new Error(`unexpected DEM channels ${channels}`);
  for (let i = 0; i < out.length; i += 1) {
    const o = i * channels;
    // 透明画素は無効値として扱う（RGB は意味を持たない）。
    if (channels === 4 && data[o + 3] === 0) {
      out[i] = Number.NaN;
      continue;
    }
    out[i] = decodeElevation(data[o]!, data[o + 1]!, data[o + 2]!);
  }
  return out;
}

export function demTileUrl(tile: TileRef): string {
  return `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${tile.z}/${tile.x}/${tile.y}.png`;
}

export const DEM_ATTRIBUTION = '出典: 国土地理院 標高タイル（加工して使用）';

/* ---------- タイル座標 ---------- */

/** Web メルカトルの世界画素座標（zoom z で全世界が 256·2^z 画素）。 */
export function worldPixel(point: LatLng, zoom: number): { px: number; py: number } {
  const scale = DEM_TILE_SIZE * 2 ** zoom;
  const latRad = (point.lat * Math.PI) / 180;
  return {
    px: ((point.lng + 180) / 360) * scale,
    py: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

/** その緯度・ズームで 1 画素が地上何メートルか。 */
export function metersPerPixel(latDeg: number, zoom: number): number {
  return (156543.03392 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;
}

function tileLngDeg(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileLatDeg(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

export function tileBounds(tile: TileRef): { north: number; south: number; west: number; east: number } {
  return {
    north: tileLatDeg(tile.y, tile.z),
    south: tileLatDeg(tile.y + 1, tile.z),
    west: tileLngDeg(tile.x, tile.z),
    east: tileLngDeg(tile.x + 1, tile.z),
  };
}

/* ---------- 距離帯ごとのズーム ---------- */

/**
 * 近くは細かく、遠くは粗く。
 *
 * 標高の刻み（地上解像度）は DEM10B 由来で z14 が約 8m。遠方は角度で見れば
 * 粗いタイルでも十分細かい（z9 の 250m 画素は 100km 先で 0.14°）。
 * 取得量はこの表でほぼ決まるので、変えたら test/dem.test.ts の枚数も見る。
 */
export interface DemBand {
  zoom: number;
  fromM: number;
  toM: number;
}

export const DEFAULT_BANDS: readonly DemBand[] = [
  { zoom: 13, fromM: 0, toM: 6_000 },
  { zoom: 11, fromM: 6_000, toM: 40_000 },
  { zoom: 9, fromM: 40_000, toM: 150_000 },
];

/**
 * 観測点から見て、帯 [fromM, toM] に掛かるタイルの一覧。
 *
 * 輪の内側にすっぽり入るタイル（より細かい帯が受け持つ）は取らない。
 * 距離の判定は緯度経度を平面とみなした近似で、境界に 1 画素ぶんの余裕を持たせる。
 */
export function tilesForBand(origin: LatLng, band: DemBand): TileRef[] {
  const z = band.zoom;
  const margin = metersPerPixel(origin.lat, z) * 2;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);

  const reachLat = (band.toM + margin) / mPerDegLat;
  const reachLng = (band.toM + margin) / mPerDegLng;
  const nw = worldPixel({ lat: origin.lat + reachLat, lng: origin.lng - reachLng }, z);
  const se = worldPixel({ lat: origin.lat - reachLat, lng: origin.lng + reachLng }, z);

  const x0 = Math.floor(nw.px / DEM_TILE_SIZE);
  const x1 = Math.floor(se.px / DEM_TILE_SIZE);
  const y0 = Math.floor(nw.py / DEM_TILE_SIZE);
  const y1 = Math.floor(se.py / DEM_TILE_SIZE);

  const tiles: TileRef[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const b = tileBounds({ z, x, y });
      // 観測点からタイルの最も近い点・最も遠い点までの距離（平面近似）。
      const nearLat = Math.min(Math.max(origin.lat, b.south), b.north);
      const nearLng = Math.min(Math.max(origin.lng, b.west), b.east);
      const near = Math.hypot((nearLat - origin.lat) * mPerDegLat, (nearLng - origin.lng) * mPerDegLng);
      const farLat = Math.abs(b.north - origin.lat) > Math.abs(b.south - origin.lat) ? b.north : b.south;
      const farLng = Math.abs(b.east - origin.lng) > Math.abs(b.west - origin.lng) ? b.east : b.west;
      const far = Math.hypot((farLat - origin.lat) * mPerDegLat, (farLng - origin.lng) * mPerDegLng);
      if (near <= band.toM + margin && far >= band.fromM - margin) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/* ---------- 標高の参照 ---------- */

/** 取得できなかったタイル（404・圏外）は null。全画素 noData と同じ扱い。 */
export type TileData = Float32Array | null;

/**
 * 読み込み済みのタイルから標高を引く。非同期の取得は外（app/src/demfetch.ts や
 * テストの合成地形）がやり、ここは同期で引くだけにする。走査の内側ループで
 * await を挟むと 1 桁遅くなる。
 */
export class TileTerrain {
  private readonly tiles = new Map<string, TileData>();
  private lastKey = '';
  private lastData: TileData | undefined;

  put(tile: TileRef, data: TileData): void {
    this.tiles.set(tileKey(tile), data);
    this.lastKey = '';
  }

  has(tile: TileRef): boolean {
    return this.tiles.has(tileKey(tile));
  }

  get size(): number {
    return this.tiles.size;
  }

  /** 読み込み済みのうち、取得できなかったタイルの枚数。 */
  get missingCount(): number {
    let count = 0;
    for (const data of this.tiles.values()) if (!data) count += 1;
    return count;
  }

  /**
   * zoom の DEM から双一次補間で標高を引く。
   *
   * 4 近傍に無効値が混じったら有効なものだけで重み付き平均する（海岸線で
   * 山が削れないように）。全部無効、またはタイル未読み込みなら null。
   */
  elevationAt(lat: number, lng: number, zoom: number): number | null {
    const { px, py } = worldPixel({ lat, lng }, zoom);
    // 画素の値は画素の中心を代表する。
    const fx = px - 0.5;
    const fy = py - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;

    const v00 = this.pixel(zoom, x0, y0);
    const v10 = this.pixel(zoom, x0 + 1, y0);
    const v01 = this.pixel(zoom, x0, y0 + 1);
    const v11 = this.pixel(zoom, x0 + 1, y0 + 1);

    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;

    let sum = 0;
    let weight = 0;
    if (!Number.isNaN(v00)) { sum += v00 * w00; weight += w00; }
    if (!Number.isNaN(v10)) { sum += v10 * w10; weight += w10; }
    if (!Number.isNaN(v01)) { sum += v01 * w01; weight += w01; }
    if (!Number.isNaN(v11)) { sum += v11 * w11; weight += w11; }
    if (weight > 0) return sum / weight;
    // 無効画素のちょうど中心を引くと、有効な近傍の重みが全部 0 になる。
    // そのときは有効な近傍の単純平均にする。全部無効なら null。
    let count = 0;
    sum = 0;
    for (const v of [v00, v10, v01, v11]) {
      if (!Number.isNaN(v)) {
        sum += v;
        count += 1;
      }
    }
    return count > 0 ? sum / count : null;
  }

  /** 世界画素座標の 1 画素。無ければ NaN。 */
  private pixel(zoom: number, wx: number, wy: number): number {
    const tx = Math.floor(wx / DEM_TILE_SIZE);
    const ty = Math.floor(wy / DEM_TILE_SIZE);
    const key = `${zoom}/${tx}/${ty}`;
    let data: TileData | undefined;
    if (key === this.lastKey) {
      data = this.lastData;
    } else {
      data = this.tiles.get(key);
      this.lastKey = key;
      this.lastData = data;
    }
    if (!data) return Number.NaN;
    const ix = wx - tx * DEM_TILE_SIZE;
    const iy = wy - ty * DEM_TILE_SIZE;
    return data[iy * DEM_TILE_SIZE + ix]!;
  }
}
