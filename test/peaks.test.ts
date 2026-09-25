import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseGsi1003Csv, splitSummit } from '../src/core/peaks.js';

const HEADER = '連番,索引番号,山名＜山頂名＞,山名よみ＜山頂名よみ＞,標高値(m),種別,都道府県,緯度,経度';

test('＜＞の分割', () => {
  assert.deepEqual(splitSummit('丹沢山＜蛭ヶ岳＞'), ['丹沢山', '蛭ヶ岳']);
  assert.deepEqual(splitSummit('大山'), ['大山', null]);
});

test('表示名: 頂が 1 つなら山名、複数なら頂名', () => {
  const csv = [
    HEADER,
    '386,361-1,丹沢山＜蛭ヶ岳＞,たんざわさん＜ひるがたけ＞,1673,標高点,神奈川県,35.486279,139.138865',
    '387,361-2,丹沢山,たんざわさん,1567,三角点,神奈川県,35.474293,139.16268',
    '396,368,富士山＜剣ヶ峯＞,ふじさん＜けんがみね＞,3776,測定点,山梨県 静岡県,35.360738,138.727373',
  ].join('\n');
  const { peaks, skipped } = parseGsi1003Csv(csv, 'test');
  assert.equal(skipped.length, 0);
  assert.deepEqual(peaks.map((p) => p.name), ['蛭ヶ岳', '丹沢山', '富士山']);
  assert.equal(peaks[2]!.summitName, '剣ヶ峯');
  assert.equal(peaks[0]!.reading, 'ひるがたけ');
});

test('同名の山は別の id を持つ', () => {
  const csv = [
    HEADER,
    '383,358,大山,おおやま,193,三角点,千葉県,34.964189,139.777722',
    '385,360,大山,おおやま,1252,標高点,神奈川県,35.440835,139.231158',
  ].join('\n');
  const { peaks } = parseGsi1003Csv(csv, 'test');
  assert.notEqual(peaks[0]!.id, peaks[1]!.id);
});

test('壊れた行は数えて捨てる・見出しが違えば止める', () => {
  const { peaks, skipped } = parseGsi1003Csv([HEADER, '1,1,x,x,100,三角点,北海道,abc,145'].join('\n'), 't');
  assert.equal(peaks.length, 0);
  assert.equal(skipped.length, 1);
  assert.throws(() => parseGsi1003Csv('a,b,c', 't'));
});

test('公式 CSV（Shift_JIS）を全件読める', () => {
  const text = new TextDecoder('shift_jis').decode(readFileSync('data/raw/1003zan20260331.csv'));
  const { peaks, skipped } = parseGsi1003Csv(text, '2026-03-31');
  assert.equal(skipped.length, 0);
  assert.ok(peaks.length > 1000);
  const fuji = peaks.find((p) => p.name === '富士山')!;
  assert.equal(fuji.elevationM, 3776);
  assert.equal(new Set(peaks.map((p) => p.id)).size, peaks.length);
});
