/*
 * MV ランタイムで MZ形式のプラグインコマンドが動くかの検証。
 *
 * MV で作ったプロジェクトを MZ で変換すると、データは MZ 形式になるのに
 * ランタイムが MV のまま残ることがある。そのときイベントには MZ 形式の
 * プラグインコマンド（コマンド357）が書き込まれるが、MV のインタプリタには
 * command357 が無いので黙って読み飛ばされる。その橋渡しを確かめる。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, 'Stride11Fade.js');
const source = fs.readFileSync(SRC, 'utf8');

const PLUGIN_PARAMS = {
    stride: '11', dotPixelW: '1', dotPixelH: '1',
    planeOrder: 'brg', defaultDuration: '86', mapImage: ''
};

/**
 * ツクール本体のスタブを組み立ててプラグインを読み込む。
 * @param {boolean} isMZ true なら MZ 相当（registerCommand と command357 がある）
 */
function loadPlugin(isMZ) {
    const registered = {};

    function Sprite() {}
    Sprite.prototype.initialize = function () {};
    Sprite.prototype.update = function () {};

    function Bitmap() {}

    function Scene_Base() {}
    Scene_Base.prototype.start = function () {};
    Scene_Base.prototype.update = function () {};

    function Game_Interpreter() {}
    Game_Interpreter.prototype.wait = function (n) { this._waited = n; };
    if (isMZ) {
        // MZ の本体が持っている実装（触られていないことを確認するための目印）
        Game_Interpreter.prototype.command357 = function () { this._engineCommand357 = true; return true; };
    } else {
        // MV は pluginCommand を持ち、command357 を持たない
        Game_Interpreter.prototype.pluginCommand = function () { this._enginePluginCommand = true; };
    }

    const PluginManager = {
        parameters: (n) => (n === 'Stride11Fade' ? PLUGIN_PARAMS : {}),
        _commands: {}
    };
    if (isMZ) {
        PluginManager.registerCommand = function (p, c, fn) { registered[p + ':' + c] = fn; };
        PluginManager.callCommand = function (self, p, c, args) {
            const fn = registered[p + ':' + c];
            if (fn) fn.bind(self)(args);
        };
        PluginManager._engineRegisterCommand = PluginManager.registerCommand;
    }

    const ctx = {
        console, window: {}, Sprite, Bitmap, Scene_Base, Game_Interpreter, PluginManager,
        Graphics: { width: 816, height: 624 },
        ImageManager: { loadPicture: (n) => ({ picture: n }) },
        PIXI: isMZ
            ? {
                VERSION: '5.3.3',
                BLEND_MODES: { SCREEN: 4, MULTIPLY: 2 },
                SCALE_MODES: { LINEAR: 1, NEAREST: 0 },
                Filter: function (v, f, u) { this.uniforms = u; }
            }
            : {
                // MV は PIXI 4。uniforms は {type, value} で宣言し、
                // filter.uniforms.name では値そのものが読み書きできる
                VERSION: '4.5.4',
                BLEND_MODES: { SCREEN: 4, MULTIPLY: 2 },
                SCALE_MODES: { LINEAR: 1, NEAREST: 0 },
                Filter: function (v, f, u) {
                    this.uniforms = {};
                    for (const k in u) {
                        const d = u[k];
                        this.uniforms[k] = (d && d.value !== undefined) ? d.value : d;
                    }
                }
            }
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return { ctx, registered, Game_Interpreter, PluginManager, API: ctx.window.Stride11Fade };
}

let pass = 0, fail = 0;
function check(label, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; console.log('  ok   ' + label); }
    else { fail++; console.log('  FAIL ' + label + '\n        期待 ' + e + ' / 実際 ' + a); }
}

