# 連番PNG作成ツール — Stride11 フェード

## これはなにをするものか

**開始画像と終了画像の2枚から、フェードの途中経過を連番PNGで書き出す**ブラウザツールです。

出てくるフェードは、PC-8801mkIISR で当時よく使われた手法のひとつを再現したものです。
画面を1バイト（横8ドット×1ライン）ずつ塗るとき、**アドレスを11バイト飛びに書いていく**。
これを開始位置を1つずつずらして11回くり返すと1プレーンが埋まり、それを青・赤・緑の
3プレーンぶん続けて全体が完成します。斜めの織り目が走りながら、青一色の像が
紫を経て本来の色に着地する、あの見え方になります。

HTML + CSS + JavaScript だけでできていて、外部ライブラリは使っていません。

---

## 準備するもの

- **ブラウザ** … Chrome / Edge 推奨（「フォルダへ直接書き出し」が使えます）。
  Firefox / Safari でも ZIP ダウンロードで使えます
- **画像2枚** … 開始画像と終了画像。同じ大きさにしてください
  - 「黒からのフェードイン」にしたいなら、開始画像を黒一色にします
  - フェードアウトは2枚を入れ替えるだけです
- インストールも通信も不要です。ファイルはブラウザの中だけで扱います

```
tools/png-sequence/
├── index.html   ← これを開く
├── style.css
├── app.js
└── README.md
```

---

## つかいかた

1. `index.html` をブラウザで開く
2. 開始画像と終了画像を置く
3. サイズパターンを選ぶ（下表）
4. フェード設定を必要なら変える
5. 「フォルダへ直接書き出し」か「ZIP でダウンロード」

フレーム0が開始画像、最終フレームが終了画像に一致します。

### サイズパターン

| # | 入力 | ドット格子 | 1ドットの画素数 | バイト格子 |
|---|---|---|---|---|
| 1 | 640×400 固定 | 640×200 | 1×2（縦長ドット） | 80×200 = 16,000 |
| 2 | 640×400 固定 | 640×400 | 1×1（正方形ドット） | 80×400 = 32,000 |
| 3 | 任意 | 640×200 | W/640 × H/200 | 80×200 = 16,000 |
| 4 | 任意 | 640×400 | W/640 × H/400 | 80×400 = 32,000 |
| 5 | 任意 | W×H | 1×1 | floor(W/8)×H |

パターン1 には「偶数ラインを直前の奇数ラインで上書きする」オプションがあります。
素材のライン複製が崩れていても、疑似640×200の見た目を保証できます。

### 割り切れないときの余り

既定は **全ドットへ 1px ずつ均等に分配** です。境界は `floor(i × 全体 / 分割数)` で
求めるので小数を使わず、各ドットは q または q+1 ピクセルになります。

**整数商を使い、余りは右端・下端のドットが吸収** も選べますが、素材によっては
かなり極端になります。1920×1080 をパターン4 にかけると `1080 ÷ 400 = 2 余り 280` で、
**最下段のドットだけ 282px の高さ**になります。そのため既定は均等分配です。

余りが出るときだけこの選択欄が現れます。**割り切れる素材では両者は同じ結果**です。
16:10 の素材（1280×800 / 1920×1200 / 2560×1600 / 3840×2400）はどちらでもきれいに
割り切れます。

### フェード設定

| 項目 | 既定 | 説明 |
|---|---|---|
| ストライド | 11 | 何バイト飛びか。`bytesPerLine` と互いに素でないと縦縞になる（警告が出ます） |
| プレーン順 | 青→赤→緑 | VRAM バンクの順（5CH/5DH/5EH）。「3プレーン同時」を選ぶと11パスで完了 |
| 出力フレーム数 | 43 | 当時の速度で再生するときのfpsを自動表示（既定で約30fps） |
| 1パスの実時間 | 43.5 ms | 実測 43.1〜44.5 ms。再生fpsの目安計算に使います |
| パス単位でしか変化させない | off | onにすると掃引の途中を描かず、パス完了状態だけを出力します |

### 透明で出力する（重ね合わせ用）

書き出し欄の **「透明で出力する」** を入れると、背景を含まない連番を出します。
**背景が動画のとき**と、**背景がまだ決まっていない・後から差し替えるとき**のための
モードです。それ以外は通常モードのほうが確実なので、既定はオフです。

出力は2つのフォルダに分かれます。

| 層 | フォルダ | 中身 | 重ね方 |
|---|---|---|---|
| 1 | `mul/` | `255 − アルファ`（塗ったチャンネルだけ） | **乗算** |
| 2 | `add/` | `終了画像 × アルファ`（同上） | **加算** |

