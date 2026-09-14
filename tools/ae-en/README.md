# After Effects 用ツール（英語版UI） — Stride11 フェード

## これはなにをするものか

`../ae/`（日本語版UI）と**同じものの、画面が英語のビルド**です。出てくる結果は
日本語版と同一で、違いはインターフェースの言語だけです。

**After Effects の中で Stride11 フェードを組み立てる**ための道具で、連番画像を
大量に吐くのではなく、**静止画1枚＋しきい値1本**で同じ演出を作ります。

Stride11 フェードは、PC-8801mkIISR で当時よく使われた手法のひとつです。画面を
1バイト（横8ドット×1ライン）ずつ塗るとき、**アドレスを11バイト飛びに書いていく**。
開始位置を1つずつずらして11回くり返すと1プレーンが埋まり、青・赤・緑の3プレーンぶん
続けて絵が完成します。斜めの織り目が走り、青一色の像が紫を経て本来の色に着地します。

構成は「開始画像 → 終了画像」ではなく、**元画像（下）に重ね合わせ画像（上）を
重ねる**形です。2枚のサイズも位置も自由で、重ね合わせの透明部分はそのまま元画像が
残ります。

```
tools/ae-en/
├── index.html          ← リビールマップ生成ツール（ブラウザで開く）
├── style.css
├── app.js
├── stride11_fade.jsx   ← AE 組み立てスクリプト
└── README.md
```

> **このビルドは実機未検証です。** 日本語版と同一のロジックで、プロパティを表示名では
> なく matchName と能力で引いているため通る見込みですが、英語版 AE で確認した人は
> まだいません。日本語版 AE をお使いなら `../ae/` を使ってください。

---

## 準備するもの

- **After Effects**（英語版UI）
- **ブラウザ** … リビールマップを書き出すため
- **画像2枚** … 元画像と、その上に重ねる画像。サイズも位置も自由です
- コンポジションのサイズ

リビールマップはリポジトリに入っていません。使うたびに生成ツールで書き出してください。

---

## つかいかた

1. `index.html` を開き、**コンポジションサイズ**を入力
2. パターン（1〜5）と、割り切れないときの余りの扱いを選ぶ
3. ストライド（11）・プレーン順・尺を設定
4. プレビューで確認する
5. "Save both as ZIP" で `revealmap_*.png` と `stride11_fade_params.json` を書き出す
6. 元レイヤーと重ね合わせレイヤーが載ったコンポを開き、その2枚を選択
   （**下に来るほうが元画像**）
7. File > Scripts > Run Script File… → `stride11_fade.jsx`
8. マップ PNG・向き・プレーン順・尺を指定して Build

でき上がった `Stride11 Fade CTRL` の **Fade Progress（0→100）** がフェードの進行です。

細かい手順・パターン表・手で組む場合の構造・式やキーフレームでの駆動方法は、
すべて下の英語セクションに書いてあります（内容は `../ae/README.md` と同じです）。

---

## 技術的な話

考え方は日本語版とまったく同じです。`../ae/README.md` の「技術的な話」を参照してください。
要点だけ挙げると:

- フェード全体を**リビールマップ**（各セルが何番目に塗られるかを明度にした静止画1枚）に畳む
- 3プレーンは順序が同一で時間が 1/3 ずつずれるだけなので、**マップは1枚で足りる**
- 格子は重ね合わせ画像ではなく**コンポジション全体**にアンカーされる
- マスクは **しきい値 + ルミナンス反転トラックマット**。Levels は AE 26 で式も
  キーフレームも受け付けないため使わない
- マップの値域は **1〜254**。下限が 0 でないのは、AE の「しきい値」が輝度 0 の画素を
  決して黒にしないため（0 を含む古いマップでは画面上端に黒い破片が残る）

---
---

# After Effects Tool (English UI) — Stride11 Fade

## What this is

The **English-interface build** of `../ae/`. The two produce identical results and
differ only in interface language.

It builds the **Stride11 fade inside After Effects**, reproducing the effect with
**one still image and one threshold** instead of a long image sequence.

The Stride11 fade is a technique that was common on the PC-8801mkIISR. The screen is
painted one byte at a time, and the writes **step through memory 11 bytes apart**.

