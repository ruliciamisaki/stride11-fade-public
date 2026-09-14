# After Effects 用ツール — Stride11 フェード

## これはなにをするものか

**After Effects の中で Stride11 フェードを組み立てる**ための道具です。連番画像を
大量に吐くのではなく、**静止画1枚＋しきい値1本**で同じ演出を作ります。

Stride11 フェードは、PC-8801mkIISR で当時よく使われた手法のひとつです。画面を
1バイト（横8ドット×1ライン）ずつ塗るとき、**アドレスを11バイト飛びに書いていく**。
開始位置を1つずつずらして11回くり返すと1プレーンが埋まり、青・赤・緑の3プレーンぶん
続けて絵が完成します。斜めの織り目が走り、青一色の像が紫を経て本来の色に着地します。

連番PNG版が「開始画像 → 終了画像」なのに対し、こちらは **元画像（下）に
重ね合わせ画像（上）を重ねる**構成です。2枚のサイズも位置も自由で、重ね合わせの
透明部分はそのまま元画像が残ります。

道具は2つに分かれています。

| | |
|---|---|
| `index.html` | **リビールマップ生成ツール**（ブラウザ） |
| `stride11_fade.jsx` | **AE 組み立てスクリプト** |

```
tools/ae/
├── index.html        ← ブラウザで開く
├── style.css
├── app.js
├── stride11_fade.jsx  ← AE で実行する
└── README.md
```

---

## 準備するもの

- **After Effects** … 26.2.1（日本語版・Windows）で動作確認済み
- **ブラウザ** … リビールマップを書き出すため
- **画像2枚** … 元画像と、その上に重ねる画像。サイズも位置も自由です
- コンポジションのサイズ（マップをその大きさで書き出します）

リビールマップはリポジトリには入っていません。**使うたびに生成ツールで
書き出してください**（生成は数秒です）。

---

## つかいかた

### 1. リビールマップを書き出す

1. `index.html` を開き、**コンポジションサイズ**を入力
2. パターン（1〜5）と、割り切れないときの余りの扱いを選ぶ
3. ストライド（11）・プレーン順・尺を設定
4. プレビューで確認する — 元画像と重ね合わせ画像を読み込み、位置や拡大率を変えても
   織り目が画面基準のままであることを確認できます
5. 「両方まとめて ZIP」で `revealmap_*.png` と `stride11_fade_params.json` を書き出す

### 2. AE で組み立てる

1. 元レイヤーと重ね合わせレイヤーが載ったコンポを開く
2. その2枚を選択する（**下に来るほうが元画像**）
3. ファイル > スクリプト > スクリプトファイルを実行… → `stride11_fade.jsx`
4. リビールマップ PNG を指定し、向き・プレーン順・尺を選んで「組み立てる」

でき上がった `Stride11 Fade CTRL` の **Fade Progress（0→100）** がフェードの進行です。
これをアニメートすれば、速度も止め方も自由に変えられます。

ダイアログの**プレーン順**は生成ツールと同じ4種類です。

| 選択 | 並び | Set Channels の結線 |
|---|---|---|
| 青 → 赤 → 緑 | blue > red > green | R←MIX_1 / G←MIX_2 / B←MIX_0 |
| 緑 → 赤 → 青（逆順） | green > red > blue | R←MIX_1 / G←MIX_0 / B←MIX_2 |
| 赤 → 緑 → 青 | red > green > blue | R←MIX_0 / G←MIX_1 / B←MIX_2 |
| 3プレーン同時 | rgb | Set Channels 不要（MIX を直接配置） |

結線はプレーン順から自動で導出されるので、順番を変えても手直しは要りません。
**リビールマップはプレーン順に依存しない**ので、順番を変えてもマップの作り直しは不要です。

### 出現と消滅

ダイアログの**向き**で「出現（フェードイン）」と「消滅（フェードアウト）」を選べます。
**消滅は出現の厳密な逆再生**で、最初に出たプレーンが最後に消えます。

