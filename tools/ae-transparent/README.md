# After Effects 用ツール（透明合成版） — Stride11 フェード

## これはなにをするものか

**元画像を指定せず、下にあるもの全部に対して効く** Stride11 フェードを
After Effects の中に組み立てるスクリプトです。背景が動画のときや、背景がまだ
決まっていない・後から差し替えるときに使います。

Stride11 フェードは、PC-8801mkIISR で当時よく使われた手法のひとつです。画面を
1バイト（横8ドット×1ライン）ずつ塗るとき、**アドレスを11バイト飛びに書いていく**。
開始位置を1つずつずらして11回くり返すと1プレーンが埋まり、青・赤・緑の3プレーンぶん
続けて絵が完成します。

通常版（[`../ae/`](../ae/)）は元画像と重ね合わせ画像の2枚を受け取って1枚を返しますが、
こちらは**重ね合わせ1枚だけ**を受け取り、**下にあるもの全部に効く2枚**（乗算 + 加算）
を作ります。

| | [`../ae/`](../ae/)（通常版） | こちら（透明合成版） |
|---|---|---|
| 指定するレイヤー | 元画像 + 重ね合わせ の2枚 | **重ね合わせの1枚だけ** |
| 出力 | 1枚（元画像を含む） | **2枚（乗算 + 加算）** |
| 背景 | 指定した元レイヤー | **下にあるもの全部** |
| 向いている場面 | 背景が静止画で決まっている | 背景が動画・後から変わる |

背景が決まっているなら通常版のほうが素直です。こちらは2枚構成になるぶん扱いが
増えるので、**必要なときだけ**使ってください。

```
tools/ae-transparent/
├── stride11_fade_transparent.jsx   AE 組み立てスクリプト
└── README.md
```

---

## 準備するもの

- **After Effects** … 26.2.1（日本語版・Windows）で確認済み
- **リビールマップ PNG** … [`../ae/index.html`](../ae/index.html) で書き出します。
  **生成ツールは通常版と共用**です（マップの中身は合成方法に依存しません）
- **重ね合わせたい画像** … 1枚。アルファを持っていて構いません
- 背景は後から下に置けます。このスクリプトには渡しません

---

## つかいかた

1. [`../ae/index.html`](../ae/index.html) でリビールマップ PNG を書き出す
2. 重ね合わせたいレイヤーが載ったコンポを開く
3. **そのレイヤーを1枚だけ選択する**（元画像は選びません）
4. ファイル > スクリプト > スクリプトファイルを実行… で
   `stride11_fade_transparent.jsx` を選ぶ
5. ダイアログでマップ PNG・**向き**・プレーン順・尺を指定して「組み立てる」
6. `Stride11 Fade CTRL` の `Fade Progress`（0→100）がフェードの進行です

でき上がるのは `Stride11 Fade MUL`（乗算）と `Stride11 Fade ADD`（加算）の2枚です。
**この2枚より下に背景を置いてください。** 上に置いたものには効きません。

### 出現と消滅

ダイアログの**向き**で「出現（フェードイン）」と「消滅（フェードアウト）」を
選べます。**消滅は出現の厳密な逆再生**で、最初に出たプレーンが最後に消えます。

中身は単純で、`Fade Progress` のキーフレームを 100→0 に振るだけです。組んだあとで
向きを変えたくなったら、CTRL のキーフレーム2つを入れ替えれば済みます。

### うまくいかないとき

スクリプトが出す診断ログにプロパティ一覧が入っています。そのまま送ってください。

| 症状 | 疑うところ |
|---|---|
| 画面が真っ白になる | `AM_p` が真っ黒。「アルファ→RGB の配線」がログで 3/3 か確認 |
| 絵の外側の背景まで暗くなる | `AM_p` のマスクが効いていない |
| 画面が真っ黒になる | `MUL` が乗算になっていない |
| 絵が出ない | `ADD` が加算になっていない、または `ADD` が `MUL` より下にある |
| 織り目が出ずベタで出る | しきい値が駆動できていない。ログの「駆動方法」を確認 |
| 下の背景が消える | `ADD` / `MUL` のアルファ。平面は不透明のままである必要があります |
| **フェード完了後も上端に黒い破片が残る** | **マップが古い。明度 0 を含むマップは開かない。書き出し直す** |