| | |
|---|---|
| Unit | **one byte = 8 dots across, 1 line tall** — never a single dot |
| One pass | writes every byte whose VRAM address is a multiple of 11 apart, sweeping top to bottom |
| Passes | start offsets 0,1,…,10 — **11 passes** fill one plane |
| Planes | **0 blue (port 5CH) → 1 red (5DH) → 2 green (5EH)**, strictly sequential |
| Speed | ~43.5 ms per pass, ~480 ms per plane, **~1.44 s total** |

Because `bytesPerLine mod 11` is non-zero, each line down shifts the pattern sideways —
that is where the diagonal weave comes from. The analysis itself is not published (the source material is not ours to
redistribute).

This is not a start-image/end-image transition. It composites an **overlay (upper) onto
a base (lower)**. The two may be different sizes and the overlay may be positioned
anywhere; transparent areas keep the base showing through.

```
tools/ae-en/
├── index.html          <- reveal map generator, open in a browser
├── style.css
├── app.js
├── stride11_fade.jsx   <- After Effects build script
└── README.md
```

> **This build has not been verified against a real English install.** It shares its
> logic with the Japanese build and reaches every property by matchName and capability
> rather than by display name, so it should work — but nobody has run it on English AE yet.

## What you need

- **After Effects** with an English interface
- **A browser**, to export the reveal map
- **Two images**: a base and an overlay. Any sizes, any positions
- Your composition size

Reveal maps are not kept in the repository — export one each time you need it.

## How to use

### 1. Generate the map

1. Open `index.html` and enter your **composition size**
2. Pick a pattern (1–5) and how to handle a remainder
3. Set stride (11), plane order and duration
4. Preview — load a base and an overlay, move and scale the overlay, and confirm the
   weave stays keyed to the screen rather than to the artwork
5. "Save both as ZIP" writes `revealmap_*.png` and `stride11_fade_params.json`

#### The five patterns

| # | Input | Dot grid | Pixels per dot | Byte grid |
|---|---|---|---|---|
| 1 | 640x400 comp | 640x200 | 1x2 (tall dots) | 80x200 = 16,000 |
| 2 | 640x400 comp | 640x400 | 1x1 (square dots) | 80x400 = 32,000 |
| 3 | any | 640x200 | W/640 x H/200 | 80x200 = 16,000 |
| 4 | any | 640x400 | W/640 x H/400 | 80x400 = 32,000 |
| 5 | any | WxH | 1x1 | floor(W/8) x H |

#### Remainders

By default the remainder is **spread one pixel at a time across all dots**. Boundaries
come from `floor(i * total / n)`, so nothing becomes fractional — every dot is either
q or q+1 pixels.

"Absorbed by the right / bottom dots" is also offered, but it can get lopsided:
1920x1080 through pattern 4 gives `1080 / 400 = 2 remainder 280`, so the **bottom row of
dots ends up 282px tall**. Hence the default.

The selector only appears when a remainder actually exists. 16:10 sources (1280x800,
1920x1200, 2560x1600, 3840x2400) divide cleanly either way.

### 2. Build it in After Effects

1. Open the composition holding the base and overlay layers
2. Select both (**the lower one is the base**)
3. File > Scripts > Run Script File… → `stride11_fade.jsx`
4. Point it at the reveal map PNG, pick a direction, plane order and duration, press Build

Animate **Fade Progress (0→100)** on the `Stride11 Fade CTRL` null.

The dialog offers the same four **plane orders** as the generator:

| Choice | Sequence | Set Channels wiring |
|---|---|---|
| blue > red > green | blue > red > green | R←MIX_1 / G←MIX_2 / B←MIX_0 |
| green > red > blue (reversed) | green > red > blue | R←MIX_1 / G←MIX_0 / B←MIX_2 |
| red > green > blue | red > green > blue | R←MIX_0 / G←MIX_1 / B←MIX_2 |
| all three at once | rgb | no Set Channels (the MIX comp is placed directly) |

The wiring is derived from the plane order automatically, so switching order needs no
rework. **The reveal map does not depend on plane order**, so there is no need to
regenerate it either.

### Appearing and disappearing