中身は単純で、`Fade Progress` のキーフレームを 100→0 に振るだけです。組んだあとで
向きを変えたくなったら、CTRL のキーフレーム2つを入れ替えれば済みます。

### うまくいかないとき

処理の途中経過は、実行後にコピーできる診断ダイアログに出ます。失敗した場合は
`Ctrl+Z` 1回で取り消せます（読み込んだ `revealmap` フッテージだけはプロジェクト
パネルに残るので、不要なら手で消してください）。

**フェード完了後も画面上端に黒い破片が残る**場合は、マップが古い可能性があります。
明度 0 を含む古いマップは、AE の「しきい値」の都合でその部分が永久に開きません。
マップを書き出し直してください（下の「技術的な話」を参照）。

### 手で組む場合の構造

```
[元のコンポ]
  Stride11 Fade CTRL (ヌル) ─ スライダー制御 "Fade Progress" 0→100
  Stride11 Fade OUT (平面)  ─ Set Channels
        赤       ← MIX_1 の 赤
        緑       ← MIX_2 の 緑
        青       ← MIX_0 の 青
        アルファ ← 元レイヤーの アルファ
  MIX_0 / MIX_1 / MIX_2      ビデオ OFF（Set Channels の参照先として置くだけ）
  ALPHA SOURCE (元レイヤー)  ビデオ OFF
  元レイヤー / 重ね合わせレイヤー   ビデオ OFF

[MIX_p]  … コンポと同サイズ。上から
  MASK_p       revealmap.png + しきい値
  OVERLAY      重ね合わせ（ルミナンス反転トラックマット = MASK_p）
  BASE         元画像
```

MIX_0 = 青プレーン、MIX_1 = 赤、MIX_2 = 緑。

マスクレイヤー（リビールマップ）に **しきい値**（スタイライズ）を1つかけ、
重ね合わせレイヤーのトラックマットを **ルミナンス反転** にするだけです。

| | |
|---|---|
| MASK_p のエフェクト | しきい値 1 つ。レベル `L` を `0 → U` へリニアに動かす |
| OVERLAY のトラックマット | **ルミナンス反転**（MASK_p を参照） |

`U` はレベルの値域（既定値が 127 なら 255、0.5 なら 1。スクリプトが自動判定します）。

- `L = 0` … すべて白 → 反転マットで全面黒 → 重ね合わせは**全部隠れる**
- `L = U` … マップの最大値が 254 なので白い画素が無くなる → **全部出る**

#### 式で駆動する場合

しきい値のレベルに：

```javascript
var tau  = comp("コンポ名").layer("Stride11 Fade CTRL").effect("Fade Progress")(1) / 100;
var prog = Math.max(0, Math.min(1, 3 * tau - 0));   // ← 末尾の 0 をプレーン番号に
1 * prog;                                            // ← 値域。既定値 0.5 なら 1、127 なら 255
```

`3 * tau - p` の `p` を 0 / 1 / 2 と変えたものが青 / 赤 / 緑のマスクになります。

#### キーフレームで焼き込む場合

`prog_p` は区間 `[尺×p/3, 尺×(p+1)/3]` を 0→1 で通るだけなので、**リニアの
キーフレームを2つ**打てば同じです。尺 1.44 秒なら:

| プレーン | しきい値レベル |
|---|---|
| 0 青 | 0.00s で `0` → 0.48s で `U` |
| 1 赤 | 0.48s で `0` → 0.96s で `U` |
| 2 緑 | 0.96s で `0` → 1.44s で `U` |

区間の外はキーフレームの値が保持されるので、前は全部隠れ、後ろは全部出た状態になります。

### 連番PNG版との違い