---

## 技術的な話

### なぜ2枚に分かれるのか

**チャンネルごとの透明度は、1枚のレイヤーでは表現できません。** アルファは1本しか
ないので、「赤と緑は下が透けて、青だけ絵が出ている」という状態を1枚に持たせられません。
この演出はまさにその状態を作るものなので、2枚に分けるほかありません。連番PNG版の
透明モードと同じ理屈です。

| レイヤー | 合成 | 中身 | 役割 |
|---|---|---|---|
| `Stride11 Fade ADD` | **加算** | 重ね合わせ × α × マスク | 削った分に絵を足す |
| `Stride11 Fade MUL` | **乗算** | 1 − α × マスク | 出すプレーンのぶんだけ下を削る |

下から **MUL → ADD** の順に重なります。合わせると

```
下にあるもの × (1 − α·m) + 絵 × α·m
```

になります。`m` がセルごと・プレーンごとの 0/1 マスク、`α` が重ね合わせ画像の
アルファです。塗っていないセルは `MUL = 白`・`ADD = 黒` なので**完全に透明**、
塗り終わると**通常のアルファ合成と厳密に一致**します。

### `MUL` の作り方が肝

`1 − α × マスク` を作るのに、減算合成やチャンネル演算は使っていません。2段構えです。

まず `α × マスク` を**輝度として持つコンポ**を作ります。

```
[AM_p]  コンポ。上から
  MASK_p        リビールマップ + しきい値
  ALPHA         白い平面（Set Channels で RGB ← 重ね合わせのアルファ
                 ＋ ルミナンス反転トラックマット = MASK_p）
  ALPHA SOURCE  重ね合わせ（ビデオOFF。Set Channels の参照先）
  BLACK         黒い平面
```

Set Channels の「取得元」にアルファを指定すると、アルファがそのまま明るさになります。
それにマスクを掛けて黒地に置けば、輝度が `α × マスク` のコンポになります。あとは
これをマットにして黒を白から抜くだけです。

```
[MUL_p]  コンポ。上から
  AM        AM_p（ルミナンストラックマット）
  BLACK     黒い平面（マット = AM）
  WHITE     白い平面
```

黒がアルファのぶんだけ白を押し下げるので、結果がそのまま `1 − α × マスク` になります。

**色を変えるエフェクトは一切使っていません。** 平面・トラックマット・Set Channels
だけで、いずれも通常版で実機確認済みの仕組みです。

`ADD_p` のほうは通常版の `MIX_p` と同じ構造で、下敷きが元画像ではなく黒い平面に
なっているだけです。黒地に置くことで `重ね合わせ × α` になります（プリマルチプライ）。

### 組み上がる構成

```
[マスターコンポ]
  Stride11 Fade ADD (平面)  加算 ─ Set Channels で ADD_p から各チャンネルを取る
  Stride11 Fade MUL (平面)  乗算 ─ Set Channels で MUL_p から各チャンネルを取る
  ADD_0..2 / MUL_0..2       ビデオOFF（Set Channels の参照先）
  Stride11 Fade CTRL (ヌル) ─ スライダー "Fade Progress" 0-100  ← これをアニメート
  重ね合わせレイヤー         ビデオOFF
  ── ここから下が背景 ──
```

「3プレーン同時」を選んだ場合は Set Channels が要らないので、`ADD_0` と `MUL_0` の
コンポをそのまま2枚重ねる構成になります。

### 動作確認の状況

**AE 26.2.1（日本語版）の実機で、組み立ても見え方も確認済みです**（2026-09-13〜14）。
Set Channels の配線も 3/3 で通っています。

通常版から引き継いでいる仕組み:

- しきい値エフェクトを matchName で引き、値域を実測して駆動する
- 式が評価まで通ったかを `expressionError` で確認する
- ルミナンス反転トラックマットで掃引を作る
- Set Channels でチャンネルごとに別コンポから取る

この版で新しく入れたもの:

- **Set Channels の RGB を、別レイヤーの「アルファ」から取る**（`useX = 4`）。
  通常版が「アルファ ← 元レイヤーのアルファ」で 4 を使っており、同じ列挙です
- **`BlendingMode.MULTIPLY` / `BlendingMode.ADD` の設定**
- Set Channels を**レイヤーを足し終えてから**設定する
  （途中で足すとレイヤー番号がずれるため）

### 修正履歴

#### 2026-09-14 — マップの明度 0 が開かない（マップ側の修正）

**フェード完了後も画面上端に黒い破片が残る**現象を追い切りました。正体は
**リビールマップの明度 0 のセルが AE では永久に開かない**ことです。マスクは
`v < L` なので `L ≥ 1` で開くはずですが、AE の「しきい値」は輝度ちょうど 0 の画素を
最後まで白のままにします（`v=1` は正常に開きます）。

マップ生成ツール側を直し、値域を **1〜254**（`v = 1 + floor(254 * s)`）にしました。
**手元の古いマップは書き出し直してください。** 組み立てスクリプト自体は変更して
いません。マップを作り直して AE で確認し、破片が消えることを確認済みです。

根拠と測定の手順は `引き継ぎ.md` の「AE: 輝度 0 のセルが開かない（決着・2026-09-14）」
にあります。

#### 2026-09-13（その2） — 向きの選択とログの整理

実機で動作を確認し、あわせて2点直しました。

- **向き（出現 / 消滅）を選べるようにしました**（通常版・英語版にも入れてあります）
- **診断ログが長すぎて画面に収まらない**問題。同じ内容の一覧を3回出していたので
  一度だけにし、ログ窓の高さを画面に収まる範囲で固定しました
  （`Ctrl+A` → `Ctrl+C` でコピーできます）

#### 2026-09-13 — 一覧出力で落ちる / 色を変えるエフェクトをやめる

実行が2度とも「数値結果が無効です(ゼロによる除算?)」で中断しました。

1度目の原因は**診断用のプロパティ一覧出力**でした。`matchName` と `name` を素で
読んでおり、**触るだけで例外を投げるプロパティが実在します**（AE 26 の塗り）。
2度目は同じ出力が、値を**文字列に変換するところ**で落ちていました。取得は包んで
いても、連結は包みの外で起きます。

一覧出力は全体を `try` で囲み、値の文字列化まで包むようにしました。
**一覧を出すだけのものが実行を止めることは、もうありません。** 通常版・英語版にも
同じ防御を入れてあります（読み取りを包むだけなので挙動は変わりません）。

**あわせて、色を変えるエフェクトを使うのをやめました。** 塗りも色かぶり補正も、
プロパティに触った時点で落ちる可能性が残ります。`1 − α × マスク` は Set Channels と
トラックマットだけで作れるので、そちらへ組み替えました。

### 関連

- [`../ae/`](../ae/) — 通常版（元画像を指定する。マップ生成ツールもこちら）
- [`../png-sequence/`](../png-sequence/) — 連番PNG版。同じ2シーケンス方式の透明モードがあります
- 元になった解析（動画そのものの解析は、素材の権利の都合で公開していません）

---
---

# After Effects Tool (transparent compositing) — Stride11 Fade

## What this is

A script that builds a Stride11 fade in After Effects which **takes no base image and
affects everything underneath it**. Use it when the background is video, or when the
background is not decided yet.

The Stride11 fade is a technique that was common on the PC-8801mkIISR: the screen is
painted one byte (8 dots wide, 1 line tall) at a time, with the writes **stepping through
memory 11 bytes apart**, 11 passes per plane, three planes in sequence.

The regular version ([`../ae/`](../ae/)) takes a base and an overlay and returns one
layer. This one takes **the overlay alone** and produces **two layers (multiply and add)
that affect everything below them**.