After Effects では両方を連番として読み込み、`add` を上・`mul` を下に置いて、
描画モードをそれぞれ **加算** と **乗算** にします。どちらも不透明な連番なので、
アルファチャンネルの解釈で悩む必要はありません。

透明モードでは開始画像を出力に使いません。**何に重ねるとどう見えるかを確かめる
ための背景**として残してあるので、スロットの名前もそう変わります。実際に重ねる
映像から1フレーム抜いて置いておくと、仕上がりが読めます。

### 書き出し

- **フォルダへ直接書き出し** … 1枚ずつ即座に書くのでメモリを使いません。大きな画像・多いフレーム数ではこちら（Chrome / Edge のみ）
- **ZIP でダウンロード** … 全ブラウザ対応。無圧縮(STORE)の ZIP を作ります（PNGは既に圧縮済みで、再圧縮しても縮まないため）。非ASCIIのファイル名にも UTF-8 フラグを立てています

ファイル名は `接頭辞 + 連番 + .png`（既定 `fade_0000.png`）。使えない文字
（`\ / : * ? " < > |` と制御文字）は自動で `_` に置換します。透明モードでは
`mul/` と `add/` に分けて出します（ZIP の中でも同じ）。

After Effects へは「連番として読み込む」で取り込めます。フレームレートは読み込み側で
自由に変えられるので、このツールは**変化過程ぶんの枚数だけ**を出力します。

### 動画では出しません

mp4 / avi 出力はあえて入れていません。この演出は 1 ドット単位のディザが命で、
H.264 などの非可逆圧縮（特に色差サブサンプリング）を通すと市松模様が確実に潰れます。
可逆で運ぶには連番PNGが最も確実です。

どうしても動画が必要なら、書き出した連番PNGを可逆コーデックでまとめてください。

```bash
ffmpeg -framerate 30 -i fade_%04d.png -c:v ffv1 fade.avi
```

```bash
ffmpeg -framerate 30 -i fade_%04d.png -c:v libx264 -qp 0 -pix_fmt rgb24 fade.mp4
```

---

## 技術的な話

### 2枚の画像への一般化

画面が黒から始まる場合は XOR が単なるコピーに見えますが、本質は次の式です。

```
VRAM[a] ^= (開始画像[a] ^ 終了画像[a])
```

つまり **各バイトの各プレーンが、予定時刻に開始画像の値から終了画像の値へ切り替わる**。
このツールはこれをそのまま実装しています。だから2枚の任意の画像の間で使えます。

フルカラー画像は R / G / B の各チャンネルをそれぞれ1プレーンとして扱います。
デジタル8色の画像を入れれば当時の見え方と完全に一致し、それ以外の画像でも同じ
ロジックがそのまま通ります（色数の量子化はしません）。

### 塗る順序

セル（バイト）のアドレス `a` に対して、

```
residue = a mod stride                  ← 第何パスで塗られるか
s       = (residue + a / N) / stride    ← 1プレーン内の正規化順序 ∈ [0,1)
```

1ライン80バイトで `80 mod 11 = 3` なので、**同じパスで塗られるバイトは1ライン
下がるごとに3バイト＝24ドット右へずれます**。これが斜めの織り目の正体です。

### なぜ透明出力が2枚に分かれるのか

**チャンネルごとの透明度は、1枚のRGBA画像では表現できません。** アルファは1本しか
ないので、「赤と緑は背景が透けて、青だけ絵が出ている」という状態を1枚に焼けません。
この演出はまさにその状態を作るので、2枚に分けるほかありません。

下から **乗算 → 加算** の順に重ねると、

```
背景 × (1 − a·m) + 絵 × a·m
```

になります。`m` がセルごと・プレーンごとの 0/1 マスク、`a` が終了画像のアルファです。
塗っていないセルは `mul = 255`（背景をそのまま通す）・`add = 0`（何も足さない）なので
**完全に透明**、塗り終わると通常のアルファ合成と厳密に一致します。

### 検証

ブラウザ上で以下を確認済みです。

- 独立実装で計算した期待値と全ピクセル一致（イベント数 0 / 4,365 / 16,000 / 24,000 / 48,000、および巻き戻し後）
- フレーム0 = 開始画像、最終フレーム = 終了画像に完全一致
- 青プレーン11パス完了時点で、青チャンネルのみ切り替わり赤緑は未変化
- パターン3/4/5 × 余りモード2種 × サイズ 1920×1080 / 1000×613 / 1280×800 の全組み合わせで、余り領域を含めて取りこぼしゼロ
- 生成した ZIP を Python の `zipfile.testzip()` で検証（全エントリCRC一致、UTF-8フラグ）
- 640×400 / 43フレームの書き出しが約 0.3 秒

