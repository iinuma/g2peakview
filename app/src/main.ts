/**
 * G2 山名・山稜ビュー（仮称）。
 *
 * 画面（576×288）:
 *   上 576×144  山稜・山名・方位目盛り（画像 288×144 を左右 2 枚）
 *   下 576×138  中央の山の詳細と状態（テキスト）
 *
 * 操作:
 *   スワイプ    向きを回す（既定 5° 刻み）。SDK から頭の方位が取れないので手動。
 *   タップ      中央にいちばん近い山に向きをぴったり合わせる（＝校正）。
 *               その山を実際に正面に見ながら押せば、以後の山稜が景色と揃う。
 *   ダブルタップ 終了確認（審査要件）。診断画面では戻る。
 *   メニュー    画角・上下追従・刻み・診断・画像形式・再計算・終了
 *
 * 上下は IMU（重力）のピッチで追従できる。「上下追従」を ON にすると縦横同じ縮尺
 * になり、見上げると山稜が下がる。
 *
 * 出典: 国土地理院「日本の主な山岳標高」、国土地理院 標高タイル（いずれも加工して使用）
 */

import {
  AppLocationAccuracy,
  CreateStartUpPageContainer,
  EvenAppBridge,
  ImageContainerProperty,
  ImuReportPace,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';

import peakData from '../../src/data/peaks.json' with { type: 'json' };

import { Bitmap } from '../../src/core/bitmap.js';
import { DEFAULT_BANDS, demTileUrl, DEM_ATTRIBUTION, type TileRef } from '../../src/core/dem.js';
import { loadTerrain, type LoadReport } from '../../src/core/demload.js';
import { cardinal8, formatDistance, LocalSphere, type LatLng } from '../../src/core/geodesy.js';
import { computeHorizon, groundHeightM, sightPeaks, type Horizon, type PeakSighting } from '../../src/core/horizon.js';
import { ManualHeading, PitchTracker, pitchFromGravityX } from '../../src/core/orientation.js';
import { PEAK_ATTRIBUTION, type Peak, type PeakDataset } from '../../src/core/peaks.js';
import { renderScene, splitHalves } from '../../src/core/render.js';
import { buildScene, DEFAULT_LAYOUT, type Scene, type ViewState } from '../../src/core/scene.js';
import { FrameSender } from './display.js';
import { isClick, isDoubleClick, isScrollDown, isScrollUp } from './events.js';
import { measureText, rasterizeText } from './text.js';

const dataset = peakData as unknown as PeakDataset;

/* ---------- レイアウト ---------- */

const IMG_L = { id: 1, name: 'ridge-l', x: 0, y: 0, width: 288, height: 144 };
const IMG_R = { id: 2, name: 'ridge-r', x: 288, y: 0, width: 288, height: 144 };
const INFO = { id: 3, name: 'info', x: 0, y: 150, width: 576, height: 138 };
const DIAG = { id: 3, name: 'info', x: 0, y: 0, width: 576, height: 288 };

const MENU = { fov: 1, pitch: 2, step: 3, diag: 4, format: 5, reload: 6, exit: 7, about: 8 } as const;

/**
 * 画角の候補。30° は「等倍」のつもりの仮値。G2 の光学的な視野角は
 * 公開資料で確認できていないので、実機で景色と見比べて決める。
 */
const FOVS = [60, 120, 30] as const;
const STEPS = [5, 1] as const;

/** 開発用の既定地点（高尾山山頂）。実機では位置情報が優先される。 */
const FALLBACK: LatLng = { lat: 35.6251, lng: 139.2436 };
const EYE_HEIGHT_M = 1.6;
/** これ以上動いたら山稜を計算し直す。GPS の揺れで毎回計算しないため。 */
const RECOMPUTE_MOVE_M = 300;

/* ---------- 状態 ---------- */

type Phase = 'locating' | 'loading' | 'computing' | 'ready' | 'error';

let bridge: EvenAppBridge | null = null;
let sender: FrameSender;
type Page = 'main' | 'diag' | 'about';
let page: Page = 'main';
let phase: Phase = 'locating';
let phaseNote = '';

let location: LatLng | null = null;
let locationInfo: { accuracy?: number; altitude?: number; heading?: number; source: string } = { source: '-' };
let computedAt: LatLng | null = null;
let computing = false;

let horizon: Horizon | null = null;
let sightings: PeakSighting<Peak>[] = [];
let loadReport: LoadReport | null = null;
let groundM: number | null = null;
let sightMs = 0;

const heading = new ManualHeading(0, STEPS[0]);
const pitch = new PitchTracker();
let fovIndex = 0;
let stepIndex = 0;
let pitchFollow = false;
/** ブラウザのスライダーで入れる疑似ピッチ（IMU が届かないときだけ使う）。 */
let fakePitch = 0;

let lastScene: Scene<Peak> | null = null;
let lastInfo = '';
let renderMs = 0;

/** IMU の生値と、各軸の振れ幅（診断用。水平に 360° 回って値が変わるかを見る）。 */
let imuRaw: { x: number; y: number; z: number } | null = null;
let imuRange: { min: number[]; max: number[]; n: number } | null = null;
let imuCount = 0;
let imuSince = performance.now();

/* ---------- 計算 ---------- */

async function fetchTile(tile: TileRef): Promise<Uint8Array | null> {
  const response = await fetch(demTileUrl(tile), { mode: 'cors' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function recompute(at: LatLng): Promise<void> {
  if (computing) return;
  computing = true;
  try {
    phase = 'loading';
    phaseNote = '標高タイル取得中';
    await paintInfo();

    const { terrain, report } = await loadTerrain(at, DEFAULT_BANDS, fetchTile, {
      onProgress: (done, total) => {
        phaseNote = `標高タイル ${done}/${total}`;
        if (done % 8 === 0 || done === total) void paintInfo();
      },
    });
    loadReport = report;

    phase = 'computing';
    phaseNote = '山稜を計算中';
    await paintInfo();
    // 計算は同期で 1 秒前後かかる。直前の描画を先に出させる。
    await new Promise((resolve) => setTimeout(resolve, 30));

    groundM = groundHeightM(terrain, at, DEFAULT_BANDS);
    const observerHeightM = (groundM ?? 0) + EYE_HEIGHT_M;
    horizon = computeHorizon({ origin: at, observerHeightM, terrain, bands: DEFAULT_BANDS });

    const t0 = performance.now();
    sightings = sightPeaks(dataset.peaks, { origin: at, observerHeightM, terrain, bands: DEFAULT_BANDS });
    sightMs = performance.now() - t0;
    computedAt = at;

    // 最初の向きは、見えるいちばん高い山。それを正面に探してタップすれば校正できる。
    if (!heading.calibrated) {
      const target = sightings
        .filter((s) => s.visibility === 'visible')
        .sort((a, b) => (b.peak.elevationM ?? 0) - (a.peak.elevationM ?? 0))[0];
      if (target) heading.alignTo(target.azimuthDeg);
      heading.calibrated = false;
    }

    phase = 'ready';
    phaseNote = report.failed > 0 ? `取得失敗タイル ${report.failed}` : '';
  } catch (error) {
    phase = 'error';
    phaseNote = String(error).slice(0, 60);
  } finally {
    computing = false;
    await render();
  }
}

/* ---------- 描画 ---------- */

function currentView(): ViewState {
  // IMU が一度も届いていなければ（ブラウザ）スライダーの値を使う。
  const pitchDeg = pitch.pitchDeg ?? fakePitch;
  return {
    headingDeg: heading.headingDeg,
    pitchDeg,
    hfovDeg: FOVS[fovIndex]!,
    pitchFollow,
    verticalOffsetPx: 0,
  };
}

function labelText(s: PeakSighting<Peak>): string {
  return s.visibility === 'visible' ? s.peak.name : `(${s.peak.name})`;
}

async function render(): Promise<void> {
  if (page !== 'main') {
    await paintInfo();
    return;
  }
  const started = performance.now();
  let band: Bitmap;
  if (horizon) {
    lastScene = buildScene({
      horizon,
      sightings,
      view: currentView(),
      labelText,
      measure: (text) => measureText(text, 16),
    });
    band = renderScene(lastScene, { width: 576, height: 144, tickBaseline: DEFAULT_LAYOUT.tickBaseline }, rasterizeText);
  } else {
    band = new Bitmap(576, 144);
  }
  renderMs = performance.now() - started;

  drawPreview(band);
  sender.submit(splitHalves(band));
  await paintInfo();
}

function infoText(): string {
  if (page === 'diag') return diagText();
  if (page === 'about') return aboutText();
  if (phase !== 'ready' || !horizon) {
    return [
      'G2 Peak View',
      phase === 'error' ? `エラー: ${phaseNote}` : phaseNote || '現在地を確認中…',
      '',
      `${PEAK_ATTRIBUTION}`,
    ].join('\n');
  }

  const view = currentView();
  const focus = lastScene?.focus;
  const head = `${String(Math.round(view.headingDeg)).padStart(3, '0')}° ${cardinal8(view.headingDeg)}${heading.calibrated ? '' : '(未校正)'}`;
  const peakLine = focus
    ? `▶ ${focus.sighting.peak.name} ${focus.sighting.peak.elevationM}m ${formatDistance(focus.sighting.distanceM)}` +
      (focus.sighting.visibility === 'visible' ? '' : ' 見えない可能性')
    : '▶ 視野に山なし';
  const pitchLabel = pitchFollow
    ? `上下追従 ${Math.round(view.pitchDeg)}°${pitch.pitchDeg === null ? '(IMU未着)' : pitch.ageMs(Date.now()) > 3000 ? '(IMU停止)' : ''}`
    : '上下固定';
  return [
    `${head}  ${peakLine}`,
    ...(locationInfo.source === 'fallback' ? ['※現在地なし: 仮に高尾山山頂で表示'] : []),
    `画角${view.hfovDeg}° ${pitchLabel} 刻み${heading.stepDeg}°${phaseNote ? ' ' + phaseNote : ''}`,
    // 4 行に収める。仮地点の注意を出すときは操作説明を省く。
    ...(locationInfo.source === 'fallback' ? [] : ['スワイプ:回転  タップ:中央の山に合わせる']),
    '出典 国土地理院(加工)',
  ].join('\n');
}

/**
 * 「データについて」。国土地理院の出典表示と加工の明示（利用規約上の義務）、
 * 判定の限界、位置情報の扱いをまとめる。文字欄だけでは常時表示しきれない分をここに置く。
 */
function aboutText(): string {
  return [
    'G2 Peak View について',
    '山名: 国土地理院「日本の主な山岳標高」を加工',
    '山稜: 国土地理院 標高タイルを加工',
    '見える/見えないは地形だけからの推定です',
    '位置情報は端末内の計算にだけ使います',
    '登山の道案内や安全の判断に使わないでください',
    'タップで戻る',
  ].join('\n');
}

function diagText(): string {
  const lines: string[] = ['DIAG  tap:振れ幅リセット  2tap:戻る'];
  if (imuRaw) {
    const mag = Math.hypot(imuRaw.x, imuRaw.y, imuRaw.z);
    const rate = (imuCount * 1000) / Math.max(1, performance.now() - imuSince);
    lines.push(
      `imu ${imuRaw.x.toFixed(2)} ${imuRaw.y.toFixed(2)} ${imuRaw.z.toFixed(2)} |v|${mag.toFixed(2)} ` +
        `p${pitchFromGravityX(imuRaw.x).toFixed(1)}° ${rate.toFixed(1)}Hz`,
    );
  } else {
    lines.push('imu: まだ届いていない');
  }
  if (imuRange) {
    const swing = imuRange.max.map((max, i) => (max - imuRange!.min[i]!).toFixed(2));
    lines.push(`振れ幅 x${swing[0]} y${swing[1]} z${swing[2]} (n${imuRange.n})`);
  }
  if (location) {
    lines.push(
      `${location.lat.toFixed(5)},${location.lng.toFixed(5)} ±${locationInfo.accuracy?.toFixed(0) ?? '?'}m ` +
        `alt${locationInfo.altitude?.toFixed(0) ?? '?'} ${locationInfo.source}`,
    );
  }
  if (loadReport) {
    lines.push(
      `tile ${loadReport.requested} 404:${loadReport.notFound} ng:${loadReport.failed} ` +
        `${(loadReport.bytes / 1e6).toFixed(1)}MB ${Math.round(loadReport.ms)}ms`,
    );
  }
  if (horizon) {
    const vis = sightings.filter((s) => s.visibility === 'visible').length;
    lines.push(
      `地表${groundM?.toFixed(0) ?? '?'}m 山稜${Math.round(horizon.computeMs)}ms 山${sightings.length}(見${vis}) ${Math.round(sightMs)}ms`,
    );
  }
  lines.push(
    `送信 ${sender.format} ${sender.stats()}ms ${sender.lastBytes}B ${sender.lastResult} ` +
      `済${sender.sent} 同${sender.skipped} 捨${sender.dropped} 描${Math.round(renderMs)}ms`,
  );
  return lines.join('\n');
}

async function paintInfo(): Promise<void> {
  const content = infoText();
  const dom = document.getElementById('screen');
  if (dom) dom.textContent = content;
  if (!bridge || content === lastInfo) return;
  lastInfo = content;
  try {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: INFO.id, containerName: INFO.name, content }),
    );
  } catch (error) {
    console.warn('textContainerUpgrade failed', error);
  }
}

/** ブラウザ確認用。G2 に送るのと同じビットマップを緑で出す。 */
function drawPreview(band: Bitmap): void {
  const canvas = document.getElementById('preview');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const image = context.createImageData(576, 288);
  for (let y = 0; y < band.height; y += 1) {
    for (let x = 0; x < band.width; x += 1) {
      const level = band.get(x, y);
      const i = ((y + IMG_L.y) * 576 + x) * 4;
      image.data[i] = level * 2;
      image.data[i + 1] = level * 17;
      image.data[i + 2] = level * 6;
      image.data[i + 3] = 255;
    }
  }
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  context.putImageData(image, 0, 0);
  // テキスト欄の範囲を示す枠
  context.strokeStyle = '#131';
  context.strokeRect(INFO.x + 0.5, INFO.y + 0.5, INFO.width - 1, INFO.height - 1);
}

/* ---------- ページ ---------- */

/**
 * 診断画面と画像形式の切り替えは開発用。`npm run app:dev`（QR サイドロード）の
 * ときだけ出し、.ehpk には出さない。画像形式は実機で Gray4 に決めた（2026-09-25:
 * Gray4 と Gray8 で見た目の違いなし＝ニブルの並びが合っている。Gray4 は半分の量）。
 */
function menu(): MenuContainerProperty {
  const items = [
    new MenuItemProperty({ itemID: MENU.fov, itemName: '画角を切り替える' }),
    new MenuItemProperty({ itemID: MENU.pitch, itemName: '上下追従 切替' }),
    new MenuItemProperty({ itemID: MENU.step, itemName: '回転の刻み 5°/1°' }),
    new MenuItemProperty({ itemID: MENU.reload, itemName: '山稜を再計算' }),
    new MenuItemProperty({ itemID: MENU.about, itemName: 'データについて' }),
  ];
  if (import.meta.env.DEV) {
    items.push(
      new MenuItemProperty({ itemID: MENU.diag, itemName: '診断画面' }),
      new MenuItemProperty({ itemID: MENU.format, itemName: '画像形式 Gray4/8' }),
    );
  }
  items.push(new MenuItemProperty({ itemID: MENU.exit, itemName: '終了' }));
  return new MenuContainerProperty({ menuItems: items });
}

function mainContainers() {
  return {
    containerTotalNum: 3,
    textObject: [
      new TextContainerProperty({
        xPosition: INFO.x,
        yPosition: INFO.y,
        width: INFO.width,
        height: INFO.height,
        paddingLength: 4,
        borderWidth: 0,
        containerID: INFO.id,
        containerName: INFO.name,
        content: infoText(),
        isEventCapture: 1,
      }),
    ],
    imageObject: [IMG_L, IMG_R].map(
      (slot) =>
        new ImageContainerProperty({
          xPosition: slot.x,
          yPosition: slot.y,
          width: slot.width,
          height: slot.height,
          containerID: slot.id,
          containerName: slot.name,
        }),
    ),
    menuObject: menu(),
  };
}

/** 全画面の文字だけのページ（診断・データについて）。 */
function textPageContainers(content: string) {
  return {
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        xPosition: DIAG.x,
        yPosition: DIAG.y,
        width: DIAG.width,
        height: DIAG.height,
        paddingLength: 4,
        borderWidth: 0,
        containerID: DIAG.id,
        containerName: DIAG.name,
        content,
        isEventCapture: 1,
      }),
    ],
    menuObject: menu(),
  };
}

