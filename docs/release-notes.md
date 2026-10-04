# リリースノート

Even Hub の審査では `supported_languages` ごとに必要。1〜3 行、コードの変更では
なく利用者にとって何が変わったかを書く。初版はアプリの説明にする。

## 版の記録

Even Hub は Store listing に履歴を持たない。リリースノートも Add build の
瞬間にしか書けず、あとから直せない。**版の履歴を持てるのはここだけ**なので、
アップロードしたかどうかをこの表で管理する（Tokyojihatsu と同じ運用）。

版は「ビルドの単位」ではなく「**アップロードの単位**」。検証用の `.ehpk` は
`npm run app:pack` で版を上げずに何度でも焼ける。提出すると決めたときにだけ
1 つ上げ、`npm run app:release` を通す。

Tokyojihatsu で分かったポータルの挙動:

- **Add build はいつでも通る。**
- **Store listing は Submitted 以降は編集できない。** 説明文もスクリーンショットも、
  審査が終わるまで固まる。新しいビルドを上げてもロックは外れない。
- なので listing は提出の前に正しくなければならない。
  順番は **審査が明ける → listing を直す → 次のビルドを提出する**。

| 版 | ポータル | 内容 |
|---|---|---|
| 0.1.1 | **リリース済み**（2026-10-03 提出、2026-10-04 までに公開） | 0.1.0 の却下理由（IMU を止めない・許可リスト外の URL）の修正。日本国外・現在地なし・通信不可の案内とデモ |
| 0.1.0 | **却下**（2026-10-03。ベータとしては公開） | 初版。IMU を止めない・許可リスト外の URL で却下 |

## tagline（ポータルのプロジェクト設定）

ポータルに入れたもの（2026-09-25）:

```
景色から目を離さず、眼前の山を知る。
```

カテゴリーは Travel。

## 0.1.1

0.1.0 は Even Hub の審査で却下された（2026-10-03）。理由:

> App enables the IMU but never disables it. Please disable the IMU during
> ABNORMAL_EXIT_EVENT and SYSTEM_EXIT_EVENT by calling bridge.imuControl(false).
> Also add any URLs actually used by the app to network.whitelist.

- IMU は「上下追従」と診断画面のときだけ動かし、自分で閉じるとき・ABNORMAL_EXIT_EVENT・
  SYSTEM_EXIT_EVENT・pagehide で imuControl(false) と位置情報の連続取得の停止を呼ぶ。
  終了確認がキャンセルされたら戻す
- 同梱の山頂データに出典ページの URL（web2.gsi.go.jp）が入っていた。通信には使わないので
  同梱物から外し、同梱物の URL を許可リストの cyberjapandata.gsi.go.jp だけにした

あわせて、日本の外で起動すると空の画面に「視野に山なし」とだけ出て壊れて見えたのを直した。

### ja

```
終了時にセンサー（IMU）と位置情報の取得を止めるようにしました。IMU は「上下追従」のときだけ動かします。
日本国外では対応範囲外であることを表示し、タップで高尾山山頂からの眺めをデモとして見られるようにしました。
```

### en

```
The IMU and location updates now stop when the app exits; the IMU runs only for vertical tracking.
Outside Japan, the app says it is not available there and offers a demo view from Mt. Takao (tap).
```

### changelog-combined

ポータルの変更履歴欄（日英合計 500 文字以内）。453 文字。

```
・終了時と、異常終了・システムによる終了のときに、傾きセンサー（IMU）と位置情報の取得を止めるようにしました。センサーは「上下追従」と診断のときだけ動かします
・日本国外では「対応範囲外（日本国内のみ）」と表示し、タップで高尾山山頂からのデモを見られます
・現在地が取れない・通信できないときは理由を表示します

---

- The tilt sensor (IMU) and location updates now stop on exit, including abnormal and system exits. The IMU runs only for vertical tracking.
- Outside Japan, the app says it is not available and offers a demo from Mt. Takao (tap).
- Shows the reason when location or network is unavailable.
```

## 0.1.0（初版）

### ja

```
現在地から見える山稜と山の名前を G2 に表示します（日本国内）。
左右はテンプルのスワイプで回し、タップで中央の山に合わせます。上下は見上げに追従できます。
```

### en

```
Shows the ridgeline and mountain names visible from your location on G2. Japan only; on-screen text is in Japanese.
Swipe the temple to turn left or right, and tap to snap to the mountain at the center. Up and down can follow your head.
```

### changelog-ja

ポータルの Change log 欄（500 文字以内）。345 文字。

```
初版リリース。

・現在地から見える山稜の線と、山の名前を G2 に表示します（日本国内、国土地理院の約1,000山）
・約150km先までの地形を計算し、手前の山に隠れる山は表示しません。地球の丸みも計算に入れています
・左右の向きはテンプルのスワイプで回します。知っている山を正面に見てタップすると、中央の山にぴったり合わせられます
・メニューの「上下追従」をオンにすると、見上げ・見下ろしに合わせて山稜が動きます
・画角（60°／120°／30°）と回転の刻み（5°／1°）を切り替えられます
・画面下に、中央の山の名前・標高・距離と方位を表示します
・「データについて」に出典と位置情報の扱いをまとめました

位置情報は端末内の計算にだけ使います。標高データの取得に通信が必要です。
```

### changelog-en

487 文字。

```
First release. Japan only; on-screen text is in Japanese.

- Shows the ridgeline and names of mountains visible from where you are (about 1,000 peaks, GSI data)
- Computes terrain up to about 150 km, including Earth's curvature; mountains hidden behind nearer ones are not shown
- Swipe the temple to turn left or right; tap to snap to the mountain at the center
- Optional vertical tracking follows your head up and down

Location is used on your phone only. Needs a network connection.
```

### changelog-combined

Change log 欄の 500 文字が**日英の合計**だった場合はこちら（About 欄がそうだったので用意した）。381 文字。
上の changelog-ja / changelog-en は、言語ごとに 500 文字の欄だった場合の版。

```
初版。現在地から見える山稜と山の名前を G2 に表示します（日本国内、約1,000山）。約150km先まで地形を計算し、手前の山に隠れる山は出しません。左右はテンプルのスワイプで回し、タップで中央の山に合わせます。上下は見上げに追従できます。位置情報は端末内の計算にだけ使います。

---

First release. Japan only; on-screen text is in Japanese. Shows the ridgeline and mountain names visible from your location. Swipe the temple to turn left or right, tap to snap to the center mountain. Up and down can follow your head.
```
