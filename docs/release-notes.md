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
Shows the ridgeline and mountain names visible from your location on G2 (Japan only).
Swipe the temple to turn left or right, and tap to snap to the mountain at the center. Up and down can follow your head.
```
