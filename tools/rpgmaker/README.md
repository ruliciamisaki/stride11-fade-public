# Stride11 フェード — RPGツクール MV / MZ プラグイン

## これはなにをするものか

**画面全体に Stride11 フェードをかける**プラグインです。ツクール本体のフェード
（「画面のフェードアウト」）の代わりに使います。

Stride11 フェードは、PC-8801mkIISR で当時よく使われた手法のひとつです。画面を
1バイト（横8ドット×1ライン）ずつ塗るとき、**アドレスを11バイト飛びに書いていく**。
開始位置を1つずつずらして11回くり返すと1プレーンが埋まり、青・赤・緑の3プレーンぶん
続けて画面が完成します。

見え方は2つの要素でできています。

- **斜めの織り目** … 1ライン下がるごとに横へずれるので、格子が斜めに走る
- **色の段取り** … 青だけの前半 → 赤が乗って紫へ → 緑が入って本来の色に着地

素材画像は要りません。マップは起動時に画面サイズぶん自動生成されます。

```
tools/rpgmaker/
├── Stride11Fade.js   ← これをプロジェクトの js/plugins/ に入れる
└── README.md
```

---

## 準備するもの

- **RPGツクール MV または MZ** … 同じファイルがどちらでも動きます
- **WebGL が使えること** … MV がキャンバスモードにフォールバックした環境では効きません
- `Stride11Fade.js` の1ファイルだけ。素材画像は不要です

---

## つかいかた

### 導入

1. `Stride11Fade.js` を `js/plugins/` にコピー
2. プラグイン管理で有効化
3. パラメータを確認（既定のままでもそのまま動きます）

### MZ — プラグインコマンド

| コマンド | 内容 |
|---|---|
| Stride11 フェードイン | 覆いを晴らして画面を出す |
| Stride11 フェードアウト | 画面を覆っていく |
| 覆いを解除 | フェードアウト後の覆いを即座に消す |
| 設定をリセット | 引数で変えた設定をプラグインパラメータの値へ戻す |

フェードイン／フェードアウトの引数:

| 引数 | 無指定の値 | 内容 |
|---|---|---|
| 色 | 黒 | 黒 / 白 |
| 時間（フレーム） | 0 | 0 なら「既定のフェード時間」パラメータを使う |
| 完了までウェイト | ON | |
| ストライド | 0 | 0 なら現在の設定のまま |
| 1ドットの横ピクセル数 | 0 | 同上 |
| 1ドットの縦ピクセル数 | 0 | 同上 |
| プレーン順 | そのまま | 正順 / 逆順 / 3プレーン同時 |
| リビールマップ画像 | 空欄 | 空欄なら現在の設定のまま |

**無指定の項目は現在の設定を変えません。** 毎回すべてを指定する必要はありません。

**指定した値はその後も効き続けます。** 一度 `ストライド = 13` にしたら、以降の
フェードもすべて 13 で走ります。プラグインパラメータの値へ戻すには「設定をリセット」を
実行してください（セーブされないので、ロード時も自動的にパラメータの値へ戻ります）。

「時間」だけは例外で、そのフェード限りです。次のフェードは既定値に戻ります。

### MV — プラグインコマンド

イベントの「プラグインコマンド」に書きます。

```
Stride11フェードイン 黒 86
Stride11フェードアウト 白 120
Stride11フェード解除
Stride11設定リセット
```

色と時間は省略できます（省略時は黒・既定時間）。`stride11FadeIn` / `stride11FadeOut` /
`stride11FadeClear` / `stride11ResetConfig` という英語名でも動きます。

パラメータの上書きは `key=value` を後ろに足します。順番は自由で、色や時間との混在も
できます。

```
Stride11フェードイン 黒 86 stride=13 縦=2 順=逆順
Stride11フェードアウト 白 120 順=同時
Stride11フェードイン stride=7
```

| キー | 別名 | 対応するパラメータ |
|---|---|---|
| `stride` | `ストライド` | ストライド |
| `dotw` | `dotPixelW` / `横` | 1ドットの横ピクセル数 |
| `doth` | `dotPixelH` / `縦` | 1ドットの縦ピクセル数 |
| `plane` | `planeOrder` / `順` | プレーン順 |
| `map` | `mapImage` / `マップ` | リビールマップ画像 |

