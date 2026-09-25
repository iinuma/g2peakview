# 審査用スクリーンショット

シミュレータの automation API（`GET /api/screenshot/glasses`）で撮影（Tokyojihatsu と同じ方法）。

## 撮り方

```bash
npm run app:dev
npx evenhub-simulator "http://localhost:5177/?lat=35.549272&lng=138.809204" --automation-port 9898
curl -X POST -H 'Content-Type: application/json' -d '{"action":"click"}' http://127.0.0.1:9898/api/input
curl -o shot.png http://127.0.0.1:9898/api/screenshot/glasses
```

- **シミュレータは位置情報も IMU も持たない**ので、現在地は `?lat=&lng=` で渡す。
  上下追従の画は撮れない。
- 起動直後は「未校正」と出るので、**タップしてから撮る**（中央の山に合わせる）。
- スワイプは `down`（右回り）/`up`（左回り）、メニューは `context_menu`。
- シミュレータではタップが `sysEvent` で届く。`textEvent` だけを見ていると効かない。

## RGBA のまま保存する

背景も線も純緑で、明るさはアルファに出る。見るときは黒に合成する:

```bash
magick 01-mitsutoge-fuji.png -background black -alpha remove -alpha off view.png
```

## 一覧

| ファイル | 地点 | 画面 |
| --- | --- | --- |
| 01-mitsutoge-fuji.png | 三ツ峠山山頂（35.549272, 138.809204） | 富士山 22km・画角 60° |
| 02-takao-fuji.png | 高尾山山頂（35.6251, 139.2436） | 富士山 55km・画角 60° |
| 03-takao-alps-30deg.png | 高尾山山頂 | 西 268°・南アルプス 91km・画角 30° |

メニュー画面は、開発用の項目（診断画面・画像形式）を整理してから撮る。

## 撮り直しが要るとき

文言・レイアウト・判定（見える／見えない）を変えたら、影響する画面を撮り直す。