console.log('\n[1] MV では橋渡しが入る');
const mv = loadPlugin(false);
check('registerCommand が生える', typeof mv.PluginManager.registerCommand, 'function');
check('callCommand が生える', typeof mv.PluginManager.callCommand, 'function');
check('command357 が生える', typeof mv.Game_Interpreter.prototype.command357, 'function');
check('コマンドが登録されている',
      Object.keys(mv.PluginManager._commands).sort(),
      ['Stride11Fade:clear', 'Stride11Fade:fadeIn', 'Stride11Fade:fadeOut', 'Stride11Fade:resetConfig']);
check('MV のテキストコマンドも残っている', typeof mv.Game_Interpreter.prototype.pluginCommand, 'function');

console.log('\n[2] MZ形式のプラグインコマンドが MV で動く');
/* MZ のエディタが書き込むコマンド357の中身:
   [プラグイン名, コマンド名, 表示用テキスト, 引数オブジェクト] */
let it = new mv.Game_Interpreter();
it._params = ['Stride11Fade', 'fadeIn', 'Stride11 フェードイン', {
    color: 'black', duration: '0', wait: 'true',
    stride: '0', dotPixelW: '0', dotPixelH: '0', planeOrder: 'keep', mapImage: ''
}];
check('戻り値', it.command357(), true);
check('フェードが始まる', mv.API.state.mode, 'in');
check('既定の時間が使われる', mv.API.state.duration, 86);
check('ウェイトが入る', it._waited, 86);

console.log('\n[3] 引数もそのまま効く');
it = new mv.Game_Interpreter();
it._params = ['Stride11Fade', 'fadeOut', 'Stride11 フェードアウト', {
    color: 'white', duration: '120', wait: 'false',
    stride: '13', dotPixelW: '0', dotPixelH: '2', planeOrder: 'grb', mapImage: ''
}];
it.command357();
check('色', mv.API.state.white, true);
check('向き', mv.API.state.mode, 'out');
check('時間', mv.API.state.duration, 120);
check('ウェイト無し', it._waited, undefined);
check('ストライド', mv.API.params.stride, 13);
check('縦ピクセル', mv.API.params.dotPixelH, 2);
check('プレーン順', mv.API.params.planeOrder, 'grb');

console.log('\n[4] 覆いの解除と設定リセット');
it = new mv.Game_Interpreter();
it._params = ['Stride11Fade', 'clear', '覆いを解除', {}];
it.command357();
check('解除', mv.API.state.mode, 'off');
it._params = ['Stride11Fade', 'resetConfig', '設定をリセット', {}];
it.command357();
check('リセット', [mv.API.params.stride, mv.API.params.dotPixelH, mv.API.params.planeOrder], [11, 1, 'brg']);

console.log('\n[5] 知らないコマンドは黙って無視する');
it = new mv.Game_Interpreter();
it._params = ['ほかのプラグイン', 'なにか', '', {}];
check('落ちない', it.command357(), true);

console.log('\n[6] 引数が無くても落ちない');
it = new mv.Game_Interpreter();
it._params = ['Stride11Fade', 'clear', '覆いを解除'];
check('args 無し', it.command357(), true);

console.log('\n[7] MZ では本体の実装に一切触らない');
const mz = loadPlugin(true);
check('registerCommand は本体のまま',
      mz.PluginManager.registerCommand === mz.PluginManager._engineRegisterCommand, true);
it = new mz.Game_Interpreter();
it._params = ['Stride11Fade', 'fadeIn', '', {}];
it.command357();
check('command357 は本体のまま（差し替えられていない）', it._engineCommand357, true);
check('本体の command357 が呼ばれたのでフェードは走らない', mz.API.state.mode, 'off');

console.log('\n[8] MV のテキストコマンドは従来どおり');
it = new mv.Game_Interpreter();
mv.Game_Interpreter.prototype.pluginCommand.call(it, 'Stride11フェードイン', ['黒', '86']);
check('従来の書き方', mv.API.state.mode, 'in');
check('時間', mv.API.state.duration, 86);

console.log('\n========================================');
console.log('  ok: ' + pass + ' / fail: ' + fail);
console.log('========================================');
process.exit(fail ? 1 : 0);
