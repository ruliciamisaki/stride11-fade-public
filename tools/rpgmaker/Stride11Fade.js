//=============================================================================
// Stride11Fade.js
// ---------------------------------------------------------------------------
// Stride11 フェード for RPG Maker MV / MZ
//
// PC-8801mkIISR のフェード演出（VRAM アドレス 11 バイト飛び × 11 パス ×
// 3 プレーン）を再現するフェードイン／フェードアウト。
//
// ・リビールマップは実行時に自動生成します（画像素材は不要）。
// ・画面サイズがそのまま処理サイズです（1 ドット = 1 ピクセル）。
//   縦 2 倍ドットで絵を描いているゲームは「1ドットの縦ピクセル数」を 2 に。
// ・青 → 赤 → 緑 の 3 プレーン順で、実機と同じ色の段取りが出ます。
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Stride11 フェード（3プレーン・11バイト飛び）
 * @author -
 *
 * @param stride
 * @text ストライド
 * @desc 何バイト飛びに塗るか。実機は 11。1ライン当たりのバイト数と互いに素でないと縦縞になります。
 * @type number
 * @min 1
 * @max 255
 * @default 11
 *
 * @param dotPixelW
 * @text 1ドットの横ピクセル数
 * @desc 通常は 1（1ドット=1ピクセル）。横も引き伸ばしたドット絵なら 2 など。
 * @type number
 * @min 1
 * @max 16
 * @default 1
 *
 * @param dotPixelH
 * @text 1ドットの縦ピクセル数
 * @desc 通常は 1。全画像を縦2倍ドットで描いているゲームは 2。
 * @type number
 * @min 1
 * @max 16
 * @default 1
 *
 * @param planeOrder
 * @text プレーン順
 * @desc 実機は 青→赤→緑（VRAMバンク 5CH/5DH/5EH の順）。
 * @type select
 * @option 青 → 赤 → 緑（実機）
 * @value brg
 * @option 緑 → 赤 → 青（逆順）
 * @value grb
 * @option 赤 → 緑 → 青
 * @value rgb
 * @option 3プレーン同時（色の段取りなし）
 * @value all
 * @default brg
 *
 * @param defaultDuration
 * @text 既定のフェード時間（フレーム）
 * @desc 実機は約1.44秒。60fps なら 86 フレームが実機相当です。
 * @type number
 * @min 1
 * @max 9999
 * @default 86
 *
 * @param mapImage
 * @text リビールマップ画像（任意）
 * @desc 空なら自動生成。img/pictures/ の画像名を入れると、そちらを使います（画面と同サイズ推奨）。
 * @type file
 * @dir img/pictures
 * @default
 *
 * @command fadeIn
 * @text Stride11 フェードイン
 * @desc 覆いを晴らして画面を出します。
 *
 * @arg color
 * @text 色
 * @type select
 * @option 黒
 * @value black
 * @option 白
 * @value white
 * @default black
 *
 * @arg duration
 * @text 時間（フレーム）
 * @desc 0 なら既定値を使います。
 * @type number
 * @min 0
 * @max 9999
 * @default 0
 *
 * @arg wait
 * @text 完了までウェイト
 * @type boolean
 * @default true
 *
 * @arg stride
 * @text ストライド
 * @desc 何バイト飛びに塗るか。0 なら現在の設定のまま。実機は 11。
 * @type number
 * @min 0
 * @max 255
 * @default 0
 *
 * @arg dotPixelW
 * @text 1ドットの横ピクセル数
 * @desc 0 なら現在の設定のまま。
 * @type number
 * @min 0
 * @max 16
 * @default 0
 *
 * @arg dotPixelH
 * @text 1ドットの縦ピクセル数
 * @desc 0 なら現在の設定のまま。縦2倍ドットで描いているゲームは 2。
 * @type number
 * @min 0
 * @max 16
 * @default 0
 *
 * @arg planeOrder
 * @text プレーン順
 * @desc 「そのまま」なら現在の設定を変えません。
 * @type select
 * @option そのまま
 * @value keep
 * @option 正順（青→赤→緑・実機）
 * @value brg
 * @option 逆順（緑→赤→青）
 * @value grb
 * @option 3プレーン同時（色の段取りなし）
 * @value all
 * @default keep
 *
 * @arg mapImage
 * @text リビールマップ画像
 * @desc 空欄なら現在の設定のまま。自作マップを使うときだけ指定します。
 * @type file
 * @dir img/pictures
 * @default
 *
 * @command fadeOut
 * @text Stride11 フェードアウト
 * @desc 画面を覆っていきます。
 *
 * @arg color
 * @text 色
 * @type select
 * @option 黒
 * @value black
 * @option 白
 * @value white
 * @default black
 *
 * @arg duration
 * @text 時間（フレーム）
 * @desc 0 なら既定値を使います。
 * @type number
 * @min 0
 * @max 9999
 * @default 0
 *
 * @arg wait
 * @text 完了までウェイト
 * @type boolean
 * @default true
 *
 * @arg stride
 * @text ストライド
 * @desc 何バイト飛びに塗るか。0 なら現在の設定のまま。実機は 11。
 * @type number
 * @min 0
 * @max 255
 * @default 0
 *
 * @arg dotPixelW
 * @text 1ドットの横ピクセル数
 * @desc 0 なら現在の設定のまま。
 * @type number
 * @min 0
 * @max 16
 * @default 0
 *
 * @arg dotPixelH
 * @text 1ドットの縦ピクセル数
 * @desc 0 なら現在の設定のまま。縦2倍ドットで描いているゲームは 2。
 * @type number
 * @min 0
 * @max 16
 * @default 0
 *
 * @arg planeOrder
 * @text プレーン順
 * @desc 「そのまま」なら現在の設定を変えません。
 * @type select
 * @option そのまま
 * @value keep
 * @option 正順（青→赤→緑・実機）
 * @value brg
 * @option 逆順（緑→赤→青）
 * @value grb
 * @option 3プレーン同時（色の段取りなし）
 * @value all
 * @default keep
 *
 * @arg mapImage
 * @text リビールマップ画像
 * @desc 空欄なら現在の設定のまま。自作マップを使うときだけ指定します。
 * @type file
 * @dir img/pictures
 * @default
 *
 * @command clear
 * @text 覆いを解除
 * @desc フェードアウト後の覆いを即座に消します。
 *
 * @command resetConfig
 * @text 設定をリセット
 * @desc プラグインコマンドで変えた設定を、プラグインパラメータの値へ戻します。
 *
 * @help
 * Stride11 フェード
 * ===========================================================================
 *
 * PC-8801mkIISR で当時よく使われたフェード演出を再現します。
 *
 *   ・塗る単位は 1 バイト = 横 8 ドット
 *   ・1 パスでアドレスが 11 の倍数だけ離れたバイトを画面の上から下へ塗る
 *   ・開始位置を 0,1,…,10 とずらして 11 パスで 1 プレーン完成
 *   ・それを 青 → 赤 → 緑 の順に 3 回
 *
 * 前半は青だけが出るので白くなる領域が真っ青な幽霊像になり、赤が乗って
 * 紫〜赤へ転び、最後に緑で本来の色に着地します。この色の段取りが本体です。
 *
 * ---------------------------------------------------------------------------
 * 使い方（MZ）
 * ---------------------------------------------------------------------------
 * プラグインコマンドから「Stride11 フェードイン」「Stride11 フェードアウト」を
 * 選んでください。
 *
 * 引数でプラグインパラメータを上書きできます。数値は 0、プレーン順は「そのまま」、
 * 画像は空欄が「無指定」の意味で、その項目は現在の設定のまま変わりません。
 * 指定した値はその後も効き続けます。「設定をリセット」でパラメータの値へ戻ります。
 *
 * ---------------------------------------------------------------------------
 * MV から MZ へ変換したプロジェクトについて
 * ---------------------------------------------------------------------------
 * MV で作ったプロジェクトを MZ で開くと、データは MZ 形式になるのに
 * ランタイム（index.html / js/main.js / js/libs/pixi.js）が MV のまま残ることが
 * あります。この状態では MZ のエディタで置いたプラグインコマンドが実行時に
 * 読み飛ばされます。
 *
 * 本プラグインは、その場合に限り MZ 形式のプラグインコマンド（コマンド357）を
 * 実行できるよう最小限の橋渡しをします。MZ のエディタで置いたコマンドが
 * そのまま動きます。既に MZ のランタイムで動いている場合は何もしません。
 *
 * ---------------------------------------------------------------------------
 * 使い方（MV）
 * ---------------------------------------------------------------------------
 * イベントの「プラグインコマンド」に次のように書きます。
 *
 *   Stride11フェードイン 黒 86
 *   Stride11フェードアウト 白 120
 *   Stride11フェード解除
 *   Stride11設定リセット
 *
 *   色（黒 / 白 / black / white）と時間（フレーム数）は省略できます。
 *   省略すると黒・既定時間になります。英語名 stride11FadeIn / stride11FadeOut /
 *   stride11FadeClear / stride11ResetConfig でも動きます。
 *
 *   パラメータの上書きは key=value を後ろに足します。順番は自由です。
 *
 *     Stride11フェードイン 黒 86 stride=13 縦=2 順=逆順
 *     Stride11フェードアウト 白 120 順=同時
 *
 *   使えるキーは次のとおり（左が正式名、右は別名）。
 *
 *     stride    … ストライド            ストライド
 *     dotw      … 1ドットの横ピクセル数  dotPixelW / 横
 *     doth      … 1ドットの縦ピクセル数  dotPixelH / 縦
 *     plane     … プレーン順            planeOrder / 順
 *     map       … リビールマップ画像     mapImage / マップ
 *
 *   プレーン順の値は 正順 / 逆順 / 同時（brg / grb / all でも可）。
 *
 * ---------------------------------------------------------------------------
 * 縦 2 倍ドットのゲームで使う場合
 * ---------------------------------------------------------------------------
 * 全ての画像を縦 2 倍ドットで描いているゲームは、パラメータ
 * 「1ドットの縦ピクセル数」を 2 にしてください。フェードの粒も縦 2 倍になり、
 * 絵の見た目と揃います。
 *
 * ---------------------------------------------------------------------------
 * 注意
 * ---------------------------------------------------------------------------
 * ・WebGL 必須です（MV でキャンバスモードにフォールバックした場合は効きません）。
 * ・フェードアウト後は覆ったままになります。次のフェードインか「覆いを解除」で
 *   戻ります。場所移動を挟んでも覆いは維持されます。
 * ・覆いの状態はセーブされません。フェードアウト直後にセーブしてロードすると
 *   覆いは消えた状態で始まります。
 * ・ツクール本体のフェード（イベントコマンドの「画面のフェードアウト」）とは
 *   別系統です。混ぜると二重にかかります。
 *
 * ---------------------------------------------------------------------------
 * ライセンス
 * ---------------------------------------------------------------------------
 * MIT License。改変・再配布・商用利用いずれも自由です。
 */

