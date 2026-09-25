# ストア掲載文（Even Hub ポータル → Edit description）

## Description（日本語・2000 文字以内）

```
いま見ている山の名前が、景色から目を離さずに分かります。

G2 Peak View は、現在地から見える山稜のシルエットと山の名前を、G2 の視界に線画で表示します。地図を開いて方角を確かめる代わりに、景色と表示を見比べるだけで「あれは何山か」が分かります。

■ 画面
・上段に、現在地から計算した山稜の線と、その上に山の名前
・下段に、画面中央の山の名前・標高・距離と、いま向いている方位
山稜の線はカメラ映像ではなく、国の標高データから計算したものです。G2 にはカメラがないため、景色を撮影したり画像を送信したりすることはありません。

■ 使い方
1. 起動すると、現在地から見える山稜を計算します（少し時間がかかります）
2. 最初は、見える山のうち最も高い山の方向を向いた状態で始まります
3. 知っている山を正面に見ながら、テンプルのスワイプで表示を回し、その山の名前を画面中央付近に合わせます
4. タップすると、中央に最も近い山にぴったり合います。これで表示と景色がそろいます
5. 別の方向を見たいときは、首を回したぶんだけスワイプします

■ 左右の向きは手動で合わせます
G2 から左右の向き（方位）を読み取れないため、左右はスワイプで合わせる方式です。顔の向きに自動では追従しません。一方、上下は G2 の傾きセンサーで追従でき、メニューで「上下追従」をオンにすると、見上げたり見下ろしたりした分だけ山稜が動きます。

■ メニュー
・画角の切り替え（60°／120°／30°）
・上下追従のオン／オフ
・回転の刻み（5°／1°）
・山稜の再計算
・終了（ダブルタップでも終了できます）

■ 見える・見えないの判定
山頂より手前の地形で隠れる山は表示しません。境界付近の山は名前をかっこ書きで表示します。判定は地形だけによるもので、樹木・建物・雲・霞による見えにくさは考慮していません。地球の丸みは計算に入れていますが、大気による屈折は補正していないため、遠くの山は実際よりわずかに低く表示されることがあります。

■ 対応範囲
日本国内の、国土地理院「日本の主な山岳標高」に掲載された約1,000の山が対象です。約150km先までの山稜を計算します。すべての低山が載っているわけではありません。展望台や建物の上では、地面の高さを基準に計算するため、表示と景色がずれることがあります。

■ 通信と位置情報
現在地の周辺の山稜を計算するため、位置情報を利用します。位置情報は端末の中で計算に使うだけで、開発者に送信されることはありません。標高データは表示のたびに国土地理院のサーバーから取得します（1地点あたり数MB）。このとき、取得する範囲からおおよその地域が国土地理院のサーバーに伝わります。電波の届かない場所では山稜を計算できません。

■ 出典
国土地理院「日本の主な山岳標高」、国土地理院 標高タイルを加工して使用しています。

登山の道案内や安全確認には使わないでください。

お問い合わせ: async.sync+g2peakview@gmail.com
プライバシーポリシー: https://iinuma.github.io/g2peakview/privacy-policy
```

## Description（English, up to 2000 characters）

```
Know which mountain you're looking at, without looking away.

G2 Peak View draws the ridgeline visible from where you stand, with mountain names, as line art on your Even G2. It is computed from national elevation data, not a camera: G2 has no camera, and the app never records the scenery.

How to use
1. On launch, the app computes the ridgeline around you (this may take a moment).
2. Look at a mountain you know and swipe on the temple until its name is near the center.
3. Tap to snap to the mountain nearest the center. The display now lines up with the view.
4. When you turn your head, swipe by the same amount.

Left and right are set by hand
G2 doesn't give apps your compass heading, so the display does not follow your head left and right. Up and down can: turn on vertical tracking in the menu and the ridgeline moves as you look up or down.

Menu: field of view (60/120/30°), vertical tracking, swipe step (5°/1°), recompute, exit.

Visible or hidden
Mountains hidden behind nearer terrain are not shown; borderline ones appear in parentheses. This uses terrain only, not trees, buildings, clouds or haze. Earth's curvature is included, atmospheric refraction is not.

Coverage
About 1,000 mountains in Japan from the GSI list of major mountains, with ridgelines up to about 150 km away. Heights are computed from ground level, so on rooftops or observation decks the display may not line up.

Data and location
Your location is used on your phone only and is never sent to the developer. Elevation data (a few MB per location) is downloaded from GSI, whose servers can infer your approximate area from the tiles requested. A network connection is required.

Sources: Geospatial Information Authority of Japan (GSI), "Elevations of Major Mountains in Japan" and elevation tiles, processed by the developer.

Not for route finding or safety decisions in the mountains.

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

- **左右が手動であることを必ず書く。** 顔の向きへの自動追従や AR の固定表示を宣伝しない
  （Notion ハンドオフ 10 章 P4・18 章）。
- 実機で確かめていない性能（更新の速さ・見やすさ）を約束しない。
- 見える／見えないは地形だけの推定であることを書く。
- 出典（国土地理院）と加工している旨を書く。