async function switchPage(next: Page): Promise<void> {
  page = next;
  lastInfo = '';
  if (bridge) {
    try {
      const containers = next === 'main' ? mainContainers() : textPageContainers(infoText());
      await bridge.rebuildPageContainer(new RebuildPageContainer(containers));
    } catch (error) {
      console.warn('rebuild failed', error);
    }
  }
  sender.invalidate();
  await render();
}

/* ---------- 入力 ---------- */

async function handleMenu(id: number): Promise<void> {
  switch (id) {
    case MENU.fov:
      fovIndex = (fovIndex + 1) % FOVS.length;
      break;
    case MENU.pitch:
      pitchFollow = !pitchFollow;
      break;
    case MENU.step:
      stepIndex = (stepIndex + 1) % STEPS.length;
      heading.stepDeg = STEPS[stepIndex]!;
      break;
    case MENU.diag:
      await switchPage(page === 'diag' ? 'main' : 'diag');
      return;
    case MENU.about:
      await switchPage(page === 'about' ? 'main' : 'about');
      return;
    case MENU.format:
      sender.format = sender.format === 'gray4' ? 'gray8' : 'gray4';
      sender.invalidate();
      break;
    case MENU.reload:
      if (location) {
        computedAt = null;
        await recompute(location);
      }
      return;
    case MENU.exit:
      await bridge?.shutDownPageContainer(1);
      return;
  }
  await render();
}