var Imported = Imported || {};
Imported.Stride11Fade = true;

(function () {
    'use strict';

    var PLUGIN_NAME = 'Stride11Fade';

    /* =====================================================================
     *  パラメータ
     * ===================================================================== */
    var rawParams = (typeof PluginManager !== 'undefined' && PluginManager.parameters)
        ? PluginManager.parameters(PLUGIN_NAME) : {};

    function numParam(key, dflt, min, max) {
        var v = parseInt(rawParams[key], 10);
        if (isNaN(v)) { return dflt; }
        return Math.max(min, Math.min(max, v));
    }

    /* プラグインパラメータの値。ここは書き換えない */
    var defaults = {
        stride: numParam('stride', 11, 1, 255),
        dotPixelW: numParam('dotPixelW', 1, 1, 16),
        dotPixelH: numParam('dotPixelH', 1, 1, 16),
        planeOrder: String(rawParams['planeOrder'] || 'brg'),
        defaultDuration: numParam('defaultDuration', 86, 1, 9999),
        mapImage: String(rawParams['mapImage'] || '')
    };

    /* 実際に使われる設定。プラグインコマンドの引数で上書きされる。
       Stride11Fade.params として公開しているので、参照は保ったまま中身だけ書き換える。 */
    var params = {};

    function resetConfig() {
        for (var k in defaults) {
            if (Object.prototype.hasOwnProperty.call(defaults, k)) { params[k] = defaults[k]; }
        }
    }
    resetConfig();

    /* プレーン順。ch は RGB のチャンネル番号 (R=0, G=1, B=2)。 */
    var PLANE_SETS = {
        brg: [{ name: 'blue', ch: 2 }, { name: 'red', ch: 0 }, { name: 'green', ch: 1 }],
        grb: [{ name: 'green', ch: 1 }, { name: 'red', ch: 0 }, { name: 'blue', ch: 2 }],
        rgb: [{ name: 'red', ch: 0 }, { name: 'green', ch: 1 }, { name: 'blue', ch: 2 }],
        all: [{ name: 'rgb', ch: -1 }]
    };
    function phases() {
        return PLANE_SETS[params.planeOrder] || PLANE_SETS.brg;
    }

    /* =====================================================================
     *  リビールマップの生成
     *
     *    セル（バイト）のアドレス a に対し
     *      residue = a mod stride            … 第何パスで塗られるか
     *      s       = (residue + a/N) / stride … 1プレーン内の正規化順序 [0,1)
     *      v       = floor(255 * s)          … 明度（0-254、暗いほど早い）
     *
     *    v の上限を 254 に抑えてあるので、しきい値 1.0 で必ず全開になる。
     * ===================================================================== */
    var _mapBitmap = null;
    var _mapKey = '';

    function buildRevealMap(width, height) {
        // 0 以下だと createImageData が IndexSizeError を投げる
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));
        var dpw = params.dotPixelW;
        var dph = params.dotPixelH;
        var stride = params.stride;
        var byteW = 8 * dpw;
        var bpl = Math.max(1, Math.floor(width / byteW));
        var lines = Math.max(1, Math.floor(height / dph));
        var total = bpl * lines;

        var bitmap = new Bitmap(width, height);
        var ctx = bitmap._context || bitmap.context;
        var img = ctx.createImageData(width, height);
        var data = img.data;

        for (var line = 0; line < lines; line++) {
            var y0 = line * dph;
            var y1 = (line === lines - 1) ? height : (line + 1) * dph;
            for (var bi = 0; bi < bpl; bi++) {
                var a = line * bpl + bi;
                var s = ((a % stride) + a / total) / stride;   // [0,1)
                var v = Math.floor(255 * s);                   // 最大 254
                var x0 = bi * byteW;
                var x1 = (bi === bpl - 1) ? width : (bi + 1) * byteW;
                for (var y = y0; y < y1; y++) {
                    var o = (y * width + x0) * 4;
                    for (var x = x0; x < x1; x++, o += 4) {
                        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        markBitmapDirty(bitmap);
        setBitmapSmooth(bitmap, false);
        return bitmap;
    }

    /** MV / MZ どちらでもテクスチャ更新を通す */
    function markBitmapDirty(bitmap) {
        if (typeof bitmap._setDirty === 'function') { bitmap._setDirty(); return; }
        var bt = bitmap._baseTexture || bitmap.baseTexture;
        if (bt && typeof bt.update === 'function') { bt.update(); }
    }

    function setBitmapSmooth(bitmap, smooth) {
        try { bitmap.smooth = smooth; } catch (e) { /* MZ は setter が無い場合がある */ }
        var bt = bitmap._baseTexture || bitmap.baseTexture;
        if (bt && typeof PIXI !== 'undefined' && PIXI.SCALE_MODES) {
            bt.scaleMode = smooth ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
        }
    }

    function revealMapBitmap() {
        var w = Graphics.width, h = Graphics.height;
        var key = [w, h, params.stride, params.dotPixelW, params.dotPixelH].join(':');
        if (_mapBitmap && _mapKey === key) { return _mapBitmap; }
        _mapBitmap = buildRevealMap(w, h);
        _mapKey = key;
        return _mapBitmap;
    }

    /* =====================================================================
     *  しきい値フィルタ
     *
     *    マップ明度 v がしきい値未満のセルを「出す」。
     *    黒フェードなら mask をそのまま出して MULTIPLY 合成
     *      → 出す所は白(=1)倍で素通し、隠す所は黒(=0)倍で真っ黒
     *    白フェードなら 1-mask を出して SCREEN 合成
     *      → 出す所は 0 で素通し、隠す所は 1 で真っ白
     * ===================================================================== */
    var FRAG_SRC = [
        'varying vec2 vTextureCoord;',
        'uniform sampler2D uSampler;',
        'uniform vec3 thresholds;',
        'uniform float toWhite;',
        'void main(void) {',
        '    float v = texture2D(uSampler, vTextureCoord).r;',
        '    vec3 m = step(vec3(v + 0.00196), thresholds);',
        '    gl_FragColor = vec4(abs(m - vec3(toWhite)), 1.0);',
        '}'
    ].join('\n');

    /** PIXI 4 (MV) は {type, value}、PIXI 5 (MZ) は値そのもの、と記法が違う */
    function isPixi4() {
        return !(typeof PIXI !== 'undefined' && PIXI.VERSION &&
                 parseInt(PIXI.VERSION, 10) >= 5);
    }

    function createThresholdFilter() {
        var uniforms = isPixi4()
            ? { thresholds: { type: '3fv', value: [0, 0, 0] },
                toWhite: { type: '1f', value: 0 } }
            : { thresholds: new Float32Array([0, 0, 0]),
                toWhite: 0 };
        // 頂点シェーダは PIXI 既定のものを使う
        var filter = new PIXI.Filter(null, FRAG_SRC, uniforms);
        filter.padding = 0;
        return filter;
    }

    /* =====================================================================
     *  進行状態（シーンをまたいで保持する）
     * ===================================================================== */
    var Stride11Fade = {
        mode: 'off',      // 'off' | 'in' | 'out' | 'covered'
        white: false,
        duration: 1,
        elapsed: 0
    };

    Stride11Fade.start = function (isFadeIn, white, duration) {
        this.mode = isFadeIn ? 'in' : 'out';
        this.white = !!white;
        this.duration = Math.max(1, duration | 0);
        this.elapsed = 0;
        // 本体のフェードと二重にかからないようにしておく
        if (typeof $gameScreen !== 'undefined' && $gameScreen) {
            $gameScreen._brightness = 255;
            $gameScreen._fadeOutDuration = 0;
            $gameScreen._fadeInDuration = 0;
        }
    };

    Stride11Fade.clear = function () {
        this.mode = 'off';
        this.elapsed = 0;
    };

    Stride11Fade.update = function () {
        if (this.mode !== 'in' && this.mode !== 'out') { return; }
        this.elapsed += 1;
        if (this.elapsed >= this.duration) {
            this.mode = (this.mode === 'in') ? 'off' : 'covered';
            this.elapsed = this.duration;
        }
    };

    Stride11Fade.isVisible = function () {
        return this.mode !== 'off';
    };

    /** RGB それぞれのしきい値を返す */
    Stride11Fade.thresholds = function () {
        var out = [0, 0, 0];
        if (this.mode === 'off') { return [1, 1, 1]; }
        if (this.mode === 'covered') { return [0, 0, 0]; }

        var tau = this.elapsed / this.duration;
        // フェードアウトはフェードインの逆再生
        var t = (this.mode === 'in') ? tau : (1 - tau);
        var ph = phases();
        var n = ph.length;
        for (var i = 0; i < n; i++) {
            var prog = Math.max(0, Math.min(1, n * t - i));
            if (ph[i].ch < 0) { out[0] = out[1] = out[2] = prog; }
            else { out[ph[i].ch] = prog; }
        }
        return out;
    };

    /* =====================================================================
     *  スプライト
     * ===================================================================== */
    function Sprite_Stride11Fade() {
        this.initialize.apply(this, arguments);
    }
    Sprite_Stride11Fade.prototype = Object.create(Sprite.prototype);
    Sprite_Stride11Fade.prototype.constructor = Sprite_Stride11Fade;

    Sprite_Stride11Fade.prototype.initialize = function () {
        Sprite.prototype.initialize.call(this);
        this._filter = createThresholdFilter();
        this.filters = [this._filter];
        this.visible = false;
        this._appliedWhite = null;
        this._mapKey = '';
        this._ensureMap();
    };

    /**
     * リビールマップを用意する。用意できたら true。
     *
     * MZ の Scene_Boot.start は Scene_Base.start を呼んだ後に resizeScreen() する。
     * つまりこのスプライトが作られる時点では Graphics.width がまだ 0 で、
     * その状態でマップを作ると createImageData が IndexSizeError を投げる。
     * サイズが確定するまで作らず、確定後の最初の update で作る。
     * 途中で画面サイズが変わったときも同じ経路で作り直される。
     */
    Sprite_Stride11Fade.prototype._ensureMap = function () {
        var w = Graphics.width, h = Graphics.height;
        if (!(w > 0 && h > 0)) { return false; }
        var key = [w, h, params.stride, params.dotPixelW, params.dotPixelH, params.mapImage].join(':');
        if (this.bitmap && this._mapKey === key) { return true; }
        this._mapKey = key;
        this.bitmap = (params.mapImage && ImageManager.loadPicture)
            ? ImageManager.loadPicture(params.mapImage)
            : revealMapBitmap();
        return true;
    };

    Sprite_Stride11Fade.prototype.update = function () {
        Sprite.prototype.update.call(this);
        if (!Stride11Fade.isVisible() || !this._ensureMap()) {
            this.visible = false;
            return;
        }
        this.visible = true;

        var thr = Stride11Fade.thresholds();
        var u = this._filter.uniforms;
        // 配列は作り直さず中身だけ書き換える（PIXI 4 の配列も 5 の Float32Array も追従する）
        if (u.thresholds && u.thresholds.length === 3) {
            u.thresholds[0] = thr[0]; u.thresholds[1] = thr[1]; u.thresholds[2] = thr[2];
        } else {
            u.thresholds = isPixi4() ? thr.slice() : new Float32Array(thr);
        }

        if (this._appliedWhite !== Stride11Fade.white) {
            this._appliedWhite = Stride11Fade.white;
            u.toWhite = Stride11Fade.white ? 1 : 0;
            // 合成はフィルタ側だけで行う。スプライト側にも同じ blendMode を入れると、
            // PIXI がフィルタ用に用意した「透明にクリアされた描画先」に対して乗算が
            // かかり、リビールマップが真っ黒に潰れてシェーダの読む v が全面 0 になる。
            // 結果、織り目が消えてプレーンごとに画面全体が一斉に切り替わる。
            this._filter.blendMode = Stride11Fade.white
                ? PIXI.BLEND_MODES.SCREEN : PIXI.BLEND_MODES.MULTIPLY;
        }
    };

    /* =====================================================================
     *  シーンへの組み込み
     * ===================================================================== */
    var _Scene_Base_start = Scene_Base.prototype.start;
    Scene_Base.prototype.start = function () {
        _Scene_Base_start.call(this);
        this.createStride11FadeSprite();
    };

    Scene_Base.prototype.createStride11FadeSprite = function () {
        if (this._stride11FadeSprite) { return; }
        this._stride11FadeSprite = new Sprite_Stride11Fade();
        this.addChild(this._stride11FadeSprite);
    };

    var _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function () {
        _Scene_Base_update.call(this);
        Stride11Fade.update();
    };

    /* =====================================================================
     *  コマンドの実体
     * ===================================================================== */
    function isWhite(colorArg) {
        var c = String(colorArg || '').toLowerCase();
        return c === '白' || c === 'white';
    }

    /* ---- 引数によるパラメータ上書き ------------------------------------- */

    /** 0・空・数値でないものは「指定なし」とみなし、現在の値を保つ */
    function overrideNum(key, raw, min, max) {
        var v = parseInt(raw, 10);
        if (isNaN(v) || v <= 0) { return; }
        params[key] = Math.max(min, Math.min(max, v));
    }

    var PLANE_ALIASES = {
        '正順': 'brg', '逆順': 'grb', '同時': 'all', '3プレーン同時': 'all',
        'brg': 'brg', 'grb': 'grb', 'rgb': 'rgb', 'all': 'all'
    };

    function overridePlaneOrder(raw) {
        var t = String(raw == null ? '' : raw).trim();
        if (!t || t === 'keep') { return; }   // 「そのまま」
        var v = PLANE_ALIASES[t] || PLANE_ALIASES[t.toLowerCase()];
        if (v) { params.planeOrder = v; }
    }

    /** 引数の値で params を上書きする。無指定の項目は触らない。 */
    function applyOverrides(a) {
        if (!a) { return; }
        overrideNum('stride', a.stride, 1, 255);
        overrideNum('dotPixelW', a.dotPixelW, 1, 16);
        overrideNum('dotPixelH', a.dotPixelH, 1, 16);
        overridePlaneOrder(a.planeOrder);
        var m = String(a.mapImage == null ? '' : a.mapImage).trim();
        if (m) { params.mapImage = m; }
    }

    function runFade(interpreter, isFadeIn, colorArg, durationArg, doWait, overrides) {
        applyOverrides(overrides);
        var d = parseInt(durationArg, 10);
        if (isNaN(d) || d <= 0) { d = params.defaultDuration; }
        Stride11Fade.start(isFadeIn, isWhite(colorArg), d);
        if (doWait && interpreter && typeof interpreter.wait === 'function') {
            interpreter.wait(d);
        }
    }

    /* ---- MV: プラグインコマンド ---------------------------------------- */

    /** MV のテキスト引数で使える key=value のキー名 */
    var MV_KEYS = {
        'stride': 'stride', 'ストライド': 'stride',
        'dotw': 'dotPixelW', 'dotpixelw': 'dotPixelW', '横': 'dotPixelW',
        'doth': 'dotPixelH', 'dotpixelh': 'dotPixelH', '縦': 'dotPixelH',
        'plane': 'planeOrder', 'planeorder': 'planeOrder', '順': 'planeOrder',
        'map': 'mapImage', 'mapimage': 'mapImage', 'マップ': 'mapImage'
    };

    /** 位置引数（色・時間）と key=value を分ける */
    function splitMvArgs(args) {
        var pos = [], kv = {};
        for (var i = 0; i < (args ? args.length : 0); i++) {
            var t = String(args[i]);
            var eq = t.indexOf('=');
            if (eq > 0) {
                var name = t.slice(0, eq);
                var key = MV_KEYS[name] || MV_KEYS[name.toLowerCase()];
                if (key) { kv[key] = t.slice(eq + 1); }
            } else {
                pos.push(t);
            }
        }
        return { pos: pos, kv: kv };
    }

    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        // MZ には pluginCommand が無いので、素の状態では呼ぶものが無い
        if (_Game_Interpreter_pluginCommand) {
            _Game_Interpreter_pluginCommand.call(this, command, args);
        }
        var a;
        switch (command) {
            case 'Stride11フェードイン':
            case 'stride11FadeIn':
                a = splitMvArgs(args);
                runFade(this, true, a.pos[0], a.pos[1], true, a.kv);
                break;
            case 'Stride11フェードアウト':
            case 'stride11FadeOut':
                a = splitMvArgs(args);
                runFade(this, false, a.pos[0], a.pos[1], true, a.kv);
                break;
            case 'Stride11フェード解除':
            case 'stride11FadeClear':
                Stride11Fade.clear();
                break;
            case 'Stride11設定リセット':
            case 'stride11ResetConfig':
                resetConfig();
                break;
        }
    };

    /* ---- MV で MZ形式のプラグインコマンドを動かす橋渡し ------------------
     *
     * MV で作ったプロジェクトを MZ で開いて変換すると、データは MZ 形式になるが
     * ランタイム（index.html / main.js / libs/pixi.js）が MV のまま残ることがある。
     * この状態だと MZ のエディタで置いたプラグインコマンド（コマンド357）が
     * イベントに書き込まれる一方、MV のインタプリタには command357 が無いため
     * 黙って読み飛ばされる。ウェイトだけ効いて何も起きない、という形で出る。
     *
     * MZ の実装と同じ内容を最小限だけ補う。既にあるものには一切触らない。
     */
    if (typeof PluginManager !== 'undefined' &&
        typeof PluginManager.registerCommand !== 'function') {
        PluginManager._commands = PluginManager._commands || {};
        PluginManager.registerCommand = function (pluginName, commandName, func) {
            this._commands[pluginName + ':' + commandName] = func;
        };
        PluginManager.callCommand = function (self, pluginName, commandName, args) {
            var func = this._commands[pluginName + ':' + commandName];
            if (typeof func === 'function') { func.bind(self)(args || {}); }
        };
    }
    if (typeof Game_Interpreter !== 'undefined' &&
        typeof Game_Interpreter.prototype.command357 !== 'function' &&
        typeof PluginManager !== 'undefined' &&
        typeof PluginManager.callCommand === 'function') {
        // MV のコマンドメソッドは引数を取らず this._params を読む
        Game_Interpreter.prototype.command357 = function () {
            var params = this._params;
            PluginManager.callCommand(this, params[0], params[1], params[3]);
            return true;
        };
    }

    /* ---- MZ: registerCommand ------------------------------------------- */
    if (typeof PluginManager !== 'undefined' &&
        typeof PluginManager.registerCommand === 'function') {
        PluginManager.registerCommand(PLUGIN_NAME, 'fadeIn', function (args) {
            runFade(this, true, args.color, args.duration, args.wait !== 'false', args);
        });
        PluginManager.registerCommand(PLUGIN_NAME, 'fadeOut', function (args) {
            runFade(this, false, args.color, args.duration, args.wait !== 'false', args);
        });
        PluginManager.registerCommand(PLUGIN_NAME, 'clear', function () {
            Stride11Fade.clear();
        });
        PluginManager.registerCommand(PLUGIN_NAME, 'resetConfig', function () {
            resetConfig();
        });
    }

    /* ---- 外から触れるように公開 ----------------------------------------- */
    window.Stride11Fade = {
        fadeIn: function (white, duration, overrides) {
            applyOverrides(overrides);
            Stride11Fade.start(true, white, duration || params.defaultDuration);
        },
        fadeOut: function (white, duration, overrides) {
            applyOverrides(overrides);
            Stride11Fade.start(false, white, duration || params.defaultDuration);
        },
        clear: function () { Stride11Fade.clear(); },
        config: function (overrides) { applyOverrides(overrides); return params; },
        resetConfig: resetConfig,
        state: Stride11Fade,
        params: params,
        rebuildMap: function () { _mapKey = ''; return revealMapBitmap(); }
    };
})();
