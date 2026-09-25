import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cardinal8,
  elevationAngleRad,
  LocalSphere,
  lookAngleWgs84,
  normalizeDeg,
  toDeg,
  wrapDeltaDeg,
} from '../src/core/geodesy.js';

const TAKAO = { lat: 35.6251, lng: 139.2436 };
const FUJI = { lat: 35.360738, lng: 138.727373 };

test('方位: 真北・東・南・西', () => {
  const s = new LocalSphere({ lat: 35, lng: 139 });
  assert.ok(Math.abs(s.inverse({ lat: 35.1, lng: 139 }).azimuthDeg - 0) < 1e-6);
  assert.ok(Math.abs(s.inverse({ lat: 35, lng: 139.1 }).azimuthDeg - 90) < 0.05);
  assert.ok(Math.abs(s.inverse({ lat: 34.9, lng: 139 }).azimuthDeg - 180) < 1e-6);
  assert.ok(Math.abs(s.inverse({ lat: 35, lng: 138.9 }).azimuthDeg - 270) < 0.05);
});

test('方位差は北をまたいでも最短側', () => {
  assert.equal(wrapDeltaDeg(1 - 359), 2);
  assert.equal(wrapDeltaDeg(359 - 1), -2);
  assert.equal(wrapDeltaDeg(180), -180);
  assert.equal(normalizeDeg(-1), 359);
  assert.equal(normalizeDeg(720), 0);
  assert.equal(cardinal8(359), 'N');
  assert.equal(cardinal8(338), 'N');
  assert.equal(cardinal8(337), 'NW');
});

test('高尾山から富士山: 方位・距離が WGS84 と一致する', () => {
  const sphere = new LocalSphere(TAKAO);
  const { distanceM, azimuthDeg } = sphere.inverse(FUJI);
  const ref = lookAngleWgs84(TAKAO, 0, FUJI, 0);
  assert.ok(Math.abs(azimuthDeg - ref.azimuthDeg) < 0.01, `${azimuthDeg} vs ${ref.azimuthDeg}`);
  // 地表距離と直線距離の差は 55km で数 m。0.2% 以内。
  assert.ok(Math.abs(distanceM - ref.rangeM) / ref.rangeM < 0.002);
  assert.ok(azimuthDeg > 235 && azimuthDeg < 241);
  assert.ok(distanceM > 53_000 && distanceM < 57_000);
});

test('斜め方位も 150km 先まで WGS84 と 0.02° 以内（楕円体の南北・東西の比を補正）', () => {
  const sphere = new LocalSphere(TAKAO);
  for (const az of [30, 45, 135, 225, 315]) {
    for (const d of [10_000, 80_000, 150_000]) {
      const target = sphere.destination(az, d);
      const ref = lookAngleWgs84(TAKAO, 0, target, 0);
      assert.ok(Math.abs(wrapDeltaDeg(ref.azimuthDeg - az)) < 0.02, `az${az} d${d}: ${ref.azimuthDeg}`);
    }
  }
});

test('destination は inverse の逆', () => {
  const sphere = new LocalSphere(TAKAO);
  for (const az of [0, 45, 179.9, 270, 359.5]) {
    const p = sphere.destination(az, 120_000);
    const back = sphere.inverse(p);
    assert.ok(Math.abs(back.distanceM - 120_000) < 0.01);
    assert.ok(Math.abs(wrapDeltaDeg(back.azimuthDeg - az)) < 1e-6);
  }
});

test('仰角: 球の式が WGS84 の ECEF→ENU と 150km 先まで 0.02° 以内で一致する', () => {
  const sphere = new LocalSphere(TAKAO);
  for (const [az, d, h] of [[238, 55_000, 3776], [0, 150_000, 2000], [90, 30_000, 0], [300, 5_000, 1500]] as const) {
    const target = sphere.destination(az, d);
    const mine = sphere.elevationAngleDeg(600, d, h);
    const ref = lookAngleWgs84(TAKAO, 600, target, h).elevationDeg;
    assert.ok(Math.abs(mine - ref) < 0.02, `az${az} d${d}: ${mine} vs ${ref}`);
  }
});

test('地球の丸み: 100km 先の同じ高さは約 0.45° 下に見える（平面近似なら 0°）', () => {
  const e = toDeg(elevationAngleRad(6_371_000, 0, 100_000, 0));
  assert.ok(e < -0.4 && e > -0.5, String(e));
});

test('大気差を入れると遠方が持ち上がる（二重補正しない: k=0 と球の式が一致）', () => {
  const s = new LocalSphere(TAKAO);
  const plain = s.elevationAngleDeg(0, 100_000, 0);
  const refr = s.elevationAngleDeg(0, 100_000, 0, 0.13);
  assert.ok(refr > plain);
  assert.equal(s.elevationAngleDeg(0, 100_000, 0, 0), plain);
});
