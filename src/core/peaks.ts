/**
 * 山頂データ。
 *
 * 出典: 国土地理院「日本の主な山岳標高（1003 山）」
 * https://web2.gsi.go.jp/kihonjohochousa/kihonjohochousa41139.html
 *
 * 元の CSV は Shift_JIS（CP932）で、列は
 *   連番, 索引番号, 山名＜山頂名＞, 山名よみ＜山頂名よみ＞, 標高値(m), 種別, 都道府県, 緯度, 経度
 * 緯度経度は十進度（度分秒ではない）。2026-03-31 版で確認した。
 *
 * 「丹沢山＜蛭ヶ岳＞」のように、山名の中の個別の頂が ＜＞ で付く。
 * 表示名は索引番号で決める。「361-1 丹沢山＜蛭ヶ岳＞」「361-2 丹沢山」
 * 「361-3 丹沢山＜塔ノ岳＞」のように**同じ索引番号に複数の頂がある山だけ**
 * 頂の名前を出す。「368 富士山＜剣ヶ峯＞」のように頂が 1 つなら山名を出す
 * （富士山が「剣ヶ峯」と出ても誰にも分からない）。
 * 同名の山は多い（「大山」だけで 3 つある）ので、**名前で識別しない**。
 * id は連番から作る。
 */

export interface Peak {
  /** 出典内で一意。`gsi1003:<連番>`。 */
  id: string;
  /** 表示名。複数の頂を持つ山なら頂の名前、そうでなければ山名。 */
  name: string;
  /** 山名（＜＞の外側）。 */
  mountainName: string;
  /** 頂の名前（＜＞の内側）。無ければ null。 */
  summitName: string | null;
  /** 読み（表示名に対応するもの）。 */
  reading: string;
  latDeg: number;
  lonDeg: number;
  elevationM: number | null;
  /** 三角点・標高点・測定点など。三角点名と山名は別物なので混同しない。 */
  pointKind: string;
  prefecture: string;
  source: string;
  sourceVersion: string;
}

export interface PeakDataset {
  source: string;
  sourceVersion: string;
  sourceUrl: string;
  attribution: string;
  peaks: Peak[];
}

export const GSI_1003_SOURCE = 'gsi-1003';
export const GSI_1003_URL = 'https://web2.gsi.go.jp/kihonjohochousa/kihonjohochousa41139.html';
export const PEAK_ATTRIBUTION = '出典: 国土地理院「日本の主な山岳標高」';

/** 「丹沢山＜蛭ヶ岳＞」→ ["丹沢山", "蛭ヶ岳"]。＜＞が無ければ [全体, null]。 */
export function splitSummit(text: string): [string, string | null] {
  const match = /^(.*?)＜(.+)＞\s*$/.exec(text.trim());
  if (!match) return [text.trim(), null];
  return [match[1]!.trim(), match[2]!.trim()];
}

/** 単純な CSV 1 行の分割。この CSV には引用符付きの欄が無い（確認済み）が、念のため扱う。 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export interface ParseReport {
  peaks: Peak[];
  /** 読めなかった行（行番号と理由）。黙って捨てずに数を出す。 */
  skipped: { line: number; reason: string }[];
}

/** UTF-8 に直した CSV 本文を読む。 */
export function parseGsi1003Csv(text: string, sourceVersion: string): ParseReport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  const expected = ['連番', '索引番号', '山名＜山頂名＞', '山名よみ＜山頂名よみ＞', '標高値(m)', '種別', '都道府県', '緯度', '経度'];
  if (expected.some((name, i) => header[i]?.trim() !== name)) {
    throw new Error(`unexpected header: ${header.join(',')}`);
  }

  const peaks: Peak[] = [];
  const indexGroups: string[] = [];
  const skipped: ParseReport['skipped'] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const cols = splitCsvLine(line);
    if (cols.length < 9) {
      skipped.push({ line: i + 1, reason: `columns ${cols.length}` });
      continue;
    }
    const [serial, indexCol, nameCol, readingCol, elevCol, kind, pref, latCol, lonCol] = cols.map((c) => c.trim());
    const lat = Number(latCol);
    const lon = Number(lonCol);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 46 || lon < 122 || lon > 154) {
      skipped.push({ line: i + 1, reason: `bad coordinate ${latCol},${lonCol}` });
      continue;
    }
    const id = `gsi1003:${serial}`;
    if (seen.has(id)) {
      skipped.push({ line: i + 1, reason: `duplicate serial ${serial}` });
      continue;
    }
    seen.add(id);

    const [mountainName, summitName] = splitSummit(nameCol!);
    const [mountainReading, summitReading] = splitSummit(readingCol!);
    const elevation = Number(elevCol);

    peaks.push({
      id,
      name: summitName ?? mountainName,
      mountainName,
      summitName,
      reading: summitReading ?? mountainReading,
      latDeg: lat,
      lonDeg: lon,
      elevationM: elevCol !== '' && Number.isFinite(elevation) ? elevation : null,
      pointKind: kind ?? '',
      prefecture: pref ?? '',
      source: GSI_1003_SOURCE,
      sourceVersion,
    });
    indexGroups.push((indexCol ?? '').split('-')[0]!);
  }

  const groupSize = new Map<string, number>();
  for (const group of indexGroups) groupSize.set(group, (groupSize.get(group) ?? 0) + 1);
  peaks.forEach((peak, i) => {
    const multi = (groupSize.get(indexGroups[i]!) ?? 1) > 1;
    peak.name = multi ? (peak.summitName ?? peak.mountainName) : peak.mountainName;
  });

  return { peaks, skipped };
}