プレーン順の値は `正順` / `逆順` / `同時`（`brg` / `grb` / `all` でも可）。

### スクリプトから

```javascript
Stride11Fade.fadeIn(false, 86);   // 黒からフェードイン、86フレーム
Stride11Fade.fadeOut(true, 120);  // 白へフェードアウト
Stride11Fade.clear();
```

第3引数で設定を上書きできます。`config()` はフェードせずに設定だけ変えます。

```javascript
Stride11Fade.fadeIn(false, 86, { stride: 13, planeOrder: '逆順' });
Stride11Fade.config({ dotPixelH: 2 });
Stride11Fade.resetConfig();       // パラメータの値へ戻す
```

### パラメータ

| 項目 | 既定 | 説明 |
|---|---|---|
| ストライド | 11 | 何バイト飛びに塗るか |
| 1ドットの横ピクセル数 | 1 | 通常は 1 |
| 1ドットの縦ピクセル数 | 1 | **縦2倍ドットで絵を描いているゲームは 2** |
| プレーン順 | 青→赤→緑 | VRAM バンクの順（5CH / 5DH / 5EH） |
| 既定のフェード時間 | 86 | フレーム数。60fps なら 86 ≒ 1.44 秒 |
| リビールマップ画像 | 空 | 空なら自動生成。自作マップを使いたいときだけ指定 |

**すべてプラグインコマンドの引数から上書きできます。**「既定のフェード時間」だけは
コマンド側の「時間」引数が同じ役割を果たします。ここの値は上書きの出発点であり、
「設定をリセット」の戻り先でもあります。

#### 縦2倍ドットのゲーム

全ての画像を縦2倍ドットで描いている場合は「1ドットの縦ピクセル数」を **2** に
してください。フェードの粒も縦2倍（8×2 ピクセル）になり、絵の見た目と揃います。

800×600 のゲームなら、

| 設定 | バイト格子 | セル数 |
|---|---|---|
| 縦1（通常） | 100 × 600 | 60,000 |
| 縦2（縦2倍ドット） | 100 × 300 | 30,000 |

### 注意

- **WebGL 必須**です
- ツクール本体のフェード（イベントコマンドの「画面のフェードアウト」）とは**別系統**です。
  混ぜると二重にかかるので、本プラグインのコマンドに統一してください。なお本プラグインは
  実行時に `$gameScreen._brightness` を 255 に戻して、本体側のフェードが残っていても
  二重にならないようにしています
- **覆いの状態はセーブされません。** フェードアウト直後にセーブしてロードすると、
  覆いが消えた状態で始まります
- マップ生成は起動後の最初のシーンで一度だけ走ります。800×600 で 48 万画素ぶんなので、
  環境によっては一瞬の引っかかりが出るかもしれません
- 自作マップ画像を指定する場合は**画面と同じサイズ**にしてください。小さいと画面全体を
  覆えません。暗いほど早く塗られる向きです

### うまく動かないとき

| 症状 | 疑うところ |
|---|---|
| 何も起きない | プラグインが有効か / コマンド名 / WebGL で動いているか |
| コンソールからは動くがイベントからは動かない | MV ランタイムで動いている。「MV から MZ へ変換したプロジェクト」を参照 |
| 画面が真っ黒のまま戻らない | 「覆いを解除」で戻るか確認。戻るならフェードイン側の問題 |
| 織り目が出ずベタで暗転する | フィルタが効いていない（PIXI のバージョン差） |
| 色の段取りが出ない（単色で溶ける） | ブレンドモードが効いていない。プレーン順が「3プレーン同時」になっていないかも確認 |
| 覆いがウィンドウの下に出る | スプライトの追加位置。`Scene_Base.start` で最前面に足しています |

コンソール（F8 / F12）でエラーが出ていたら、その内容をそのまま送ってください。
`Stride11Fade.state` で現在の進行状態、`Stride11Fade.params` でパラメータの解釈結果が
見られます。

---

## 技術的な話

### リビールマップは実行時に生成される

各セル（バイト＝横8ドット×1ライン）が「何番目に塗られるか」を 0〜254 の明度で表した
画像を、起動時に画面サイズぶん自動生成します。