/**
 * スワイプの向き。SCROLL_BOTTOM で右回り（方位が増える）で、実機で自然な向きと
 * 確認した（2026-09-25）。
 */
const TURN_ON_SCROLL_DOWN: 1 | -1 = 1;

async function onTap(): Promise<void> {
  if (page === 'about') {
    await switchPage('main');
    return;
  }
  if (page === 'diag') {
    imuRange = null;
    imuCount = 0;
    imuSince = performance.now();
    await paintInfo();
    return;
  }
  const focus = lastScene?.focus;
  if (focus) {
    heading.alignTo(focus.sighting.azimuthDeg);
    await render();
  }
}

async function onSwipe(direction: 1 | -1): Promise<void> {
  if (page !== 'main') return;
  heading.turn(direction);
  await render();
}

async function onDoubleTap(): Promise<void> {
  if (page !== 'main') {
    await switchPage('main');
    return;
  }
  // ルート画面のダブルタップは終了確認を出す（出さないと審査で落ちる）。
  await bridge?.shutDownPageContainer(1);
}

function onImu(x: number, y: number, z: number): void {
  imuRaw = { x, y, z };
  imuCount += 1;
  if (!imuRange) imuRange = { min: [x, y, z], max: [x, y, z], n: 0 };
  [x, y, z].forEach((v, i) => {
    imuRange!.min[i] = Math.min(imuRange!.min[i]!, v);
    imuRange!.max[i] = Math.max(imuRange!.max[i]!, v);
  });
  imuRange.n += 1;

  const changed = pitch.update(x, Date.now());
  if (page === 'diag') {
    if (imuCount % 3 === 0) void paintInfo();
    return;
  }
  if (page === 'main' && changed && pitchFollow) void render();
}

