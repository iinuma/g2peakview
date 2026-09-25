import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ManualHeading, PitchTracker, pitchFromGravityX } from '../src/core/orientation.js';

test('pitch = asin(x)、見上げると +（Tokyojihatsu の実測に合わせる）', () => {
  assert.equal(pitchFromGravityX(0), 0);
  assert.ok(Math.abs(pitchFromGravityX(0.5) - 30) < 1e-9);
  assert.equal(pitchFromGravityX(1.3), 90); // 振り回したときの 1G 超えで NaN にしない
});

test('小さな揺れでは更新しない', () => {
  const t = new PitchTracker({ alpha: 1, minChangeDeg: 1 });
  assert.equal(t.update(0, 0), true);
  assert.equal(t.update(0.01, 1), false); // 0.57°
  assert.equal(t.update(0.05, 2), true); // 2.9°
  assert.equal(t.ageMs(1002), 1000);
});

test('手動方位は北をまたいで回る', () => {
  const h = new ManualHeading(355, 5);
  h.turn(1);
  assert.equal(h.headingDeg, 0);
  h.turn(-1);
  assert.equal(h.headingDeg, 355);
  h.alignTo(-10);
  assert.equal(h.headingDeg, 350);
  assert.equal(h.calibrated, true);
});