```
residue = a mod stride                     ← 第何パスで塗られるか
s       = (residue + a / N) / stride       ← 1プレーン内の正規化順序 [0,1)
v       = floor(255 * s)                   ← 明度（0-254、暗いほど早い）
```

`a` は「バイトアドレス = ライン番号 × 1ライン当たりバイト数 + バイト位置」です。
`1ライン当たりバイト数 mod 11` がゼロでないので、**1ライン下がるごとに横へずれ**、
あの斜めの織り目になります。

画面サイズがそのまま処理サイズなので、解像度に応じた拡大縮小はありません。
800×600 のゲームなら 800×600 で処理されます。

（このマップは自前のシェーダで比較するので、After Effects 版のように明度 0 を避ける
必要はありません。AE 版だけ値域を 1〜254 にしてあります。）

### 3プレーンの色の段取り

時刻 τ（0〜1）でのプレーン `p` の進行度は

```
prog_p = clamp(3 × τ − p, 0, 1)
```

で、そのプレーンが担当するチャンネルは `v < 255 × prog_p` の画素だけが出ます。
青→赤→緑の順なので、

- 前半 … 青だけ。白くなる領域が**真っ青な幽霊像**として立ち上がる
- 中盤 … 赤が乗って紫〜赤へ転ぶ
- 後半 … 緑が入って本来の色に着地

「3プレーン同時」を選ぶとこの段取りは消え、織り目と掃引だけになります。

### 合成のしかた

シェーダはマップの明度としきい値を比べて、RGB それぞれ 0 か 1 のマスクを出します。
それを画面に重ねるとき、

| 色 | シェーダ出力 | 合成 | 結果 |
|---|---|---|---|
| 黒 | mask | 乗算 | 出す所は ×1 で素通し、隠す所は ×0 で真っ黒 |
| 白 | 1 − mask | スクリーン | 出す所は +0 で素通し、隠す所は +1 で真っ白 |

チャンネルごとに 0/1 が独立して決まるので、アルファ1本では表現できないプレーン別の
段取りが出せます。

### フェードアウト

フェードインの逆再生です（緑 → 赤 → 青 の順に消えていく）。完了後は**覆ったまま保持**
され、場所移動を挟んでも維持されます。次のフェードインか「覆いを解除」で戻ります。

### MV から MZ へ変換したプロジェクト

MV で作ったプロジェクトを MZ で開くと、**データは MZ 形式に変換されるのにランタイムが
MV のまま残る**ことがあります。判別は `index.html` を見るのが確実です。

| | MZ ランタイム | MV ランタイム |
|---|---|---|
| `index.html` が読むもの | `js/main.js` だけ | `js/rpg_core.js` 他6本 |
| `js/libs/pixi.js` | PIXI 5 | PIXI 4 |

MV ランタイムのままだと、MZ のエディタで置いたプラグインコマンド（コマンド357）が
実行時に**黙って読み飛ばされます**。MV のインタプリタに `command357` が無いためです。
ウェイトだけ効いて何も起きない、という形で出ます。

**本プラグインはこの場合に限り橋渡しをします。** `PluginManager.registerCommand` /
`callCommand` と `Game_Interpreter.prototype.command357` を、MZ 本体と同じ内容で
最小限だけ補います。MZ のエディタで置いたコマンドがそのまま動きます。
既に MZ のランタイムで動いている場合は**何も触りません**。

橋渡しが効いているかはコンソールで確認できます。

```javascript
typeof Game_Interpreter.prototype.command357   // "function" なら通っている
PluginManager._commands                        // 登録されたコマンド一覧
```

### 検証済みの項目

```bash
node tools/rpgmaker/test_args.js        # プラグインコマンドの引数（50項目）
node tools/rpgmaker/test_mv_bridge.js   # MV での MZ形式コマンド橋渡し（25項目）
```

Node 上でプラグインの中核ロジック（マップ生成としきい値計算）を取り出して確認しました。

- 800×600 / 816×624 / 1280×720 / 640×480 × 縦ドット1・2 の 8 通りで
  **画面全体が余さず埋まる**（未塗り 0 画素）