async function handleEvent(event: EvenHubEvent): Promise<void> {
  const sys = event.sysEvent;
  if (sys?.eventType === OsEventTypeList.IMU_DATA_REPORT && sys.imuData) {
    onImu(sys.imuData.x ?? 0, sys.imuData.y ?? 0, sys.imuData.z ?? 0);
    return;
  }

  if (import.meta.env.DEV) {
    console.log('[event]', JSON.stringify({ text: event.textEvent?.eventType, sys: sys?.eventType, menu: event.menuItemClickEvent?.itemID }));
  }

  const menuClick = event.menuItemClickEvent;
  if (menuClick?.itemID !== undefined) {
    await handleMenu(menuClick.itemID);
    return;
  }

  // ダブルタップは sysEvent で届く（Tokyojihatsu で実測）。textEvent も念のため見る。
  if (isDoubleClick(sys?.eventType) || isDoubleClick(event.textEvent?.eventType)) {
    await onDoubleTap();
    return;
  }

  // タップ・スワイプは textEvent で来るとは限らない。シミュレータ 0.9.5 では
  // タップが sysEvent（eventType なし＝CLICK を undefined に正規化したもの）で届いた。
  // ダブルタップと同じく、両方の経路を見る。
  const source = event.textEvent ?? sys;
  if (!source) return;
  if (isScrollDown(source.eventType)) await onSwipe(TURN_ON_SCROLL_DOWN);
  else if (isScrollUp(source.eventType)) await onSwipe(-TURN_ON_SCROLL_DOWN as 1 | -1);
  else if (isClick(source.eventType)) await onTap();
}

