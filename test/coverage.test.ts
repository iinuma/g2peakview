import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessCoverage } from '../src/core/coverage.js';
import type { LoadReport } from '../src/core/demload.js';
import type { Horizon, HorizonStatus } from '../src/core/horizon.js';

const report = (over: Partial<LoadReport> = {}): LoadReport => ({ requested: 60, notFound: 0, failed: 0, bytes: 0, ms: 0, ...over });
const horizon = (status: HorizonStatus): Horizon => ({
  origin: { lat: 0, lng: 0 },
  observerHeightM: 0,
  azimuthStepDeg: 90,
  elevationDeg: new Float32Array(4),
  occluderDistanceM: new Float32Array(4),
  status: [status, status, status, status],
  maxRangeM: 1,
  computeMs: 0,
  samples: 0,
});

test('日本の外: タイルは全部 404、山 0 件 → outside', () => {
  assert.equal(assessCoverage(report({ notFound: 60 }), horizon('missing'), 0), 'outside');
});

test('通信できない: 取得失敗があって山稜が無い → offline（範囲外と決めつけない）', () => {
  assert.equal(assessCoverage(report({ failed: 60 }), horizon('missing'), 0), 'offline');
  assert.equal(assessCoverage(report({ failed: 3, notFound: 57 }), horizon('missing'), 0), 'offline');
});

test('海に面した場所: 一部の方位だけでも山稜があれば ok', () => {
  const h = horizon('missing');
  h.status[1] = 'partial';
  assert.equal(assessCoverage(report({ notFound: 30 }), h, 0), 'ok');
});

test('普通の場所 → ok', () => {
  assert.equal(assessCoverage(report(), horizon('valid'), 200), 'ok');
});