| | `tools/png-sequence` | `tools/ae` |
|---|---|---|
| 構成 | 開始画像 → 終了画像 | 元画像 ＋ 重ね合わせ画像 |
| サイズ | 2枚とも同じ必須 | 別々でよい／位置も自由 |
| 透明 | 扱わない | 重ね合わせのアルファを尊重 |
| 格子の基準 | 画像そのもの | **コンポジション** |
| 出力 | 連番PNG | 静止画1枚＋パラメータ |
| 精度 | 完全一致 | 8bit量子化で最大 0.26%（1フレーム未満） |

同サイズ・不透明ならどちらも同じ絵になります。

---

## 技術的な話

### フェード全体は静止画1枚に畳める

各セル（バイト＝横8ドット×1ライン）が **何番目に塗られるか** を 0〜1 に正規化し、
明度としてコンポと同じ大きさの画像に焼いたものが **リビールマップ** です。

```
residue = a mod stride                     ← 第何パスで塗られるか
s       = (residue + a / N) / stride       ← 1プレーン内の正規化順序 ∈ [0,1)
v       = 1 + floor(254 * s)               ← マップの明度（暗いほど早い。1〜254）
```

時刻 τ（0〜1）でのマスクは、ただの **しきい値処理** になります。

```
prog_p = clamp(nPlanes × τ − p, 0, 1)      p = プレーン番号
mask_p = ( v < 255 × prog_p )
```

3プレーンは**塗る順序が完全に同一で、時間が 1/3 ずつ後ろにずれるだけ**なので、
**マップは1枚で足ります**。同じ画像をしきい値だけ変えて3回使うわけです。

8bit量子化の影響は測定済みで、**順序の逆転はゼロ**、正確な計算とのズレは最大 0.26%
（1階調 = 125セル未満）です。1階調が 1.9ms なので、1フレームより細かい誤差です。

### マップの値域を 1〜254 にしてある理由

上限 254 は、しきい値 255（進行 100%）で必ず全開になるようにするためです。

**下限が 0 でなく 1 なのは、AE の「しきい値」が輝度 0 の画素を決して黒にしない**ためです。
マスクは `v < L` なので `L ≥ 1` になれば v=0 も開くはずですが、実測では開きません。
v=0 を含む古いマップを使うと、**フェード完了後も画面上端に黒い破片が残ります**
（v=0 は画面の一番上の数行にしか存在しないため、そこだけに出ます）。v=1 は正常に
開くことを確認済みなので、マップが 0 を出さなければ起きません。

### 格子はコンポジションにアンカーされる

格子は**重ね合わせ画像ではなくコンポジション全体**に張られます。

- 重ね合わせ画像が画面の一部にあっても、そこに出る織り目は画面共通の格子の一部
- だから **どんなサイズ・配置でも画面全体にエフェクトがかかって見える**
- 複数のレイヤーに同じマップを使えば、織り目が互いに揃う
- 元画像と重ね合わせ画像が同サイズ・不透明なら、挙動は連番PNG版と同じ

重ね合わせ画像自身のアルファは、マスクと**掛け算**されます。透明なところは
`mask × 0 = 0` なので、元画像がそのまま残ります。

### なぜルミナンス反転トラックマットなのか

しきい値は `v >= L` を白、`v < L` を黒にします。出したいのは `v < L` の側なので、
トラックマットを**ルミナンス反転**にすれば、反転用のエフェクトが要らなくなります。

AE のトラックマットは**コンポ座標**で効き、レイヤー自身のアルファと掛け算されます。
だから重ね合わせ画像がどこにあっても、マップは画面基準のまま正しく当たります。
`Set Matte` や `Gradient Wipe` のような**レイヤー座標**で効く方式は使っていません
（位置をずらすとマップまでずれてしまうため）。

### 色管理について

マップは明度をそのまま順番として使うので、プロジェクトのカラーマネジメントが
マップに非線形の変換を掛けると、**順番は変わらないものの進み方が不均一**になります。
気になる場合は プロジェクト設定 > カラー > 作業用スペースを「なし」にするか、
`revealmap` フッテージの解釈を作業用スペースに合わせてください。