/** ブラウザのボタン（G2 が無いときの確認用）。 */
function wireBrowserControls(): void {
  document.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      switch (button.dataset.key) {
        case 'up': void onSwipe(-TURN_ON_SCROLL_DOWN as 1 | -1); break;
        case 'down': void onSwipe(TURN_ON_SCROLL_DOWN); break;
        case 'tap': void onTap(); break;
        case 'fov': void handleMenu(MENU.fov); break;
        case 'pitch': void handleMenu(MENU.pitch); break;
        case 'diag': void handleMenu(MENU.diag); break;
      }
    });
  });
  const slider = document.getElementById('pitch');
  if (slider instanceof HTMLInputElement) {
    slider.addEventListener('input', () => {
      fakePitch = Number(slider.value);
      if (pitchFollow) void render();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') void onSwipe(-1);
    if (e.key === 'ArrowRight') void onSwipe(1);
    if (e.key === ' ') void onTap();
  });
}

/* ---------- 起動 ---------- */

function locationFromUrl(): LatLng | null {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null;
}

function onLocation(fix: { latitude: number; longitude: number; accuracy?: number; altitude?: number; heading?: number }): void {
  location = { lat: fix.latitude, lng: fix.longitude };
  locationInfo = { accuracy: fix.accuracy, altitude: fix.altitude, heading: fix.heading, source: 'gps' };
  if (computedAt && !computing) {
    const moved = new LocalSphere(computedAt).inverse(location).distanceM;
    if (moved > RECOMPUTE_MOVE_M) void recompute(location);
  }
}

