/* プラグインコマンド引数の検証。ツクール本体の最小スタブを噛ませて読み込む。 */
const fs = require('fs');
const vm = require('vm');

const SRC = require('path').join(__dirname, 'Stride11Fade.js');

/* --- プラグインパラメータ（既定値を入れておく） --- */
const PLUGIN_PARAMS = {
    stride: '11',
    dotPixelW: '1',
    dotPixelH: '1',
    planeOrder: 'brg',
    defaultDuration: '86',
    mapImage: ''
};

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

const ctx = {
    console,
    window: {},
    Sprite, Bitmap, Scene_Base, Game_Interpreter,
    Graphics: { width: 816, height: 624 },
    ImageManager: { loadPicture: (n) => ({ picture: n }) },
    PIXI: {
        VERSION: '5.3.3',
        BLEND_MODES: { SCREEN: 4, MULTIPLY: 2 },
        SCALE_MODES: { LINEAR: 1, NEAREST: 0 },
        Filter: function () { this.uniforms = {}; }
    },
    PluginManager: {
        parameters: (name) => (name === 'Stride11Fade' ? PLUGIN_PARAMS : {}),
        registerCommand: (plugin, cmd, fn) => { registered[cmd] = fn; }
    }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);

const API = ctx.window.Stride11Fade;
const P = API.params;

/* --- テスト骨組み --- */
let pass = 0, fail = 0;
function check(label, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; console.log('  ok   ' + label); }
    else { fail++; console.log('  FAIL ' + label + '\n        期待 ' + e + ' / 実際 ' + a); }
}
function snapshot() {
    return { stride: P.stride, dotPixelW: P.dotPixelW, dotPixelH: P.dotPixelH,
             planeOrder: P.planeOrder, defaultDuration: P.defaultDuration, mapImage: P.mapImage };
}
/** MZ のプラグインコマンドを呼ぶ。引数は文字列で来る */
function mz(cmd, args) {
    const interp = new Game_Interpreter();
    registered[cmd].call(interp, args || {});
    return interp;
}
/** MV のプラグインコマンドを呼ぶ */
function mv(command, args) {
    const interp = new Game_Interpreter();
    Game_Interpreter.prototype.pluginCommand.call(interp, command, args);
    return interp;
}
const MZ_NOOP = { color: 'black', duration: '0', wait: 'true',
                  stride: '0', dotPixelW: '0', dotPixelH: '0',
                  planeOrder: 'keep', mapImage: '' };

console.log('\n[1] プラグインパラメータが既定値として読まれる');
check('初期値', snapshot(),
      { stride: 11, dotPixelW: 1, dotPixelH: 1, planeOrder: 'brg', defaultDuration: 86, mapImage: '' });

console.log('\n[2] 無指定（0 / keep / 空欄）では何も変わらない');
mz('fadeIn', MZ_NOOP);
check('無指定後', snapshot(),
      { stride: 11, dotPixelW: 1, dotPixelH: 1, planeOrder: 'brg', defaultDuration: 86, mapImage: '' });
check('mode', API.state.mode, 'in');
check('duration に既定値が使われる', API.state.duration, 86);

console.log('\n[3] MZ: 引数で上書きできる');
mz('fadeIn', Object.assign({}, MZ_NOOP, { stride: '13', dotPixelH: '2', planeOrder: 'grb', duration: '120' }));
check('stride', P.stride, 13);
check('dotPixelH', P.dotPixelH, 2);
check('planeOrder', P.planeOrder, 'grb');
check('dotPixelW は触られない', P.dotPixelW, 1);
check('duration 引数が効く', API.state.duration, 120);

console.log('\n[4] 上書きは次回以降も維持される');
mz('fadeOut', MZ_NOOP);
check('stride 維持', P.stride, 13);
check('planeOrder 維持', P.planeOrder, 'grb');
check('duration は毎回既定へ戻る', API.state.duration, 86);

console.log('\n[5] 設定をリセット');
mz('resetConfig');
check('リセット後', snapshot(),
      { stride: 11, dotPixelW: 1, dotPixelH: 1, planeOrder: 'brg', defaultDuration: 86, mapImage: '' });