The **Direction** dropdown offers "Appear (fade in)" and "Disappear (fade out)".
Disappearing is the strict reverse of appearing: the plane that arrived first leaves last.

It works by running the `Fade Progress` keyframes from 100 down to 0. When the rig is
expression driven, everything downstream reverses on its own, so you can flip the
direction afterwards just by swapping the two keyframes on the CTRL null. (Only the
keyframe fallback needs more: the threshold keys have to be mirrored in time as well,
which the script handles.) Keyframes are created for you.

### When something goes wrong

A copyable diagnostic dialog appears afterwards. If it fails, one `Ctrl+Z` undoes
everything (the imported `revealmap` footage stays in the Project panel; delete it by
hand if you do not want it).

Running the script twice in the same comp produces a second `Stride11 Fade CTRL` with
the same name — expressions resolve to the topmost one, so build into a fresh comp
rather than stacking rigs.

If **black fragments remain along the top of the screen after the fade finishes**, your
map is an old one that still contains luminance 0. Export it again (see "How it works").

### The structure, if you build it by hand

```
[master comp]
  Stride11 Fade CTRL (null)  — Slider Control "Fade Progress" 0-100
  Stride11 Fade OUT (solid)  — Set Channels
        red    <- MIX_1 red
        green  <- MIX_2 green
        blue   <- MIX_0 blue
        alpha  <- base layer alpha
  MIX_0 / MIX_1 / MIX_2    video off (present only as Set Channels sources)
  ALPHA SOURCE (base)      video off
  original base / overlay  video off

[MIX_p]  same size as the comp, top to bottom
  MASK_p     revealmap.png + Threshold
  OVERLAY    overlay, luma INVERTED track matte from MASK_p
  BASE       base image
```

MIX_0 = blue plane, MIX_1 = red, MIX_2 = green.

Apply a single **Threshold** (Stylize) to the reveal map layer. Threshold paints
`v >= L` white and `v < L` black. The side we want is `v < L`, so set the overlay's
track matte to **Luma Inverted**. That removes the need for any inversion effect.

| | |
|---|---|
| Effect on MASK_p | one Threshold, Level `L` ramped linearly `0 → U` |
| Track matte on OVERLAY | **Luma Inverted**, using MASK_p |

`U` is the Level range — 255 if its default reads 127, or 1 if it reads 0.5.
On AE 26.2.1 it is **0–1 with a default of 0.5**. The script detects this.

- `L = 0` … everything white → inverted matte is all black → overlay fully hidden
- `L = U` … the map tops out at 254, so no white pixels remain → **fully revealed**

#### Driving it by expression

On the Threshold Level:

```javascript
var tau  = comp("comp name").layer("Stride11 Fade CTRL").effect("Fade Progress")(1) / 100;
var prog = Math.max(0, Math.min(1, 3 * tau - 0));   // <- trailing 0 is the plane index
1 * prog;                                            // <- the range; use 255 * prog if U is 255
```

Note the sub-property is reached by **index `(1)`**, not by name. On a Japanese build the
slider is called 「スライダー」, so `("Slider")` throws at evaluation time — the
assignment succeeds but the expression never runs.

Change `3 * tau - p` with `p` = 0 / 1 / 2 for the blue / red / green masks.

#### Baking it as keyframes

`prog_p` merely runs 0→1 across `[dur*p/3, dur*(p+1)/3]`, so **two linear keyframes** do
the same job. For a 1.44 s fade:

| Plane | Threshold Level |
|---|---|
| 0 blue | `0` at 0.00s → `U` at 0.48s |
| 1 red | `0` at 0.48s → `U` at 0.96s |
| 2 green | `0` at 0.96s → `U` at 1.44s |

Outside those spans the keyframe values hold, so everything is hidden before and fully
revealed after.

### Differences from the PNG-sequence tool

| | `tools/png-sequence` | this tool |
|---|---|---|
| Model | start image → end image | base + overlay |
| Sizes | must match | independent, freely positioned |
| Alpha | not handled | overlay alpha respected |
| Lattice anchored to | the image itself | **the composition** |
| Output | a PNG sequence | one still + parameters |
| Accuracy | exact | 8-bit quantisation, ≤ 0.26 % (under one frame) |

Same size and fully opaque gives the same picture from either tool.

## How it works