async function main(): Promise<void> {
  wireBrowserControls();
  bridge = await waitForEvenAppBridge().catch(() => null);
  sender = new FrameSender(bridge, [IMG_L, IMG_R]);

  if (bridge) {
    const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(mainContainers()));
    if (result !== StartUpPageCreateResult.success) {
      phaseNote = `page create: ${StartUpPageCreateResult[result] ?? result}`;
    }
    bridge.onEvenHubEvent((event) => void handleEvent(event));
    bridge.onAppLocationChanged(onLocation);
    try {
      await bridge.imuControl(true, ImuReportPace.P200);
    } catch (error) {
      console.warn('imu failed', error);
    }
  }

  const fromUrl = locationFromUrl();
  if (fromUrl) {
    location = fromUrl;
    locationInfo = { source: 'url' };
  }

  if (bridge && !fromUrl) {
    phaseNote = '現在地を確認中…';
    await paintInfo();
    try {
      const fix = await bridge.getAppLocation({ accuracy: AppLocationAccuracy.High, timeoutMs: 10_000 });
      if (fix) onLocation(fix);
    } catch (error) {
      console.warn('location failed', error);
    }
    try {
      await bridge.startAppLocationUpdates({ accuracy: AppLocationAccuracy.High, intervalMs: 15_000 });
    } catch (error) {
      console.warn('location stream failed', error);
    }
  }

  if (!location) {
    // ブラウザでも SDK のブリッジは解決するので、ホストの有無では分けられない。
    // 位置が取れなければ仮の地点で続け、そのことを常に画面に出す。
    location = FALLBACK;
    locationInfo = { source: 'fallback' };
  }

  await recompute(location);
}

console.info(`${PEAK_ATTRIBUTION} / ${DEM_ATTRIBUTION}`);

void main();