- 明度が 0〜254 に収まり、しきい値 1.0 で必ず全開になる
- 塗り順が `(residue, address)` の辞書順と**完全に一致**（逆転 0 件）
- フェードイン開始で 1 画素も出ておらず、完了で 1 画素も残らない
- フェードアウトがフェードインの厳密な逆再生になっている（61 点すべてで一致）
- ES5 の範囲で書かれていること（MV の古い環境でも通る）

橋渡しのテストでは、MV 相当のスタブで橋渡しが入ること、MZ形式のコマンドと引数が
正しく渡ること、未知のコマンドで落ちないこと、そして**MZ 相当のスタブでは本体の実装に
一切触らないこと**を見ています。

#### RPGツクール MZ 実機（2026-08-23 確認済み）

MZ 1.10.0 / PIXI 5 で動作確認しました。

- 起動が通る（`Scene_Boot` でのマップ生成タイミング問題を修正済み）
- **斜めの織り目が出る**
- **青 → 赤 → 緑 の色の段取りが出る**
- 黒へのフェードアウト / 黒からのフェードイン
- 白へのフェードアウト / 白からのフェードイン

#### RPGツクール MV 実機（2026-08-24 確認済み）

MV 1.6.2 / PIXI 4.5.4 で描画を確認しました。コンソールから
`Stride11Fade.fadeIn(false, 86)` を叩いて正常に動作します。

### 関連

- 元になった解析（動画そのものの解析は、素材の権利の都合で公開していません）
- `../png-sequence/` — 連番PNG書き出し版
- `../ae/` — After Effects 版

### ライセンス

MIT License。改変・再配布・商用利用いずれも自由です。

---
---

# Stride11 Fade — RPG Maker MV / MZ plugin

## What this is

A plugin that applies the **Stride11 fade to the whole screen**, in place of RPG Maker's
own fade ("Fadeout Screen").

The Stride11 fade is a technique that was common on the PC-8801mkIISR. The screen is
painted one byte (8 dots wide, 1 line tall) at a time, and the writes **step through
memory 11 bytes apart**. Repeating that 11 times, each time starting one byte later,
fills one plane; doing the blue, red and green planes in turn completes the screen.

Two things make the look:

- **A diagonal weave** — the pattern shifts sideways on every line down
- **A colour progression** — blue only at first, then red turning it purple, then green
  landing on the real colours

No image assets are needed; the map is generated at startup at the screen's size.

```
tools/rpgmaker/
└── Stride11Fade.js   ← drop this into your project's js/plugins/
```

## What you need

- **RPG Maker MV or MZ** — the same file works in both
- **WebGL** — it has no effect if MV falls back to canvas mode
- Just `Stride11Fade.js`. No image assets

## How to use

### Installing

1. Copy `Stride11Fade.js` into `js/plugins/`
2. Enable it in the plugin manager
3. Review the parameters (the defaults work as they are)

### MZ — plugin commands

| Command | What it does |
|---|---|
| Stride11 fade in | clears the cover and reveals the screen |
| Stride11 fade out | covers the screen |
| Clear the cover | removes the cover left by a fade out, immediately |
| Reset settings | returns settings changed via arguments to the plugin parameters |

Arguments for fade in / fade out:

| Argument | If omitted | Meaning |
|---|---|---|
| Colour | black | black / white |
| Duration (frames) | 0 | 0 uses the "default fade duration" parameter |
| Wait for completion | ON | |
| Stride | 0 | 0 keeps the current setting |
| Pixels per dot, horizontal | 0 | same |
| Pixels per dot, vertical | 0 | same |
| Plane order | unchanged | forward / reversed / all three at once |
| Reveal map image | empty | empty keeps the current setting |

**Omitted arguments do not change the current settings**, so you never have to fill in
everything.

**Values you do give persist.** Once you set `stride = 13`, every later fade runs at 13.
Use "reset settings" to go back to the plugin parameters (settings are not saved, so
loading a save also returns them to the parameters).

Duration is the exception: it applies to that one fade only.

### MV — plugin commands

Written in the event's "Plugin Command":

```
Stride11フェードイン 黒 86
Stride11フェードアウト 白 120
Stride11フェード解除
Stride11設定リセット
```

Colour and duration can be omitted (black and the default duration). The English names
`stride11FadeIn` / `stride11FadeOut` / `stride11FadeClear` / `stride11ResetConfig` work too.