| | [`../ae/`](../ae/) (regular) | this one (transparent) |
|---|---|---|
| Layers you select | base + overlay | **overlay only** |
| Output | one layer (contains the base) | **two layers (multiply + add)** |
| Background | the base layer you picked | **everything underneath** |
| Best for | a background that is a fixed still | a background that is video or will change |

If the background is settled, the regular version is more straightforward. This one adds
a two-layer rig to manage, so use it **only when you need it**.

## What you need

- **After Effects.** Verified on 26.2.1 (Japanese, Windows)
- **A reveal map PNG**, exported from [`../ae/index.html`](../ae/index.html).
  **The generator is shared with the regular version** (the map does not depend on how
  it will be composited)
- **One overlay image.** It may have an alpha channel
- No background needed at build time — you put that underneath afterwards

## How to use

1. Export a reveal map PNG from [`../ae/index.html`](../ae/index.html)
2. Open the comp containing the layer you want to fade in
3. **Select that one layer** (do not select a base image)
4. File > Scripts > Run Script File… → `stride11_fade_transparent.jsx`
5. Point it at the map PNG, choose direction, plane order and duration, and build
6. `Fade Progress` (0→100) on `Stride11 Fade CTRL` drives the fade

You get `Stride11 Fade MUL` (multiply) and `Stride11 Fade ADD` (add).
**Put your background below those two layers** — anything above them is unaffected.

### Appearing and disappearing

The **direction** option chooses between appearing (fade in) and disappearing (fade out).
**Fade out is the exact reverse of fade in**: the plane that arrived first leaves last.
It simply runs `Fade Progress` from 100 to 0, so you can flip it afterwards by swapping
the two keyframes on CTRL.

### When something goes wrong

The diagnostic log the script prints contains the property listing. Send it as is.

| Symptom | What to check |
|---|---|
| The screen goes white | `AM_p` is black. Check the log says the alpha→RGB wiring was 3/3 |
| The background darkens outside the artwork | the mask in `AM_p` is not applying |
| The screen goes black | `MUL` is not set to multiply |
| Nothing appears | `ADD` is not set to add, or `ADD` sits below `MUL` |
| It appears solid, with no weave | the threshold is not being driven; check "driven by" in the log |
| The background disappears | alpha on `ADD` / `MUL`; the solids must stay opaque |
| **Black fragments remain along the top after the fade** | **an old map. Maps containing luminance 0 never open there — export a new one** |

## How it works

### Why it takes two layers

**Per-channel transparency cannot be expressed in a single layer.** There is only one
alpha channel, so "red and green show what is underneath while blue shows the picture"
cannot be held in one layer — and that state is exactly what this effect produces. The
same reasoning applies to the PNG-sequence tool's transparent mode.

| Layer | Blend | Contents | Role |
|---|---|---|---|
| `Stride11 Fade ADD` | **Add** | overlay × α × mask | adds the picture back where it was removed |
| `Stride11 Fade MUL` | **Multiply** | 1 − α × mask | removes the background for the planes being shown |

Stacked **MUL then ADD** from the bottom, they combine to:

```
whatever is underneath × (1 − α·m) + picture × α·m
```

`m` is the per-cell, per-plane 0/1 mask and `α` is the overlay's alpha. Unpainted cells
have `MUL = white` and `ADD = black`, so they are **fully transparent**; once painted the
result **matches ordinary alpha compositing exactly**.

### Building `MUL` is the tricky part

`1 − α × mask` is built without any subtract blending or channel arithmetic, in two stages.

First, a comp whose **luminance is `α × mask`**:

```
[AM_p]  comp, top to bottom
  MASK_p        reveal map + Threshold
  ALPHA         white solid (Set Channels: RGB ← the overlay's alpha,
                 plus a Luma Inverted track matte = MASK_p)
  ALPHA SOURCE  the overlay (video off; it is the Set Channels source)
  BLACK         black solid
```

Point Set Channels at alpha and the alpha becomes brightness directly. Multiply that by
the mask over black and the comp's luminance is `α × mask`. Then use it as a matte to
punch black out of white:

```
[MUL_p]  comp, top to bottom
  AM        AM_p (luma track matte)
  BLACK     black solid (matte = AM)
  WHITE     white solid
```

The black pushes the white down by exactly the alpha, so the result is `1 − α × mask`.

**No colour-changing effect is used anywhere.** Only solids, track mattes and
Set Channels — all mechanisms already verified on the regular version.

`ADD_p` has the same structure as the regular version's `MIX_p`, except the bottom layer
is a black solid instead of the base image. Sitting on black gives `overlay × α`
(premultiplied).

### The resulting structure

```
[master comp]
  Stride11 Fade ADD (solid)  Add      ─ Set Channels pulls each channel from ADD_p
  Stride11 Fade MUL (solid)  Multiply ─ Set Channels pulls each channel from MUL_p
  ADD_0..2 / MUL_0..2        video off (Set Channels sources)
  Stride11 Fade CTRL (null)  ─ slider "Fade Progress" 0-100  ← animate this
  overlay layer              video off
  ── your background goes below here ──
```

With "all three planes at once" there is no Set Channels, so the rig is simply the
`ADD_0` and `MUL_0` comps stacked.

### Verification status

**Verified on AE 26.2.1 (Japanese): both the build and the resulting picture**
(2026-09-13 to 09-14). The Set Channels wiring reports 3/3.

Inherited from the regular version:

- Find the Threshold effect by matchName and measure its range before driving it
- Confirm the expression actually evaluates via `expressionError`
- Build the sweep with a Luma Inverted track matte
- Use Set Channels to take each channel from a different comp

New in this version:

- **Set Channels takes RGB from another layer's alpha** (`useX = 4`), the same
  enumeration the regular version uses for "alpha ← base layer alpha"
- Setting `BlendingMode.MULTIPLY` / `BlendingMode.ADD`
- Configuring Set Channels **after all layers have been added** (adding layers later
  shifts the indices)

### Fix history

#### 2026-09-14 — luminance 0 never opens (fixed on the map side)

Black fragments remained along the top of the screen after the fade finished. The cause
is that **cells whose reveal-map luminance is 0 never open in AE**. The mask is `v < L`,
so `L ≥ 1` ought to open them, but AE's Threshold keeps a luminance-0 pixel white to the
end (`v=1` opens normally).

The generator was changed to a range of **1–254** (`v = 1 + floor(254 * s)`).
**Re-export any old maps you have.** The build script itself was not changed. Rebuilding
the map and checking in AE confirmed the fragments are gone.

#### 2026-09-13 (second) — direction option, tidier log

Verified on the real application, with two fixes:

- **Added the direction option** (fade in / fade out; also added to the regular and
  English versions)
- **The diagnostic log was too long to fit on screen.** It printed the same listing three
  times; now it prints once, and the log box has a fixed height that fits
  (`Ctrl+A` → `Ctrl+C` to copy)

#### 2026-09-13 — crashing while printing the listing; no more colour effects

Two runs aborted with "invalid numeric result (division by zero?)".

The first was caused by **the diagnostic property listing**. It read `matchName` and
`name` directly, and **some properties throw merely on being touched** (AE 26's Fill).
The second time the same listing died **while converting a value to a string** — the read
was wrapped, but the concatenation happened outside the wrapper.

The listing is now wrapped as a whole, including stringification.
**A listing can no longer stop the run.** The same guard is in the regular and English
versions (it only wraps reads, so behaviour is unchanged).

**Colour-changing effects were dropped at the same time.** Both Fill and Tint can throw
the moment a property is touched. Since `1 − α × mask` can be built with Set Channels and
track mattes alone, it was rebuilt that way.

### See also

- [`../ae/`](../ae/) — the regular version (takes a base image; the map generator lives there)
- [`../png-sequence/`](../png-sequence/) — the PNG-sequence tool, which has the same two-sequence transparent mode
- The analysis itself is not published (the source material is not ours to redistribute)