console.log('\n[6] プレーン順の3択とエイリアス');
const orders = [['brg', 'brg'], ['grb', 'grb'], ['all', 'all'],
                ['正順', 'brg'], ['逆順', 'grb'], ['同時', 'all'], ['3プレーン同時', 'all']];
for (const [input, expected] of orders) {
    mz('resetConfig');
    mz('fadeIn', Object.assign({}, MZ_NOOP, { planeOrder: input }));
    check('planeOrder="' + input + '"', P.planeOrder, expected);
}
mz('resetConfig');
mz('fadeIn', Object.assign({}, MZ_NOOP, { planeOrder: 'でたらめ' }));
check('未知の値は無視される', P.planeOrder, 'brg');

console.log('\n[7] 範囲外の値はクランプされる');
mz('resetConfig');
mz('fadeIn', Object.assign({}, MZ_NOOP, { stride: '999', dotPixelW: '99' }));
check('stride 上限 255', P.stride, 255);
check('dotPixelW 上限 16', P.dotPixelW, 16);

console.log('\n[8] リビールマップ画像');
mz('resetConfig');
mz('fadeIn', Object.assign({}, MZ_NOOP, { mapImage: 'myMap' }));
check('指定した画像名が入る', P.mapImage, 'myMap');
mz('fadeIn', MZ_NOOP);
check('空欄では消えない', P.mapImage, 'myMap');
mz('resetConfig');
check('リセットで戻る', P.mapImage, '');

console.log('\n[9] MV: 位置引数（従来の書き方が壊れていない）');
mz('resetConfig');
let it = mv('Stride11フェードイン', ['黒', '86']);
check('色=黒', API.state.white, false);
check('duration', API.state.duration, 86);
check('ウェイトが入る', it._waited, 86);
mv('Stride11フェードアウト', ['白', '120']);
check('色=白', API.state.white, true);
check('mode=out', API.state.mode, 'out');
check('duration', API.state.duration, 120);
mv('Stride11フェード解除', []);
check('解除で off', API.state.mode, 'off');

console.log('\n[10] MV: key=value による上書き');
mz('resetConfig');
mv('Stride11フェードイン', ['黒', '86', 'stride=13', '縦=2', '順=逆順']);
check('stride', P.stride, 13);
check('dotPixelH', P.dotPixelH, 2);
check('planeOrder', P.planeOrder, 'grb');
check('色は位置引数のまま読める', API.state.white, false);
check('時間も位置引数のまま読める', API.state.duration, 86);

console.log('\n[11] MV: key=value だけでも位置引数を誤読しない');
mz('resetConfig');
mv('Stride11フェードイン', ['stride=7']);
check('stride', P.stride, 7);
check('色は既定の黒', API.state.white, false);
check('時間は既定値', API.state.duration, 86);

console.log('\n[12] MV: 英語別名と設定リセット');
mv('stride11ResetConfig', []);
check('stride11ResetConfig', snapshot(),
      { stride: 11, dotPixelW: 1, dotPixelH: 1, planeOrder: 'brg', defaultDuration: 86, mapImage: '' });
mv('stride11FadeOut', ['white', '60', 'plane=all', 'dotw=2']);
check('planeOrder', P.planeOrder, 'all');
check('dotPixelW', P.dotPixelW, 2);
check('white', API.state.white, true);

console.log('\n[13] スクリプトからの呼び出し');
API.resetConfig();
API.fadeIn(false, 86, { stride: 5, planeOrder: '同時' });
check('stride', P.stride, 5);
check('planeOrder', P.planeOrder, 'all');
API.config({ dotPixelH: 2 });
check('config()', P.dotPixelH, 2);
API.resetConfig();
check('resetConfig()', snapshot(),
      { stride: 11, dotPixelW: 1, dotPixelH: 1, planeOrder: 'brg', defaultDuration: 86, mapImage: '' });

console.log('\n[14] params の参照は同一のまま（コンソール監視が切れない）');
check('同一オブジェクト', API.params === P, true);

console.log('\n========================================');
console.log('  ok: ' + pass + ' / fail: ' + fail);
console.log('========================================');
process.exit(fail ? 1 : 0);
