/**
 * stride11_fade.jsx
 * Stride11 フェード（PC-8801mkIISR）を After Effects に組み立てるスクリプト。
 *
 * 使い方:
 *   1) tools/ae/index.html でリビールマップ (PNG) を書き出す
 *   2) 元レイヤーと重ね合わせレイヤーが載ったコンポを開く
 *   3) その 2 枚を選択（下に来るほうが元画像）
 *   4) ファイル > スクリプト > スクリプトファイルを実行… で本ファイルを選ぶ
 *
 * しくみ:
 *   リビールマップの明度 v は「そのセルが塗られる順番」(1-254、暗いほど早い)。
 *   マスクレイヤーに「しきい値」エフェクトをかけ、レベル L を 0→最大 へ動かすと
 *       v >= L … 白
 *       v <  L … 黒
 *   になる。重ね合わせレイヤーに **ルミナンス反転** トラックマットを掛ければ
 *   「黒の部分＝v < L の部分」だけが出る。これが掃引そのもの。
 *   L=0 で全部隠れ、L=最大 で全部出る (マップの最大値は 254 なので必ず全開になる)。
 *   マップの最小値が 1 なのも意図的。AE の「しきい値」は輝度 0 の画素を
 *   決して黒にしないので、v=0 のセルだけが永遠に塗り残る（実測済み）。
 *   古いマップ（v=0 を含む）を使うと上端に黒い破片が残る。作り直すこと。
 *
 *   3 プレーンは同じマップを 1/3 ずつ遅らせて 3 回使うだけ。
 *
 * 実装メモ:
 *   ・プロパティは表示名ではなく matchName / 能力 (canVaryOverTime) で引く。
 *     表示名は言語版で変わるため。
 *   ・Levels (ADBE Easy Levels2) は AE 26 でレベル系プロパティが
 *     canSetExpression / canVaryOverTime とも false だったため使わない。
 *   ・失敗しても、取得できたプロパティ一覧をコピーできるダイアログに出して止まる。
 */

