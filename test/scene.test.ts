import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Horizon, PeakSighting } from '../src/core/horizon.js';
import { azimuthToX, buildScene, DEFAULT_LAYOUT, verticalMapping, type ViewState } from '../src/core/scene.js';

function flatHorizon(elevationDeg = 0.5): Horizon {
  const bins = 1800;
  return {
    origin: { lat: 35, lng: 139 },
    observerHeightM: 0,
    azimuthStepDeg: 0.2,
    elevationDeg: new Float32Array(bins).fill(elevationDeg).map((v, i) => v + Math.sin(i / 50)),
    occluderDistanceM: new Float32Array(bins).fill(1000),
    status: new Array(bins).fill('valid'),
    maxRangeM: 1000,
    computeMs: 0,
    samples: 0,
  };
}

const view = (over: Partial<ViewState> = {}): ViewState => ({
  headingDeg: 0,
  pitchDeg: 0,
  hfovDeg: 60,
  pitchFollow: false,
  verticalOffsetPx: 0,
  ...over,
});

type P = { name: string; elevationM: number };
const sighting = (name: string, az: number, elevationM = 1000, elevationDeg = 1, visibility: PeakSighting<P>['visibility'] = 'visible'): PeakSighting<P> => ({
  peak: { name, elevationM },
  azimuthDeg: az,
  distanceM: 10_000,
  elevationDeg,
  blockingDeg: 0,
  visibility,
});

test('投影: 右の山は右に、北をまたいでも連続する', () => {
  assert.equal(azimuthToX(0, view(), 576), 288);
  assert.ok(azimuthToX(10, view(), 576) > 288);
  assert.ok(azimuthToX(350, view(), 576) < 288);
  assert.ok(Math.abs(azimuthToX(359, view({ headingDeg: 1 }), 576) - (288 - 2 * 9.6)) < 1e-9);
});

test('上下追従: 見上げると山稜が下がる（縦横同じ縮尺）', () => {
  const h = flatHorizon();
  const level = verticalMapping(h, view({ pitchFollow: true }), DEFAULT_LAYOUT);
  const up = verticalMapping(h, view({ pitchFollow: true, pitchDeg: 5 }), DEFAULT_LAYOUT);
  assert.equal(level.pxPerDeg, 576 / 60);
  assert.ok(Math.abs(up.toY(1) - level.toY(1) - 5 * (576 / 60)) < 1e-9);
});

test('コンパス表示: 全周の山稜が地形の範囲に収まる', () => {
  const h = flatHorizon();
  const m = verticalMapping(h, view(), DEFAULT_LAYOUT);
  for (const e of h.elevationDeg) {
    const y = m.toY(e);
    assert.ok(y >= DEFAULT_LAYOUT.terrainTop - 0.5 && y <= DEFAULT_LAYOUT.terrainBottom + 0.5, String(y));
  }
});

test('ラベル: 重ならない・視野外は出さない・隠れた山は既定で出さない', () => {
  const sightings = [
    sighting('A', 0, 3000),
    sighting('B', 1, 2000),
    sighting('C', 2, 1500),
    sighting('D', 3, 1200),
    sighting('外', 90, 3776),
    sighting('隠', 5, 2500, 1, 'hidden'),
  ];
  const scene = buildScene({
    horizon: flatHorizon(),
    sightings,
    view: view(),
    labelText: (s) => s.peak.name,
    measure: (t) => t.length * 16 + 20,
  });
  const names = scene.labels.map((l) => l.text);
  assert.ok(!names.includes('外'));
  assert.ok(!names.includes('隠'));
  assert.equal(names[0], 'A'); // 高い山が先
  for (let i = 0; i < scene.labels.length; i += 1) {
    for (let j = i + 1; j < scene.labels.length; j += 1) {
      const a = scene.labels[i]!;
      const b = scene.labels[j]!;
      if (a.y !== b.y) continue;
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x, `${a.text} と ${b.text} が重なる`);
    }
  }
  // 置けなかった山は印として残る
  assert.equal(scene.labels.length + scene.markers.length, 4);
  assert.equal(scene.focus?.text, 'A');
});

test('北をまたぐ視野でも山を拾う', () => {
  const scene = buildScene({
    horizon: flatHorizon(),
    sightings: [sighting('北西', 355), sighting('北東', 5)],
    view: view({ headingDeg: 0 }),
    labelText: (s) => s.peak.name,
    measure: () => 30,
  });
  const byName = Object.fromEntries(scene.labels.map((l) => [l.text, l.anchorX]));
  assert.ok(byName['北西']! < 288 && byName['北東']! > 288);
});

test('上下追従で山頂が帯の上の方にあるときは、山名を山頂の下に置く', () => {
  const scene = buildScene({
    horizon: flatHorizon(),
    sightings: [sighting('高い', 0, 3776, 4.5)],
    view: view({ pitchFollow: true, hfovDeg: 30 }),
    labelText: (s) => s.peak.name,
    measure: () => 40,
  });
  const label = scene.labels[0]!;
  assert.equal(label.below, true);
  assert.ok(label.y > label.anchorY);
  assert.ok(label.y + DEFAULT_LAYOUT.labelHeight <= DEFAULT_LAYOUT.tickBaseline - 14);
});

test('帯の外に出た山頂は描かない', () => {
  const scene = buildScene({
    horizon: flatHorizon(),
    sightings: [sighting('空の上', 0, 3776, 30)],
    view: view({ pitchFollow: true, hfovDeg: 30 }),
    labelText: (s) => s.peak.name,
    measure: () => 40,
  });
  assert.equal(scene.labels.length + scene.markers.length, 0);
});