透明モードは、アルファを持つ素材（完全透明・半透明・不透明を含む）で次を確認しています。

- プレビューと、書き出す2枚から計算した合成結果が**全画素で完全一致**
- フレーム0 で `mul` が全面 255・`add` の RGB が全面 0 → 背景がそのまま見える
- 最終フレームで `mul = 255 − アルファ`、`add = 終了画像 × アルファ`
- **不透明な素材なら、透明モードの合成結果が通常モードと全画素一致**（2パスに分けても結果が変わらない）
- 透明モードでも色の段取りが出ている（青だけの時期 → 赤が来る → 緑が入る）
- 書き出した PNG を読み戻して、元のバッファとバイト単位で一致
- ZIP の中身が `mul/fade_0000.png` `add/fade_0000.png` … の形で並ぶ
- オフのときは2枚ぶんのバッファを確保しない

演出そのものの解析は、素材の権利の都合で公開していません。

---
---

# Sequential PNG Exporter — Stride11 Fade

## What this is

A browser tool that takes **two images — a start image and an end image — and writes
out the frames of the fade between them as a numbered PNG sequence**.

The fade it produces reproduces a technique that was common on the PC-8801mkIISR.
The screen is painted one byte (8 dots wide, 1 line tall) at a time, and the writes
**step through memory 11 bytes apart**. Repeating that 11 times, each time starting
one byte later, fills one plane; doing it for the blue, red and green planes in turn
completes the picture. The result is a diagonal weave sweeping across the screen while
a blue-only ghost of the image turns purple and finally lands on its real colours.

Plain HTML, CSS and JavaScript. No external libraries.

## What you need

- **A browser.** Chrome or Edge recommended (they can write straight to a folder).
  Firefox and Safari work too, via ZIP download
- **Two images** of the same size, the start and the end of the fade
  - For a fade in from black, make the start image solid black
  - For a fade out, just swap the two
- Nothing to install, no network access. Files never leave your browser

## How to use

1. Open `index.html` in your browser
2. Drop in the start image and the end image
3. Pick a size pattern (table below)
4. Adjust the fade settings if you want to
5. Choose "write to a folder" or "download as ZIP"

Frame 0 equals the start image, and the last frame equals the end image.

### Size patterns

| # | Input | Dot grid | Pixels per dot | Byte grid |
|---|---|---|---|---|
| 1 | fixed 640×400 | 640×200 | 1×2 (tall dots) | 80×200 = 16,000 |
| 2 | fixed 640×400 | 640×400 | 1×1 (square dots) | 80×400 = 32,000 |
| 3 | any | 640×200 | W/640 × H/200 | 80×200 = 16,000 |
| 4 | any | 640×400 | W/640 × H/400 | 80×400 = 32,000 |
| 5 | any | W×H | 1×1 | floor(W/8)×H |

Pattern 1 has an option to overwrite each even line with the odd line above it, which
guarantees the pseudo-640×200 look even if your source has lost that line doubling.

### Leftover pixels

The default is to **spread the remainder one pixel at a time across all dots**.
Boundaries come from `floor(i × total / count)`, so no fractions are involved and every
dot ends up either q or q+1 pixels.

You can also **use the integer quotient and let the right and bottom edge absorb the
remainder**, but that gets extreme with some sizes: 1920×1080 under pattern 4 gives
`1080 ÷ 400 = 2 remainder 280`, so **the bottom row of dots alone would be 282px tall**.
Hence the default.

That choice only appears when there is a remainder. **When the size divides evenly the two
modes give identical output.** 16:10 sources (1280×800 / 1920×1200 / 2560×1600 /
3840×2400) divide evenly either way.

### Fade settings

| Item | Default | Notes |
|---|---|---|
| Stride | 11 | How many bytes to skip. Must be coprime with `bytesPerLine` or you get vertical stripes (the tool warns you) |
| Plane order | blue → red → green | The VRAM bank order (5CH/5DH/5EH). "All three at once" finishes in 11 passes |
| Frame count | 43 | The tool shows the fps needed to play back at the original speed (about 30fps by default) |
| Milliseconds per pass | 43.5 | Measured 43.1–44.5 ms; used for that fps estimate |
| Only change on pass boundaries | off | When on, only completed passes are drawn, never a partial sweep |

### Transparent output (for compositing)

Tick **"transparent output"** to get a sequence with no background in it. This is for
when **the background is video**, or when **the background is not decided yet**. Normal
mode is more predictable otherwise, so this is off by default.

The output splits into two folders:

| Layer | Folder | Contents | Blend |
|---|---|---|---|
| 1 | `mul/` | `255 − alpha` (only for channels already painted) | **Multiply** |
| 2 | `add/` | `end image × alpha` (same) | **Add** |

In After Effects, import both as sequences, put `add` above `mul`, and set their blending
modes to Add and Multiply. Both sequences are opaque, so you never have to think about
alpha interpretation.

In transparent mode the start image is not used in the output. It stays as **a backdrop
for previewing what the result will look like over your footage**, and the slot is
renamed accordingly. Drop in a frame grabbed from that footage and you can judge the result.

### Export

- **Write to a folder** — writes one file at a time, so memory stays flat. Use this for large images or long sequences (Chrome / Edge only)
- **Download as ZIP** — works everywhere. The ZIP is stored uncompressed (PNG is already compressed, so re-compressing gains nothing). Non-ASCII names get the UTF-8 flag

File names are `prefix + number + .png` (`fade_0000.png` by default). Characters that
are not allowed in file names (`\ / : * ? " < > |` and control characters) become `_`.
Transparent mode splits the output into `mul/` and `add/` (inside the ZIP as well).

Import into After Effects as an image sequence. The frame rate is yours to choose on
import, so this tool only writes **the frames where something changes**.

### No video output

mp4 / avi export is deliberately absent. This effect lives on single-dot dithering, and
lossy compression — chroma subsampling in particular — reliably destroys the checkerboard.
A PNG sequence is the safe way to carry it.

If you need a movie, wrap the PNGs with a lossless codec:

```bash
ffmpeg -framerate 30 -i fade_%04d.png -c:v ffv1 fade.avi
```

```bash
ffmpeg -framerate 30 -i fade_%04d.png -c:v libx264 -qp 0 -pix_fmt rgb24 fade.mp4
```

## How it works

### Generalising to two arbitrary images

When the screen starts out black, an XOR looks the same as a plain copy, but what is
really going on is:

```
VRAM[a] ^= (start[a] ^ end[a])
```

Each plane of each byte **switches from the start value to the end value at its scheduled
time**. That is exactly what this tool implements, which is why it works between any two
images.

Full-colour images are handled by treating the R, G and B channels as the three planes.
Feed it a digital 8-colour image and you get the original behaviour exactly; feed it
anything else and the same logic still applies (no colour quantisation is done).

### Paint order

For a cell (byte) at address `a`:

```
residue = a mod stride                  which pass paints it
s       = (residue + a / N) / stride    normalised order within one plane, in [0,1)
```

With 80 bytes per line, `80 mod 11 = 3`, so **bytes painted in the same pass shift 3 bytes
(24 dots) to the right on every line down**. That is where the diagonal weave comes from.

### Why transparent output needs two layers

**Per-channel transparency cannot be stored in a single RGBA image.** There is only one
alpha channel, so "red and green show the background while blue shows the picture" cannot
be baked into one file — and that state is precisely what this effect produces.

Stacking **multiply then add** from the bottom gives:

```
background × (1 − a·m) + picture × a·m
```

where `m` is the per-cell, per-plane 0/1 mask and `a` is the end image's alpha. Unpainted
cells have `mul = 255` (background passes through) and `add = 0` (nothing added), so they
are **fully transparent**; once painted, the result matches ordinary alpha compositing exactly.

### Verification

Checked in the browser:

- Every pixel matches an independent implementation (at event counts 0 / 4,365 / 16,000 / 24,000 / 48,000, and after rewinding)
- Frame 0 is exactly the start image; the last frame is exactly the end image
- After the 11 blue passes, only the blue channel has changed
- Patterns 3/4/5 × both remainder modes × sizes 1920×1080 / 1000×613 / 1280×800: full coverage including the remainder areas
- Generated ZIPs verified with Python's `zipfile.testzip()` (CRC of every entry, UTF-8 flag)
- 640×400 / 43 frames exports in about 0.3 seconds

For transparent mode, with sources containing fully transparent, semi-transparent and
opaque pixels:

- The preview and the composite computed from the two exported layers match **on every pixel**
- At frame 0, `mul` is 255 everywhere and `add` is 0, so the background shows unchanged
- At the last frame, `mul = 255 − alpha` and `add = end image × alpha`
- **For an opaque source, transparent mode composites to exactly the same pixels as normal mode**
- The colour progression still shows (blue only → red arrives → green lands)
- Exported PNGs read back byte-identical to the buffers they came from
- ZIP entries are laid out as `mul/fade_0000.png`, `add/fade_0000.png`, …
- With the option off, the second set of buffers is never allocated

The analysis itself is not published, since the source material is not ours to redistribute.