### The whole fade folds into one still image

For each cell (byte) at address `a`:

```
residue = a mod stride                     which pass paints it
s       = (residue + a / N) / stride       normalised order within one plane, in [0,1)
v       = 1 + floor(254 * s)               map luminance, 1-254, darker = earlier
```

The mask at time `tau` (0–1) is then just a **threshold**:

```
prog_p = clamp(nPlanes * tau - p, 0, 1)    p = plane index
mask_p = ( v < 255 * prog_p )
```

All three planes paint in **exactly the same order** and are merely delayed by one third
each, so **a single map is enough** — the same image is reused with three different
thresholds. No mask sequences required.

The 8-bit quantisation was measured: **zero order inversions**, and at most a 0.26 %
divergence from exact arithmetic (one level = 125 cells). One level is 1.9 ms, so the
error is finer than a video frame.

### Why the map's range is 1–254

The cap at 254 makes threshold 255 (100 % progress) open everything.

**The floor is 1, not 0, because AE's Threshold never turns a luminance-0 pixel black.**
The mask is `v < L`, so v=0 ought to open as soon as `L ≥ 1` — measured, it does not.
A map containing 0 leaves black fragments along the top of the screen after the fade
completes (v=0 only exists in the topmost few rows). v=1 opens correctly.

### The lattice is anchored to the composition

- The lattice spans the **whole composition**, not the overlay
- So **any size, any placement still reads as a screen-wide effect**
- Reuse the same map on several layers and their weaves line up
- If base and overlay are the same size and fully opaque, the result matches the
  PNG-sequence tool exactly

The overlay's own alpha is **multiplied** with the mask, so where the overlay is
transparent (`mask × 0 = 0`) the base simply stays.

### Why track mattes rather than Set Matte or Gradient Wipe

AE track mattes operate in **composition coordinates** and multiply with the layer's own
alpha. So the map lands correctly no matter where the overlay sits. `Set Matte` and
`Gradient Wipe` work in **layer coordinates**, which would drag the map along whenever
the overlay moves.

### Colour management

The map's luminance *is* the ordering, so if project colour management applies a
non-linear transform to it, the **order stays correct but the pacing becomes uneven**.
If that bothers you, set Project Settings > Color > Working Space to None, or interpret
the `revealmap` footage to match the working space.

### Implementation notes

- Every property is reached by **matchName**, or by capability ("first 1D property that
  can be animated"). Display names are localized, so `"Input Black"` cannot be looked up
  on a Japanese build
- **Levels is not used.** On AE 26 the level properties of `ADBE Easy Levels2` report
  `canSetExpression = false` *and* `canVaryOverTime = false` — they take neither
  expressions nor keyframes. Threshold is used instead
- Transforms are copied through JS accessors like `layer.transform.position`, which are
  language independent
- Expressions address sub-properties **by index**, e.g. `effect("Fade Progress")(1)`
- After setting an expression the script reads `expressionError` to confirm it actually
  evaluates, and falls back to keyframes if not

### What has been verified

In the browser:

- Map luminance order matches the `(residue, address)` ordering of the original algorithm **exactly** — 0 inversions across 32,000 cells
- Divergence from exact event arithmetic peaks at 83 cells (0.26 %, under one 125-cell level); at 0 % and 100 % progress the difference is 0
- Patterns 1–5 across both remainder modes produce sane geometry
- A 640x400 overlay at 140 % anywhere in a 1920x1080 comp keeps the weave at comp scale (3x2px cells)
- Exported PNG re-read: all 2,073,600 pixels round-trip identically
- The map stays within 1–254, so threshold 255 (100 % progress) always opens every channel

The build script itself has only been run on **AE 26.2.1 (Japanese build)**, via the
`../ae/` copy, where it runs to completion and the picture appears. Effects and
properties confirmed there:

```
Threshold      ADBE Threshold2      Level = ADBE Threshold2-0001   range 0-1 (default 0.5)
Set Channels   ADBE Set Channels    Source Layer 1/2/3/4 = -0001/-0003/-0005/-0007
Track matte    setTrackMatte(matte, TrackMatteType.LUMA_INVERTED)
Unusable       ADBE Easy Levels2 level properties (neither expression nor keyframe)
```