Override parameters by appending `key=value` in any order, mixed freely with colour and
duration:

```
stride11FadeIn black 86 stride=13 doth=2 plane=grb
stride11FadeOut white 120 plane=all
stride11FadeIn stride=7
```

| Key | Aliases | Parameter |
|---|---|---|
| `stride` | `ストライド` | stride |
| `dotw` | `dotPixelW` / `横` | pixels per dot, horizontal |
| `doth` | `dotPixelH` / `縦` | pixels per dot, vertical |
| `plane` | `planeOrder` / `順` | plane order |
| `map` | `mapImage` / `マップ` | reveal map image |

Plane order takes `brg` / `grb` / `all` (or `正順` / `逆順` / `同時`).

### From script calls

```javascript
Stride11Fade.fadeIn(false, 86);   // fade in from black, 86 frames
Stride11Fade.fadeOut(true, 120);  // fade out to white
Stride11Fade.clear();
```

A third argument overrides settings. `config()` changes settings without fading.

```javascript
Stride11Fade.fadeIn(false, 86, { stride: 13, planeOrder: 'grb' });
Stride11Fade.config({ dotPixelH: 2 });
Stride11Fade.resetConfig();       // back to the parameters
```

### Parameters

| Item | Default | Notes |
|---|---|---|
| Stride | 11 | how many bytes to skip |
| Pixels per dot, horizontal | 1 | normally 1 |
| Pixels per dot, vertical | 1 | **use 2 if your art is drawn with double-height dots** |
| Plane order | blue→red→green | the VRAM bank order (5CH / 5DH / 5EH) |
| Default fade duration | 86 | frames; at 60fps, 86 ≈ 1.44 s |
| Reveal map image | empty | empty means generate it; set this only to use your own map |

**All of them can be overridden from plugin command arguments.** The values here are the
starting point for overrides and the destination of "reset settings".

#### Games drawn with double-height dots

If all your art is drawn with double-height dots, set "pixels per dot, vertical" to **2**.
The fade's grain becomes 8×2 pixels and matches the artwork.

For an 800×600 game:

| Setting | Byte grid | Cells |
|---|---|---|
| vertical 1 (normal) | 100 × 600 | 60,000 |
| vertical 2 (double-height dots) | 100 × 300 | 30,000 |

### Notes

- **WebGL is required**
- This is **separate** from RPG Maker's own fade. Mixing them applies both, so stick to
  this plugin's commands. The plugin does reset `$gameScreen._brightness` to 255 when it
  runs, so a leftover engine fade will not double up
- **The cover state is not saved.** Save right after a fade out, reload, and you start
  with no cover
- Map generation runs once, in the first scene after boot. At 800×600 that is 480,000
  pixels, so you may see a brief hitch on some machines
- A custom map image must be **the same size as the screen**; anything smaller cannot
  cover it. Darker means painted earlier

### When it does not work

| Symptom | What to check |
|---|---|
| Nothing happens | Is the plugin enabled? The command name? Is WebGL active? |
| Works from the console but not from events | You are on the MV runtime — see "Projects converted from MV to MZ" |
| The screen stays black | Does "clear the cover" restore it? If so, the problem is on the fade-in side |
| It blacks out flat, with no weave | The filter is not applying (a PIXI version difference) |
| No colour progression (it dissolves in one colour) | The blend mode is not applying; also check the plane order is not "all three at once" |
| The cover appears below windows | Sprite insertion point; it is added frontmost in `Scene_Base.start` |

Send any console (F8 / F12) errors as they are. `Stride11Fade.state` shows the current
progress and `Stride11Fade.params` shows how the parameters were interpreted.

## How it works

### The reveal map is generated at runtime

At startup the plugin builds an image the size of the screen, where each cell (a byte:
8 dots wide, 1 line tall) carries **when it gets painted** as a luminance of 0–254.

```
residue = a mod stride                     which pass paints it
s       = (residue + a / N) / stride       normalised order within one plane, [0,1)
v       = floor(255 * s)                   luminance (0-254, darker = earlier)
```

`a` is the byte address: line number × bytes per line + byte position. Since
`bytes per line mod 11` is non-zero, the pattern **shifts sideways on every line down** —
that is the diagonal weave.

