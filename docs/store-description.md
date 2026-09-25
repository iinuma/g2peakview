# ストア掲載文（Even Hub ポータル → Edit description）

## About（日本語と英語の**合計**で 2000 文字以内）

ポータルの About 欄は 1 つで、上限 2000 文字は**日英の合計**（2026-09-25 にポータルで確認）。
Tokyojihatsu と同じく、日本語を本文にして、英語は `---` の後に要点だけを置く。
現在 1706 文字（日本語 945・英語 754）。

```
いま見ている山の名前が、景色から目を離さずに分かります。

G2 Peak View は、現在地から見える山稜の線と山の名前を、G2 に線画で表示します。山稜は国土地理院の標高データから計算したもので、カメラは使いません。

■ 使い方
1. 起動すると、現在地から見える山稜を計算します
2. 知っている山を正面に見ながら、テンプルのスワイプで表示を回し、その山の名前を画面中央に近づけます
3. タップすると中央の山にぴったり合い、表示と景色がそろいます
4. 首を回したら、そのぶんスワイプします

画面の下には、中央の山の名前・標高・距離と、向いている方位が出ます。

■ 左右は手動で合わせます
G2 から左右の向き（方位）を読み取れないため、顔の向きには自動で追従しません。上下は追従でき、メニューで「上下追従」をオンにすると、見上げた分だけ山稜が動きます。

■ メニュー
画角（60°／120°／30°）、上下追従、回転の刻み（5°／1°）、山稜の再計算、データについて、終了

■ 見える・見えない
手前の地形で隠れる山は表示せず、境界付近の山は名前をかっこ書きにします。地形だけによる推定で、樹木・建物・雲・霞は考慮していません。地球の丸みは計算に入れていますが、大気の屈折は補正していません。

■ 対応範囲
日本国内のみ。国土地理院「日本の主な山岳標高」の約1,000山が対象で、約150km先まで計算します。展望台や建物の上では、表示と景色がずれることがあります。

■ 通信と位置情報
位置情報は端末内の計算にだけ使い、開発者には送信しません。標高データは国土地理院のサーバーから取得し（1地点あたり数MB）、そのとき取得範囲からおおよその地域が同サーバーに伝わります。通信できない場所では山稜を計算できません。

出典: 国土地理院「日本の主な山岳標高」、国土地理院 標高タイル（いずれも加工して使用）
登山の道案内や安全の判断には使わないでください。

お問い合わせ: async.sync+g2peakview@gmail.com
プライバシーポリシー: https://iinuma.github.io/g2peakview/privacy-policy

---

Japan only. Mountain names and on-screen text are in Japanese.

G2 Peak View draws the ridgeline and names of the mountains visible from where you stand, as line art on your Even G2. The ridgeline is computed from GSI elevation data, not a camera.

G2 doesn't give apps your compass heading, so you turn the view left and right by swiping the temple, then tap to snap to the mountain at the center. Up and down can follow your head. Hidden peaks are estimated from terrain only.

Your location is used on your phone only. Elevation data is downloaded from GSI, which can infer your approximate area. Not for route finding or safety decisions.

Contact: async.sync+g2peakview@gmail.com
Privacy policy: https://iinuma.github.io/g2peakview/privacy-policy.en
```

## Tags（5 個まで・案）

```
山, 登山, mountain, hiking, peak
```

## Category（案）

ポータルの選択肢から選ぶ。Travel / Outdoor 系が無ければ Utility / Tools 相当。

## 書き方の方針

- **英語には「日本国内のみ・画面は日本語」を冒頭に書く。**
- **左右が手動であることを必ず書く。** 顔の向きへの自動追従や AR の固定表示を宣伝しない
  （Notion ハンドオフ 10 章 P4・18 章）。
- 実機で確かめていない性能（更新の速さ・見やすさ）を約束しない。
- 見える／見えないは地形だけの推定であることを書く。
- 出典（国土地理院）と加工している旨を書く。