### スクリプトの実装上の注意

- プロパティはすべて **matchName**、または「アニメートできる1次元プロパティを先頭から探す」
  という**能力ベース**で引いています。表示名は言語版で変わるため、日本語版 AE では
  `"Input Black"` のような英語名では引けません
- 式のプロパティは名前ではなく **インデックス `(1)`** で取ります。日本語版 AE では
  スライダーの表示名が「スライダー」なので `("Slider")` は評価時にエラーになります
- **Levels は使いません**（理由は下の修正履歴 4）
- レイヤーのトランスフォームは `layer.transform.position` のような JS アクセサ経由で
  取得しています（言語版に依存しません）
- 式が使えないプロパティに当たった場合は、その場で**キーフレームに自動で切り替え**ます
- しきい値エフェクトが見つからない場合は、`app.effects` からインストール済みの
  近い名前のエフェクトを一覧してログに出します

> **AE 26.2.1（日本語版・Windows）で動作確認済みです。**
> それ以外のバージョン・言語版は未確認ですが、プロパティを名前ではなく matchName と
> 能力（`canVaryOverTime` など）で引いているので通る見込みです。失敗しても診断ログを
> 出して止まります。上の手動手順と1対1で対応しているので、手で組んでも同じものになります。

### 検証済みの項目

ブラウザ上で確認しました。

- マップの明度順が `(residue, address)` の辞書順と**完全に一致**（逆転 0 件 / 32,000 セル）
- 正確なイベント計算との差は最大 83 セル（0.26%、1階調 125 セル未満）、進行 0% と 100% では差 0
- パターン1〜5 × 余りモード2種でジオメトリが破綻しないこと
- コンポ 1920×1080 に 640×400 の重ね合わせを 140% で任意位置に置いても、織り目がコンポ基準（3×2px セル）のままであること
- 書き出した PNG を読み直して 2,073,600 画素すべてが往復一致すること
- マップの値域が 1〜254 に収まり、しきい値 255（進行 100%）で全チャンネルが必ず全開になること

**After Effects 26.2.1（日本語版）** ではスクリプトが最後まで通り、絵が出ることを確認済み。
使用したエフェクトとプロパティ:

```
しきい値       ADBE Threshold2       レベル = ADBE Threshold2-0001   値域 0-1（既定 0.5）
Set Channels   ADBE Set Channels     ソースレイヤー 1/2/3/4 = -0001/-0003/-0005/-0007
トラックマット setTrackMatte(matte, TrackMatteType.LUMA_INVERTED)
```

### 修正履歴（AE 26.2.1 / 日本語版での実測に基づく）

1. **`ADBE Easy Levels2-0002` を入力黒と誤認** — 実際は**ヒストグラム**で式を持てない
   プロパティだった。日本語版 AE では英語の表示名も引けないためフォールバックが使われ、
   「このプロパティにエクスプレッションを設定することはできません」で停止していた。
   正しい並びは `-0003` 黒入力レベル / `-0004` 白入力レベル / `-0005` ガンマ /
   `-0006` 黒出力レベル / `-0007` 白出力レベル。
   あわせてトランスフォームの引き継ぎも表示名から JS アクセサへ変更。

2. **式のプロパティ名を英語で書いていた** — `effect("Fade Progress")("Slider")` は
   日本語版 AE では評価時に解決できない。インデックス `(1)` に変更し、あわせて
   式を設定したあと `expressionError` を読んで**評価まで通ったか確認**し、
   駄目ならその場でキーフレームに切り替えるようにした。

3. **元レイヤーのトランスフォームを引き継いでいなかった** — 重ね合わせ側だけ写していた。
   元画像を全画面以外で使うと MIX コンポ内で位置がずれるため、BASE と ALPHA SOURCE にも
   同じ引き継ぎを入れた。