The screen size is the processing size; there is no resolution-dependent scaling. An
800×600 game is processed at 800×600.

(This map is compared in our own shader, so unlike the After Effects version there is no
need to avoid luminance 0. Only the AE version uses a 1–254 range.)

### The three-plane colour progression

At time τ (0–1) the progress of plane `p` is

```
prog_p = clamp(3 × τ − p, 0, 1)
```

and only pixels with `v < 255 × prog_p` show in that plane's channel. In blue → red →
green order that gives:

- First third — blue only: everything that will be white rises as a **blue ghost**
- Middle — red arrives and it turns purple, then red
- Last third — green lands it on the real colours

"All three at once" removes this progression, leaving just the weave and the sweep.

### How it composites

The shader compares the map's luminance against the threshold and outputs a 0/1 mask per
RGB channel. Over the screen:

| Colour | Shader output | Blend | Result |
|---|---|---|---|
| Black | mask | Multiply | shown cells ×1 pass through, hidden cells ×0 go black |
| White | 1 − mask | Screen | shown cells +0 pass through, hidden cells +1 go white |

Because each channel's 0/1 is independent, it can express a per-plane progression that a
single alpha channel cannot.

### Fade out

The exact reverse of fade in (green → red → blue). When it finishes the cover **stays**,
surviving map transfers, until the next fade in or "clear the cover".

### Projects converted from MV to MZ

Opening an MV project in MZ can convert **the data to MZ format while leaving the runtime
on MV**. Checking `index.html` is the reliable test:

| | MZ runtime | MV runtime |
|---|---|---|
| What `index.html` loads | only `js/main.js` | `js/rpg_core.js` and 6 others |
| `js/libs/pixi.js` | PIXI 5 | PIXI 4 |

On the MV runtime, plugin commands placed in the MZ editor (command 357) are **silently
skipped**, because MV's interpreter has no `command357`. You see the wait take effect and
nothing else happen.

**In that case only, this plugin bridges the gap.** It supplies a minimal
`PluginManager.registerCommand` / `callCommand` and
`Game_Interpreter.prototype.command357` matching MZ's own behaviour, so commands placed
in the MZ editor just work. On a real MZ runtime it **touches nothing**.

You can check the bridge from the console:

```javascript
typeof Game_Interpreter.prototype.command357   // "function" means it is active
PluginManager._commands                        // the registered commands
```

### What has been verified

```bash
node tools/rpgmaker/test_args.js        # plugin command arguments (50 checks)
node tools/rpgmaker/test_mv_bridge.js   # the MZ-command bridge on MV (25 checks)
```

The core logic (map generation and threshold computation) was extracted and checked under
Node:

- 800×600 / 816×624 / 1280×720 / 640×480 × vertical dot 1 and 2 — eight combinations,
  all **covering the screen completely** (0 unpainted pixels)
- Luminance stays within 0–254, and threshold 1.0 always opens everything
- Paint order matches the lexicographic order of `(residue, address)` **exactly** (0 inversions)
- At the start of a fade in not one pixel shows; at the end not one pixel remains
- Fade out is the strict reverse of fade in (all 61 sample points agree)
- The code stays within ES5 (so MV's older environments accept it)

The bridge tests confirm that it installs on an MV-like stub, that MZ-format commands and
arguments arrive correctly, that unknown commands do not crash, and that **on an MZ-like
stub it never touches the engine's own implementation**.

#### RPG Maker MZ, verified 2026-08-23

On MZ 1.10.0 / PIXI 5:

- It boots (the map-generation timing problem in `Scene_Boot` is fixed)
- **The diagonal weave appears**
- **The blue → red → green progression appears**
- Fade out to black / fade in from black
- Fade out to white / fade in from white

#### RPG Maker MV, verified 2026-08-24

Rendering confirmed on MV 1.6.2 / PIXI 4.5.4, driven from the console with
`Stride11Fade.fadeIn(false, 86)`.

### See also

- The analysis itself is not published (the source material is not ours to redistribute)
- `../png-sequence/` — the PNG sequence exporter
- `../ae/` — the After Effects version

### License

MIT License. Modify, redistribute and use commercially as you like.
