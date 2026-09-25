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
| 0.1.0 | 未アップロード | 初版 |

## tagline（ポータルのプロジェクト設定・50 文字以内）

```
見ている山の名前が、景色から目を離さずに分かる
```

23 文字。英語が要る場合:

```
Name the mountains you see, without looking away
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