(function stride11Fade() {
  'use strict';

  var SCRIPT = 'Stride11 フェード';
  var log = [];
  function L(s) { log.push(s === undefined ? '' : String(s)); }

  /* ------------------------------------------------------------ 診断表示 */
  function showLog(title) {
    var w = new Window('dialog', SCRIPT + ' — ' + title);
    w.alignChildren = 'fill';
    var t = w.add('edittext', undefined, log.join('\n'), { multiline: true, scrolling: true });
    t.characters = 92;
    // 画面の高さに収める。長いログだとダイアログが伸びて閉じるボタンに届かなくなる
    var screenH = 900;
    try { screenH = $.screens[0].bottom - $.screens[0].top; } catch (e) {}
    var boxH = Math.max(200, Math.min(620, screenH - 240));
    t.minimumSize.height = boxH;
    t.maximumSize.height = boxH;
    var g = w.add('group'); g.alignment = 'right';
    g.add('statictext', undefined, 'Ctrl+A → Ctrl+C で全部コピーできます。');
    g.add('button', undefined, '閉じる', { name: 'ok' });
    w.show();
  }

  /* -------------------------------------------------------------- utils */
  function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }

  /* 同じ内容を何度も出さないための覚え書き。ログが画面に収まらなくなるため */
  var seenDump = {}, seenFx = {};

  /** i 番目のプロパティを安全に取る。触るだけで例外を投げるものがある */
  function propAt(group, i) {
    return safe(function () { return group.property(i); }, null);
  }

  function propCount(group) {
    return safe(function () { return group.numProperties; }, 0);
  }

  /**
   * プロパティ一覧をログに出す。
   *
   * matchName や name を読むだけで「数値結果が無効です」を投げるプロパティが
   * 実在する（AE 26 の塗りで踏んだ）。診断のための出力でスクリプトを止めては
   * 本末転倒なので、一つずつ包んで、読めないものは読めないと書いて先へ進む。
   */
  /**
   * 値を「文字列にするところまで」包む。
   *
   * 取得そのものは通っても、連結するときの文字列化で落ちる値がある。
   * safe() の外で連結していると、そこで投げられたぶんは捕まえられない。
   */
  function safeStr(fn, dflt) {
    return safe(function () {
      var v = fn();
      return (v === undefined || v === null) ? String(dflt) : String(v);
    }, dflt);
  }

  /** 同じラベルの一覧は一度だけ出す */
  function dumpOnce(group, label) {
    if (seenDump[label]) { L('（' + label + ' の一覧は既出のため省略）'); return; }
    seenDump[label] = true;
    dumpGroup(group, label);
  }

  function dumpGroup(group, label) {
    L('--- ' + label + ' のプロパティ一覧 ---');
    try {
      var n = propCount(group);
      for (var i = 1; i <= n; i++) {
        var pr = propAt(group, i);
        if (!pr) { L('  [' + i + '] （取得できません）'); continue; }
        var line = '  [' + i + '] ';
        line += safeStr(function () { return pr.matchName; }, '?');
        line += '  "' + safeStr(function () { return pr.name; }, '?') + '"';
        line += '  expr:' + (safe(function () { return pr.canSetExpression; }, false) ? 'OK' : 'NG');
        line += '  key:' + (safe(function () { return pr.canVaryOverTime; }, false) ? 'OK' : 'NG');
        line += '  type:' + safeStr(function () { return pr.propertyValueType; }, '?');
        line += '  value=' + safeStr(function () { return pr.value; }, '-');
        L(line);
      }
    } catch (e) {
      // 一覧を出すだけのものが実行を止めては本末転倒
      L('  （一覧の取得を打ち切りました: ' + safeStr(function () { return e.toString(); }, '?') + '）');
    }
    L('---');
  }

  /** アニメートできる 1 次元プロパティを先頭から探す（名前に依存しない） */
  function firstAnimatableOneD(group) {
    var n = propCount(group);
    for (var i = 1; i <= n; i++) {
      var pr = propAt(group, i);
      if (!pr) continue;
      var ok = safe(function () {
        return pr.propertyValueType === PropertyValueType.OneD && pr.canVaryOverTime;
      }, false);
      if (ok) return pr;
    }
    return null;
  }

  /** 候補の matchName を順に試してエフェクトを追加する */
  function addEffectAny(layer, candidates, label) {
    var parade = layer.property('ADBE Effect Parade');
    for (var i = 0; i < candidates.length; i++) {
      try {
        var fx = parade.addProperty(candidates[i]);
        if (!seenFx[label]) {
          seenFx[label] = true;
          L(label + ' に ' + candidates[i] + ' を使用');
        }
        return fx;
      } catch (e) {}
    }
    // 見つからないので、インストール済みエフェクトから候補を探して報告する
    L('■ ' + label + ' のエフェクトを追加できませんでした。候補: ' + candidates.join(', '));
    try {
      var key = label.toLowerCase();
      L('  インストール済みで名前が近いもの:');
      for (var j = 0; j < app.effects.length; j++) {
        var e2 = app.effects[j];
        if (e2.matchName.toLowerCase().indexOf(key) >= 0 ||
            String(e2.displayName).toLowerCase().indexOf(key) >= 0) {
          L('    ' + e2.matchName + '  "' + e2.displayName + '"  [' + e2.category + ']');
        }
      }
    } catch (e3) { L('  app.effects を列挙できませんでした: ' + e3.toString()); }
    throw new Error(label + ' のエフェクトを追加できませんでした');
  }

  /** トランスフォームをそのまま写す（表示名に依存しない JS アクセサ経由） */
  function copyTransform(dst, src) {
    dst.transform.anchorPoint.setValue(src.transform.anchorPoint.value);
    dst.transform.position.setValue(src.transform.position.value);
    dst.transform.scale.setValue(src.transform.scale.value);
    dst.transform.rotation.setValue(src.transform.rotation.value);
    dst.transform.opacity.setValue(src.transform.opacity.value);
  }

  function setTrackMatte(layer, matteLayer, inverted) {
    var type = inverted ? TrackMatteType.LUMA_INVERTED : TrackMatteType.LUMA;
    try { layer.setTrackMatte(matteLayer, type); return 'setTrackMatte()'; } catch (e) {}
    try { layer.trackMatteType = type; return 'trackMatteType'; } catch (e2) {}
    throw new Error('トラックマットを設定できませんでした: ' + e2);
  }

  /** 式かキーフレームで値を直線的に動かす。
   *  式は「設定できた」だけでは信用せず、expressionError で評価まで確認する。
   *  （日本語版 AE では英語のプロパティ名が解決できず、設定は通るのに
   *    評価時に落ちることがあるため） */
  function driveLinear(prop, ownerGroup, useExpr, exprText, t0, v0, t1, v1) {
    if (useExpr && safe(function () { return prop.canSetExpression; }, false)) {
      try {
        prop.expression = exprText;
        var err = safe(function () { return prop.expressionError; }, '');
        if (!err) return '式';
        L('  ⚠ 式が評価エラー → キーフレームに切替');
        L('     ' + err);
        try { prop.expression = ''; } catch (e0) {}
      } catch (e) { L('  ⚠ 式の設定に失敗 → キーフレームに切替: ' + e.toString()); }
    }
    if (!safe(function () { return prop.canVaryOverTime; }, false)) {
      dumpGroup(ownerGroup, 'アニメートできなかったエフェクト');
      throw new Error('"' + prop.name + '" は式もキーフレームも受け付けません（上の一覧を送ってください）');
    }
    prop.setValueAtTime(t0, v0);
    prop.setValueAtTime(t1, v1);
    for (var k = 1; k <= prop.numKeys; k++) {
      try { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (e2) {}
    }
    return 'キーフレーム';
  }

  /* ---------------------------------------------------------------- 前提 */
  var comp = app.project.activeItem;
  if (!(comp && comp instanceof CompItem)) {
    alert(SCRIPT + '\n\nコンポジションを開いてから実行してください。');
    return;
  }
  if (comp.selectedLayers.length !== 2) {
    alert(SCRIPT + '\n\n元レイヤーと重ね合わせレイヤーの 2 枚を選択してから実行してください。\n' +
          '（下に来るほうが元画像です）');
    return;
  }
  var s0 = comp.selectedLayers[0], s1 = comp.selectedLayers[1];
  var baseLayer = (s0.index > s1.index) ? s0 : s1;
  var ovlLayer = (s0.index > s1.index) ? s1 : s0;

  /* ---------------------------------------------------------------- 設定 */
  var dlg = new Window('dialog', SCRIPT);
  dlg.alignChildren = 'fill';

  var g0 = dlg.add('panel', undefined, 'レイヤー');
  g0.alignChildren = 'left';
  g0.add('statictext', undefined, '元画像（下）    : ' + baseLayer.name);
  g0.add('statictext', undefined, '重ね合わせ（上）: ' + ovlLayer.name);

  var g1 = dlg.add('panel', undefined, 'リビールマップ');
  g1.alignChildren = 'fill';
  var pathRow = g1.add('group');
  var pathTxt = pathRow.add('edittext', undefined, ''); pathTxt.characters = 46;
  var browse = pathRow.add('button', undefined, '参照…');

  var g2 = dlg.add('panel', undefined, 'フェード');
  g2.alignChildren = 'left';
  var r1 = g2.add('group');
  r1.add('statictext', undefined, 'プレーン順');
  var planesDd = r1.add('dropdownlist', undefined, [
    '青 → 赤 → 緑（PC-88実機 5CH/5DH/5EH）',
    '緑 → 赤 → 青（逆順）',
    '赤 → 緑 → 青',
    '3プレーン同時（マスク1枚）'
  ]);
  planesDd.selection = 0;
  var r2 = g2.add('group');
  r2.add('statictext', undefined, '尺 (秒)');
  var durTxt = r2.add('edittext', undefined, '1.44'); durTxt.characters = 6;
  r2.add('statictext', undefined, '  開始時刻 (秒)');
  var startTxt = r2.add('edittext', undefined, '0'); startTxt.characters = 6;
  var rdir = g2.add('group');
  rdir.add('statictext', undefined, '向き');
  var dirDd = rdir.add('dropdownlist', undefined, ['出現（フェードイン）', '消滅（フェードアウト）']);
  dirDd.selection = 0;
  var exprCb = g2.add('checkbox', undefined, '式で駆動できるなら式を使う（Fade Progress スライダー1本で制御）');
  exprCb.value = true;
  var diagCb = g2.add('checkbox', undefined, 'プロパティ一覧を診断ログに出す');
  diagCb.value = true;

  var gb = dlg.add('group'); gb.alignment = 'right';
  var okBtn = gb.add('button', undefined, '組み立てる', { name: 'ok' });
  var cancelBtn = gb.add('button', undefined, 'キャンセル', { name: 'cancel' });

  browse.onClick = function () {
    var f = File.openDialog('リビールマップ PNG を選択', '*.png');
    if (f) pathTxt.text = f.fsName;
  };
  var go = false;
  okBtn.onClick = function () {
    if (!pathTxt.text) { alert('リビールマップ PNG を指定してください。'); return; }
    go = true; dlg.close();
  };
  cancelBtn.onClick = function () { dlg.close(); };
  dlg.show();
  if (!go) return;

  /* プレーン順。ch は RGBA のチャンネル番号 (R=0, G=1, B=2)。
     マップ自体はプレーン順に依存しないので、生成し直す必要はない。 */
  var PLANE_SETS = {
    brg: [{ name: 'blue', ch: 2 }, { name: 'red', ch: 0 }, { name: 'green', ch: 1 }],
    grb: [{ name: 'green', ch: 1 }, { name: 'red', ch: 0 }, { name: 'blue', ch: 2 }],
    rgb: [{ name: 'red', ch: 0 }, { name: 'green', ch: 1 }, { name: 'blue', ch: 2 }],
    all: [{ name: 'rgb', ch: -1 }]
  };
  var ORDER_KEYS = ['brg', 'grb', 'rgb', 'all'];

  var orderKey = ORDER_KEYS[planesDd.selection.index];
  var phases = PLANE_SETS[orderKey];
  var nPlanes = phases.length;
  var duration = parseFloat(durTxt.text) || 1.44;
  var startAt = parseFloat(startTxt.text) || 0;
  var useExpr = exprCb.value;
  var fadeOut = (dirDd.selection.index === 1);

  var THRESHOLD_FX = ['ADBE Threshold2', 'ADBE Threshold', 'CC Threshold', 'CC Threshold RGB'];
  var SC = {
    src1: 'ADBE Set Channels-0001', useR: 'ADBE Set Channels-0002',
    src2: 'ADBE Set Channels-0003', useG: 'ADBE Set Channels-0004',
    src3: 'ADBE Set Channels-0005', useB: 'ADBE Set Channels-0006',
    src4: 'ADBE Set Channels-0007', useA: 'ADBE Set Channels-0008'
  };
  function byMatch(group, mn) {
    // matchName は直接引ける。列挙は触るだけで落ちるプロパティがあるので最後の手段
    var direct = safe(function () { return group.property(mn); }, null);
    if (direct) return direct;
    var n = propCount(group);
    for (var i = 1; i <= n; i++) {
      var pr = propAt(group, i);
      if (pr && safe(function () { return pr.matchName; }, '') === mn) return pr;
    }
    return null;
  }

  /* ---------------------------------------------------------------- 実行 */
  var failed = false;
  app.beginUndoGroup(SCRIPT);
  try {
    L('AE ' + app.version);
    L('コンポ: ' + comp.name + ' ' + comp.width + '×' + comp.height + ' / ' + comp.frameRate + 'fps');
    L('プレーン順: ' + orderKey + ' = ' + (function () {
      var a = []; for (var i = 0; i < phases.length; i++) a.push(phases[i].name); return a.join(' → ');
    })());
    L('');

    /* --- マップ --------------------------------------------------------- */
    var mapFile = new File(pathTxt.text);
    if (!mapFile.exists) throw new Error('マップ PNG が見つかりません: ' + pathTxt.text);
    var io = new ImportOptions(mapFile);
    io.importAs = ImportAsType.FOOTAGE;
    var mapItem = app.project.importFile(io);
    mapItem.name = 'revealmap';
    L('マップを読み込み: ' + mapItem.width + '×' + mapItem.height);
    if (mapItem.width !== comp.width || mapItem.height !== comp.height) {
      L('⚠ マップがコンポと違うサイズです。コンポと同じサイズで書き出し直してください。');
    }

    /* --- 操作用ヌル ----------------------------------------------------- */
    var ctrl = comp.layers.addNull(comp.duration);
    ctrl.name = 'Stride11 Fade CTRL';
    ctrl.enabled = false;
    var slider = addEffectAny(ctrl, ['ADBE Slider Control'], 'スライダー制御');
    slider.name = 'Fade Progress';
    var sliderProp = byMatch(slider, 'ADBE Slider Control-0001') || firstAnimatableOneD(slider);
    if (!sliderProp) { dumpGroup(slider, 'スライダー制御'); throw new Error('スライダーのプロパティを取得できませんでした'); }
    // 消滅は出現の逆再生。スライダーを逆に振るだけで、下流はそのまま使える
    sliderProp.setValueAtTime(startAt, fadeOut ? 100 : 0);
    sliderProp.setValueAtTime(startAt + duration, fadeOut ? 0 : 100);
    for (var k = 1; k <= sliderProp.numKeys; k++) {
      try { sliderProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (e) {}
    }
    L('Fade Progress: ' + startAt + 's → ' + (startAt + duration) + 's');
    L(fadeOut ? '向き: 消滅（出現の逆再生）' : '向き: 出現');
    // プロパティは名前ではなくインデックスで参照する。
    // 表示名は言語版で変わるため（日本語版のスライダーは "Slider" ではなく「スライダー」）。
    var compRef = String(comp.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var CTRL_EXPR = 'comp("' + compRef + '").layer("Stride11 Fade CTRL").effect("Fade Progress")(1)';

    /* --- プレーンごとの MIX コンポ -------------------------------------- */
    var mixComps = [];
    var unit = null;
    for (var p = 0; p < nPlanes; p++) {
      var mix = app.project.items.addComp(
        'MIX_' + p + '_' + phases[p].name, comp.width, comp.height,
        comp.pixelAspect, comp.duration, comp.frameRate);

      var b = mix.layers.add(baseLayer.source); b.name = 'BASE';
      var o = mix.layers.add(ovlLayer.source);  o.name = 'OVERLAY';
      try {
        copyTransform(o, ovlLayer);
        copyTransform(b, baseLayer);
        if (p === 0) L('元 / 重ね合わせのトランスフォームを引き継ぎました');
      } catch (e) { L('⚠ トランスフォーム引き継ぎに失敗: ' + e.toString()); }

      var m = mix.layers.add(mapItem, comp.duration); m.name = 'MASK_' + p;
      var thr = addEffectAny(m, THRESHOLD_FX, 'しきい値');
      if (p === 0 && diagCb.value) dumpOnce(thr, 'しきい値');

      var lvlProp = firstAnimatableOneD(thr);
      if (!lvlProp) { dumpGroup(thr, 'しきい値'); throw new Error('しきい値のレベルに使えるプロパティが見つかりません'); }

      if (unit === null) {
        // レベルの既定値は中央付近 (0-255 なら 127、0-1 なら 0.5)
        unit = (lvlProp.value > 1.5) ? 255 : 1;
        L('しきい値プロパティ: "' + lvlProp.name + '" (' + lvlProp.matchName + ') 既定値 ' +
          lvlProp.value + ' → 値域 0-' + unit);
      }

      /* 消滅は出現の逆再生。式で駆動するならスライダーが逆に振れるので
         そのままでよいが、キーフレームの場合は時間も値も入れ替える必要がある */
      var tp0, tp1, tv0, tv1;
      if (fadeOut) {
        tp0 = startAt + duration * (nPlanes - p - 1) / nPlanes; tv0 = unit;
        tp1 = startAt + duration * (nPlanes - p) / nPlanes;     tv1 = 0;
      } else {
        tp0 = startAt + duration * p / nPlanes;       tv0 = 0;
        tp1 = startAt + duration * (p + 1) / nPlanes; tv1 = unit;
      }
      var expr =
        'var tau  = ' + CTRL_EXPR + ' / 100;\n' +
        'var prog = Math.max(0, Math.min(1, ' + nPlanes + ' * tau - ' + p + '));\n' +
        String(unit) + ' * prog;';

      var how = driveLinear(lvlProp, thr, useExpr, expr, tp0, tv0, tp1, tv1);
      if (p === 0) {
        L('しきい値の駆動方法: ' + how);
        if (how === '式') {
          L('  式:');
          var el = expr.split('\n');
          for (var ei = 0; ei < el.length; ei++) L('    ' + el[ei]);
        } else {
          L('  キーフレーム: プレーン p は [尺×p/' + nPlanes + ', 尺×(p+1)/' + nPlanes +
            '] を 0→' + unit + ' で通ります');
        }
      }

      // v >= L が白なので、出したいのは黒側 → ルミナンス反転マット
      var tm = setTrackMatte(o, m, true);
      if (p === 0) L('トラックマット: ルミナンス反転 (' + tm + ')');

      mixComps.push(mix);
      L('作成: ' + mix.name);
    }

    /* --- マスターコンポ ------------------------------------------------- */
    if (nPlanes === 1) {
      var single = comp.layers.add(mixComps[0]);
      single.name = 'Stride11 Fade OUT';
      single.moveToBeginning();
      L('1 プレーン構成: MIX コンポをそのまま配置しました');
    } else {
      var refs = [];
      for (var q = 0; q < 3; q++) {
        var rl = comp.layers.add(mixComps[q]);
        rl.enabled = false; rl.moveToBeginning();
        refs.push(rl);
      }
      var baseRef = comp.layers.add(baseLayer.source);
      baseRef.name = 'ALPHA SOURCE';
      try { copyTransform(baseRef, baseLayer); }
      catch (e) { L('⚠ ALPHA SOURCE のトランスフォーム引き継ぎに失敗: ' + e.toString()); }
      baseRef.enabled = false; baseRef.moveToBeginning();

      var sol = comp.layers.addSolid([0, 0, 0], 'Stride11 Fade OUT',
        comp.width, comp.height, comp.pixelAspect, comp.duration);
      sol.moveToBeginning();

      var sc = addEffectAny(sol, ['ADBE Set Channels'], 'Set Channels');
      if (diagCb.value) dumpOnce(sc, 'Set Channels');

      // チャンネル c を担当する位相を引く（プレーン順に追従させる）
      var phaseOf = [0, 0, 0];
      for (var pi2 = 0; pi2 < phases.length; pi2++) {
        if (phases[pi2].ch >= 0) phaseOf[phases[pi2].ch] = pi2;
      }
      var pairs = [
        [SC.src1, refs[phaseOf[0]], SC.useR, 1],   // 赤
        [SC.src2, refs[phaseOf[1]], SC.useG, 2],   // 緑
        [SC.src3, refs[phaseOf[2]], SC.useB, 3],   // 青
        [SC.src4, baseRef,          SC.useA, 4]    // アルファ
      ];
      var scOk = 0;
      for (var j = 0; j < pairs.length; j++) {
        var srcProp = byMatch(sc, pairs[j][0]);
        var useProp = byMatch(sc, pairs[j][2]);
        if (!srcProp || !useProp) { L('⚠ Set Channels: ' + pairs[j][0] + ' / ' + pairs[j][2] + ' が見つかりません'); continue; }
        try { srcProp.setValue(pairs[j][1].index); useProp.setValue(pairs[j][3]); scOk++; }
        catch (e) { L('⚠ Set Channels の設定に失敗: ' + e.toString()); }
      }
      L('Set Channels: ' + scOk + ' / 4 組を設定');
      if (scOk < 4) L('⚠ 一部設定できていません。上の一覧を送ってください。');
    }

    baseLayer.enabled = false;
    ovlLayer.enabled = false;
    L('元の 2 レイヤーはビデオ OFF にしました（中身は MIX コンポ内にあります）');
    L('');
    L('完了。"Stride11 Fade CTRL" の Fade Progress (0→100) がフェードの進行です。');
    L('※ 動きが直線的でないと感じたら、プロジェクト設定 > カラー > 作業用スペースを');
    L('   「なし」にするか、revealmap フッテージのカラープロファイル解釈を合わせてください。');

  } catch (err) {
    failed = true;
    L('');
    L('■ 中断: ' + err.toString());
    if (err.line) L('  行 ' + err.line);
    L('');
    L('※ Ctrl+Z（1 回）で、このスクリプトが作ったものは取り消せます。');
    L('   読み込んだ revealmap フッテージだけはプロジェクトパネルに残ります。');
  } finally {
    app.endUndoGroup();
  }

  showLog(failed ? '中断しました' : '完了');
})();