4. **Levels そのものが使えないと判明** — matchName を直したうえで実機ログを取ったところ、
   レベル系プロパティはすべて `canSetExpression = false` かつ `canVaryOverTime = false`
   だった（式もキーフレームも不可）。**しきい値 + ルミナンス反転トラックマット**に置き換え、
   動かすプロパティを1つだけにした。あわせて、プロパティを matchName ではなく
   「アニメートできる1次元プロパティ」という能力で選ぶようにし、名前の当て推量をやめた。

   参考: AE 26.2.1 での実測値

   ```
   [1] ADBE Easy Levels2-0001 "チャンネル:"     expr:NG
   [2] ADBE Easy Levels2-0002 "ヒストグラム"     expr:OK
   [3] ADBE Easy Levels2-0003 "黒入力レベル"     expr:NG  value=0
   [4] ADBE Easy Levels2-0004 "白入力レベル"     expr:NG  value=1
   [5] ADBE Easy Levels2-0005 "ガンマ"           expr:NG  value=1
   [6] ADBE Easy Levels2-0006 "黒出力レベル"     expr:NG  value=0
   [7] ADBE Easy Levels2-0007 "白出力レベル"     expr:NG  value=1
   ```

5. **マップの明度 0 が開かない** — フェード完了後も画面上端に黒い破片が残っていた。
   録画を1フレームずつ解析して破片の座標をマップと突き合わせたところ、**明度 0 の
   セルと画素単位で一致**した。マスクは `v < L` なので `L ≥ 1` で開くはずだが開かない。
   マップの値域を **1〜254** に変えて解消した（`v = 1 + floor(254 * s)`）。
   **古いマップは書き出し直しが必要。**

---
---

# After Effects Tool — Stride11 Fade

## What this is

A pair of tools for **building the Stride11 fade inside After Effects**. Instead of
writing out a long image sequence, it reproduces the effect with **one still image and
one threshold**.

The Stride11 fade is a technique that was common on the PC-8801mkIISR. The screen is
painted one byte (8 dots wide, 1 line tall) at a time, and the writes **step through
memory 11 bytes apart**. Repeating that 11 times, each time starting one byte later,
fills one plane; doing the blue, red and green planes in turn completes the picture.
A diagonal weave sweeps the screen while a blue-only ghost turns purple and lands on
its real colours.

Where the PNG-sequence tool goes "start image → end image", this one puts **an overlay
image on top of a base image**. The two can be any size and anywhere on screen, and
transparent parts of the overlay leave the base image untouched.

| | |
|---|---|
| `index.html` | **Reveal map generator** (browser) |
| `stride11_fade.jsx` | **AE build script** |

## What you need

- **After Effects.** Verified on 26.2.1 (Japanese, Windows)
- **A browser**, to export the reveal map
- **Two images**: a base and an overlay. Any sizes, any positions
- Your composition size (the map is exported at that size)

Reveal maps are not kept in the repository — **export one each time you need it**
(it only takes a few seconds).

## How to use

### 1. Export a reveal map

1. Open `index.html` and enter your **composition size**
2. Pick a pattern (1–5) and how leftover pixels should be handled
3. Set the stride (11), the plane order and the duration
4. Check the preview — load your base and overlay images and move or scale them;
   the weave stays anchored to the screen
5. "Save both as ZIP" writes `revealmap_*.png` and `stride11_fade_params.json`

### 2. Build it in After Effects

1. Open the comp containing your base layer and overlay layer
2. Select those two layers (**the lower one is the base**)
3. File > Scripts > Run Script File… → `stride11_fade.jsx`
4. Point it at the reveal map PNG, choose direction, plane order and duration, and build

The resulting `Stride11 Fade CTRL` has **Fade Progress (0→100)**, which drives the whole
fade. Animate it however you like.

The **plane order** in the dialog offers the same four choices as the generator:

| Choice | Order | Set Channels wiring |
|---|---|---|
| blue → red → green | blue > red > green | R←MIX_1 / G←MIX_2 / B←MIX_0 |
| green → red → blue (reversed) | green > red > blue | R←MIX_1 / G←MIX_0 / B←MIX_2 |
| red → green → blue | red > green > blue | R←MIX_0 / G←MIX_1 / B←MIX_2 |
| all three at once | rgb | no Set Channels (the MIX comp is placed directly) |

The wiring is derived from the plane order, so changing it needs no manual fixes, and
**the reveal map does not depend on the plane order** — no need to re-export it.

### Fade in and fade out

The **direction** option chooses between appearing (fade in) and disappearing (fade out).
**Fade out is the exact reverse of fade in**: the plane that arrived first leaves last.

Under the hood it simply runs `Fade Progress` from 100 to 0. If you change your mind
after building, swapping the two keyframes on CTRL is enough.

### When something goes wrong

A diagnostic dialog you can copy from appears after the run. If it fails, one `Ctrl+Z`
undoes everything (only the imported `revealmap` footage stays in the Project panel;
delete it by hand if you don't want it).

If **black fragments remain along the top of the screen after the fade finishes**, your
map is probably an old one. Maps containing luminance 0 never open those cells, because
of how AE's Threshold behaves. Export the map again (see "How it works").

### Building it by hand

```
[your comp]
  Stride11 Fade CTRL (null)  ─ Slider Control "Fade Progress" 0→100
  Stride11 Fade OUT (solid)  ─ Set Channels
        Red    ← MIX_1 Red
        Green  ← MIX_2 Green
        Blue   ← MIX_0 Blue
        Alpha  ← base layer Alpha
  MIX_0 / MIX_1 / MIX_2      video OFF (they exist only as Set Channels sources)
  ALPHA SOURCE (base layer)  video OFF
  base layer / overlay layer video OFF

[MIX_p]  … same size as the comp, top to bottom
  MASK_p       revealmap.png + Threshold
  OVERLAY      overlay (Luma Inverted track matte = MASK_p)
  BASE         base image
```

MIX_0 is the blue plane, MIX_1 red, MIX_2 green.

Apply one **Threshold** (Stylize) to the map layer, and set the overlay's track matte to
**Luma Inverted**. That is the whole rig.

| | |
|---|---|
| Effect on MASK_p | one Threshold; ramp its Level `L` linearly from `0` to `U` |
| Track matte on OVERLAY | **Luma Inverted** (referencing MASK_p) |

`U` is the Level's range (255 if its default is 127, 1 if 0.5; the script detects this).

- `L = 0` … everything white → inverted matte is black everywhere → the overlay is **fully hidden**
- `L = U` … the map tops out at 254, so no white pixels remain → **everything shows**

#### Driving it with an expression

On the Threshold's Level:

```javascript
var tau  = comp("comp name").layer("Stride11 Fade CTRL").effect("Fade Progress")(1) / 100;
var prog = Math.max(0, Math.min(1, 3 * tau - 0));   // ← the trailing 0 is the plane index
1 * prog;                                            // ← the range: 1 if default is 0.5, 255 if 127
```

Setting `p` in `3 * tau - p` to 0 / 1 / 2 gives you the blue / red / green masks.

#### Driving it with keyframes

`prog_p` just runs 0→1 across `[duration×p/3, duration×(p+1)/3]`, so **two linear
keyframes** do the same job. For a 1.44 second fade:

| Plane | Threshold Level |
|---|---|
| 0 blue | `0` at 0.00s → `U` at 0.48s |
| 1 red | `0` at 0.48s → `U` at 0.96s |
| 2 green | `0` at 0.96s → `U` at 1.44s |

Outside those ranges the keyframe values hold, so everything is hidden before and shown after.

### Compared with the PNG-sequence tool

| | `tools/png-sequence` | `tools/ae` |
|---|---|---|
| Structure | start image → end image | base + overlay |
| Sizes | must match | independent; position is free |
| Transparency | not handled | the overlay's alpha is respected |
| Grid anchored to | the image itself | **the composition** |
| Output | PNG sequence | one still + parameters |
| Accuracy | exact | up to 0.26% off from 8-bit quantisation (less than a frame) |

With equal sizes and opaque images, both produce the same picture.

## How it works

### The whole fade folds into one still image

Normalise **when each cell (a byte: 8 dots wide, 1 line tall) gets painted** to 0–1 and
bake that as luminance into an image the size of the comp. That is the **reveal map**.

```
residue = a mod stride                     which pass paints it
s       = (residue + a / N) / stride       normalised order within one plane, in [0,1)
v       = 1 + floor(254 * s)               map luminance (darker = earlier; 1–254)
```

The mask at time τ (0–1) is then just a **threshold**:

```
prog_p = clamp(nPlanes × τ − p, 0, 1)      p = plane index
mask_p = ( v < 255 × prog_p )
```

All three planes paint in exactly the same order and are merely delayed by one third
each, so **one map is enough** — the same image is used three times with different
threshold values.

The effect of 8-bit quantisation has been measured: **zero order inversions**, and at
most 0.26% deviation from the exact calculation (one level is fewer than 125 cells).
One level is 1.9 ms, so the error is finer than a single frame.

### Why the map's range is 1–254

The upper bound of 254 guarantees that threshold 255 (progress 100%) opens everything.

**The lower bound is 1, not 0, because AE's Threshold never turns a luminance-0 pixel
black.** The mask is `v < L`, so v=0 ought to open as soon as `L ≥ 1` — measured, it does
not. Using an old map that contains 0 leaves **black fragments along the top of the screen
after the fade completes** (v=0 only exists in the topmost few rows, which is why they
appear only there). v=1 opens correctly, so keeping 0 out of the map avoids the problem.

### The grid is anchored to the composition

The grid is laid over **the whole composition, not the overlay image**.

- Even if the overlay covers only part of the screen, its weave is part of one screen-wide grid
- So **any size and any placement still looks like the whole screen is affected**
- Use the same map on several layers and their weaves line up
- With equal sizes and opaque images, the behaviour matches the PNG-sequence tool

The overlay's own alpha is **multiplied** with the mask. Where it is transparent,
`mask × 0 = 0`, so the base image stays.

### Why a Luma Inverted track matte

Threshold makes `v >= L` white and `v < L` black. What we want to show is the `v < L`
side, so an inverted luma matte removes the need for any separate invert effect.

AE's track mattes work in **composition coordinates** and multiply with the layer's own
alpha, so wherever the overlay sits, the map still lands correctly in screen space.
Approaches that work in **layer coordinates**, such as `Set Matte` or `Gradient Wipe`,
are deliberately not used (moving the layer would drag the map with it).

### Colour management

The map uses luminance directly as ordering, so if your project's colour management
applies a non-linear transform to it, **the order stays correct but the pacing becomes
uneven**. If that bothers you, set Project Settings > Color > Working Space to None, or
interpret the `revealmap` footage to match the working space.

### Notes on the script

- Every property is looked up by **matchName**, or by capability ("the first animatable
  one-dimensional property"). Display names change with the language of AE, so English
  names like `"Input Black"` cannot be used on a Japanese install
- Expressions address properties by **index `(1)`**, not by name. On Japanese AE the
  slider is called 「スライダー」, so `("Slider")` fails at evaluation time
- **Levels is not used** (see fix 4 below)
- Layer transforms are read through JS accessors such as `layer.transform.position`,
  which are language independent
- If a property turns out to reject expressions, the script **falls back to keyframes** on the spot
- If the Threshold effect cannot be found, it lists similarly named installed effects
  from `app.effects` in the log

> **Verified on AE 26.2.1 (Japanese, Windows).** Other versions and languages are
> unverified but should work, since properties are found by matchName and capability
> rather than by name. On failure it stops and prints a diagnostic log. The manual steps
> above map one-to-one onto what the script builds.

### What has been verified

In the browser:

- The luminance ordering of the map **exactly matches** the lexicographic order of `(residue, address)` (0 inversions in 32,000 cells)
- At most 83 cells differ from the exact event calculation (0.26%, less than the 125 cells in one level); at 0% and 100% progress the difference is zero
- Patterns 1–5 × both remainder modes produce sane geometry
- A 640×400 overlay placed at 140% anywhere in a 1920×1080 comp still shows a comp-anchored weave (3×2px cells)
- Exported PNGs read back with all 2,073,600 pixels identical
- The map stays within 1–254, so threshold 255 (100% progress) always opens every channel

On **After Effects 26.2.1 (Japanese)** the script runs to completion and produces the
picture. Effects and properties used:

```
Threshold      ADBE Threshold2       Level = ADBE Threshold2-0001   range 0-1 (default 0.5)
Set Channels   ADBE Set Channels     Source Layer 1/2/3/4 = -0001/-0003/-0005/-0007
Track matte    setTrackMatte(matte, TrackMatteType.LUMA_INVERTED)
```

### Fix history (based on measurements on AE 26.2.1, Japanese)

1. **`ADBE Easy Levels2-0002` was mistaken for Input Black.** It is actually the
   histogram, which cannot hold an expression. On Japanese AE the English display name
   could not be looked up either, so the fallback path was taken and the script stopped
   with "cannot set an expression on this property". The correct order is `-0003` input
   black / `-0004` input white / `-0005` gamma / `-0006` output black / `-0007` output
   white. Transform copying was moved from display names to JS accessors at the same time.

2. **Expression property names were written in English.**
   `effect("Fade Progress")("Slider")` cannot be resolved on Japanese AE at evaluation
   time. Changed to index `(1)`, and after setting an expression the script now reads
   `expressionError` to **confirm it actually evaluates**, falling back to keyframes if not.

3. **The base layer's transform was not copied.** Only the overlay was. If the base image
   is not full screen, it ended up displaced inside the MIX comps, so BASE and ALPHA
   SOURCE now inherit the transform too.

4. **Levels turned out to be unusable.** With the matchNames corrected, a log from the
   real application showed every Level property with `canSetExpression = false` and
   `canVaryOverTime = false` — neither expressions nor keyframes. Replaced with
   **Threshold + a Luma Inverted track matte**, leaving exactly one property to animate.
   Property lookup was also switched from guessing matchNames to selecting by capability
   ("an animatable one-dimensional property").

   For reference, the log as measured on AE 26.2.1 (display names are Japanese because
   that is the install it was measured on; English equivalents in brackets):

   ```
   [1] ADBE Easy Levels2-0001 "チャンネル:"     expr:NG   [Channel:]
   [2] ADBE Easy Levels2-0002 "ヒストグラム"     expr:OK   [Histogram]
   [3] ADBE Easy Levels2-0003 "黒入力レベル"     expr:NG  value=0   [Input Black]
   [4] ADBE Easy Levels2-0004 "白入力レベル"     expr:NG  value=1   [Input White]
   [5] ADBE Easy Levels2-0005 "ガンマ"           expr:NG  value=1   [Gamma]
   [6] ADBE Easy Levels2-0006 "黒出力レベル"     expr:NG  value=0   [Output Black]
   [7] ADBE Easy Levels2-0007 "白出力レベル"     expr:NG  value=1   [Output White]
   ```

5. **Map luminance 0 never opens.** Black fragments remained along the top of the screen
   after the fade finished. Analysing a screen recording frame by frame and matching the
   fragment coordinates against the map showed they coincide **pixel for pixel with the
   luminance-0 cells**. The mask is `v < L`, so `L ≥ 1` should open them, but it does not.
   Fixed by moving the map's range to **1–254** (`v = 1 + floor(254 * s)`).
   **Old maps must be re-exported.**
