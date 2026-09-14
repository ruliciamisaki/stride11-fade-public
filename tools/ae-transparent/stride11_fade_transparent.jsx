/**
 * stride11_fade_transparent.jsx
 * Stride11 フェードを「透明合成」で After Effects に組み立てるスクリプト。
 *
 * 通常版 (../ae/stride11_fade.jsx) との違い:
 *   通常版は「元画像の上に重ね合わせ画像を出す」構成で、出力は元画像を含む
 *   1 枚のレイヤーになる。こちらは **元画像を指定しない**。重ね合わせ画像だけを
 *   受け取り、その下にあるもの全部に対して効く 2 枚のレイヤーを作る。
 *   背景が動画のときや、背景が後から変わるときに使う。
 *
 * 使い方:
 *   1) ../ae/index.html でリビールマップ (PNG) を書き出す（通常版と同じもの）
 *   2) 重ね合わせたいレイヤーが載ったコンポを開く
 *   3) その 1 枚だけを選択する
 *   4) ファイル > スクリプト > スクリプトファイルを実行… で本ファイルを選ぶ
 *
 * しくみ:
 *   チャンネルごとの透明度は 1 枚のレイヤーでは表現できない。アルファが 1 本
 *   しかないので「赤と緑は下が透けて、青だけ絵が出ている」状態を作れない。
 *   そこで 2 枚に分ける。下から順に
 *
 *     MUL (乗算)  1 - アルファ × マスク   … 出すプレーンのぶんだけ下を削る
 *     ADD (加算)  重ね合わせ × アルファ × マスク … 削った分に絵を足す
 *
 *   重ねると  下 × (1 - a·m) + 絵 × a·m  になり、塗っていないセルは完全に
 *   透明、塗り終わると通常のアルファ合成と厳密に一致する。
 *
 *   MUL の中身は「白い平面の上に、塗り (Fill) で黒くした重ね合わせを、
 *   ルミナンス反転トラックマット付きで置く」だけで作れる。減算合成も
 *   チャンネル演算も要らない。黒がアルファの分だけ白を押し下げるので、
 *   結果がそのまま 1 - アルファ × マスク になる。
 *
 *   マップと 3 プレーンの扱いは通常版と同じ。
 *
 * 実装メモ:
 *   ・プロパティは表示名ではなく matchName / 能力 (canVaryOverTime) で引く。
 *     表示名は言語版で変わるため。
 *   ・Levels (ADBE Easy Levels2) は AE 26 でレベル系プロパティが
 *     canSetExpression / canVaryOverTime とも false だったため使わない。
 *   ・Set Channels のソースレイヤーは、レイヤーを足し終えてから設定する。
 *     途中で足すとレイヤー番号がずれるため。
 *   ・失敗しても、取得できたプロパティ一覧をコピーできるダイアログに出して止まる。
 */

(function stride11FadeTransparent() {
  'use strict';

  var SCRIPT = 'Stride11 フェード（透明合成）';
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
  if (comp.selectedLayers.length !== 1) {
    alert(SCRIPT + '\n\n重ね合わせたいレイヤーを 1 枚だけ選択してから実行してください。\n' +
          '（元画像は指定しません。このレイヤーより下にあるもの全部に効きます）');
    return;
  }
  var ovlLayer = comp.selectedLayers[0];

  /* ---------------------------------------------------------------- 設定 */
  var dlg = new Window('dialog', SCRIPT);
  dlg.alignChildren = 'fill';

  var g0 = dlg.add('panel', undefined, 'レイヤー');
  g0.alignChildren = 'left';
  g0.add('statictext', undefined, '重ね合わせ: ' + ovlLayer.name);
  g0.add('statictext', undefined, '元画像は指定しません。このレイヤーより下が背景になります。');

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

    /* --- プレーンごとに ADD / MUL の 2 つのコンポを作る -------------------- */
    var addComps = [], mulComps = [];
    var unit = null;

    /** リビールマップ＋しきい値のマスクを comp に作り、プレーン p の進行で駆動する */
    function makeMask(intoComp, p, quiet) {
      var m = intoComp.layers.add(mapItem, comp.duration);
      m.name = 'MASK_' + p;
      var thr = addEffectAny(m, THRESHOLD_FX, 'しきい値');
      if (!quiet && diagCb.value) dumpOnce(thr, 'しきい値');

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
      if (!quiet) {
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
      return m;
    }

    /**
     * Set Channels の RGB を、別レイヤーの「アルファ」から取るよう配線する。
     *
     * useX に 4 を入れるとアルファを指す。通常版が「アルファ←元レイヤーのアルファ」で
     * 4 を使っており、同じ列挙なので R/G/B でも 4 がアルファになる。
     * ソースはレイヤー番号で指すので、レイヤーを足し終えてから呼ぶこと。
     */
    function wireAlphaToRGB(sc, srcLayer, verbose) {
      var trio = [[SC.src1, SC.useR], [SC.src2, SC.useG], [SC.src3, SC.useB]];
      var ok = 0;
      for (var t = 0; t < trio.length; t++) {
        var sp = byMatch(sc, trio[t][0]), up = byMatch(sc, trio[t][1]);
        if (!sp || !up) { L('⚠ Set Channels: ' + trio[t][0] + ' / ' + trio[t][1] + ' が見つかりません'); continue; }
        var done = safe(function () { sp.setValue(srcLayer.index); up.setValue(4); return true; }, false);
        if (done) ok++; else L('⚠ Set Channels の設定に失敗しました');
      }
      if (verbose) L('アルファ→RGB の配線: ' + ok + ' / 3 組');
      if (ok < 3) L('⚠ 乗算パスが正しく出ません');
      return ok;
    }

    /** 重ね合わせをコンポへ足す。位置と拡大率は元のレイヤーから写す */
    function addOverlay(intoComp) {
      var o = intoComp.layers.add(ovlLayer.source);
      o.name = 'OVERLAY';
      try { copyTransform(o, ovlLayer); }
      catch (e) { L('⚠ トランスフォーム引き継ぎに失敗: ' + e.toString()); }
      return o;
    }

    for (var p = 0; p < nPlanes; p++) {
      /* 加算パス。黒地の上に、塗り終わったセルだけ重ね合わせを出す。
         → 重ね合わせ × アルファ × マスク */
      var addC = app.project.items.addComp(
        'ADD_' + p + '_' + phases[p].name, comp.width, comp.height,
        comp.pixelAspect, comp.duration, comp.frameRate);
      addC.layers.addSolid([0, 0, 0], 'BLACK', comp.width, comp.height,
        comp.pixelAspect, comp.duration);
      var oa = addOverlay(addC);
      var ma = makeMask(addC, p, p !== 0);
      // v >= L が白なので、出したいのは黒側 → ルミナンス反転マット
      var tmA = setTrackMatte(oa, ma, true);
      if (p === 0) L('トラックマット: ルミナンス反転 (' + tmA + ')');
      addComps.push(addC);

      /* α × マスク を「輝度」として持つコンポ。
         白平面の RGB を Set Channels で重ね合わせのアルファから取り、
         同じマスクを掛けて黒地に置く。色を変える効果は使わない。 */
      var amC = app.project.items.addComp(
        'AM_' + p + '_' + phases[p].name, comp.width, comp.height,
        comp.pixelAspect, comp.duration, comp.frameRate);
      amC.layers.addSolid([0, 0, 0], 'BLACK', comp.width, comp.height,
        comp.pixelAspect, comp.duration);
      var oref = addOverlay(amC);
      oref.name = 'ALPHA SOURCE';
      oref.enabled = false;
      var whiteL = amC.layers.addSolid([1, 1, 1], 'ALPHA', comp.width, comp.height,
        comp.pixelAspect, comp.duration);
      var mmA = makeMask(amC, p, true);
      setTrackMatte(whiteL, mmA, true);
      // レイヤーを足し終えてから配線する（途中で足すと番号がずれる）
      var scA = addEffectAny(whiteL, ['ADBE Set Channels'], 'Set Channels');
      if (p === 0 && diagCb.value) dumpOnce(scA, 'Set Channels');
      wireAlphaToRGB(scA, oref, p === 0);

      /* 乗算パス。白地の上に、α × マスク をアルファに持つ黒を置く。
         → 1 - α × マスク。使っているのは平面とトラックマットだけ。 */
      var mulC = app.project.items.addComp(
        'MUL_' + p + '_' + phases[p].name, comp.width, comp.height,
        comp.pixelAspect, comp.duration, comp.frameRate);
      mulC.layers.addSolid([1, 1, 1], 'WHITE', comp.width, comp.height,
        comp.pixelAspect, comp.duration);
      var blk = mulC.layers.addSolid([0, 0, 0], 'BLACK', comp.width, comp.height,
        comp.pixelAspect, comp.duration);
      var amRef = mulC.layers.add(amC);
      amRef.name = 'AM';
      setTrackMatte(blk, amRef, false);   // 反転しないルミナンスマット
      mulComps.push(mulC);

      L('作成: ' + addC.name + ' / ' + amC.name + ' / ' + mulC.name);
    }

    /* --- マスターコンポ ------------------------------------------------- */
    /* Set Channels のソースはレイヤー番号で指すので、レイヤーを足し終えてから
       まとめて設定する。途中で足すと番号がずれる。 */
    function wireSetChannels(solidLayer, srcLayers, useVals) {
      var sc = addEffectAny(solidLayer, ['ADBE Set Channels'], 'Set Channels');
      if (diagCb.value) dumpOnce(sc, 'Set Channels');
      var pairs = [
        [SC.src1, srcLayers[0], SC.useR, useVals[0]],   // 赤
        [SC.src2, srcLayers[1], SC.useG, useVals[1]],   // 緑
        [SC.src3, srcLayers[2], SC.useB, useVals[2]]    // 青
      ];
      var ok = 0;
      for (var j2 = 0; j2 < pairs.length; j2++) {
        var srcProp = byMatch(sc, pairs[j2][0]);
        var useProp = byMatch(sc, pairs[j2][2]);
        if (!srcProp || !useProp) { L('⚠ Set Channels: ' + pairs[j2][0] + ' / ' + pairs[j2][2] + ' が見つかりません'); continue; }
        try { srcProp.setValue(pairs[j2][1].index); useProp.setValue(pairs[j2][3]); ok++; }
        catch (e) { L('⚠ Set Channels の設定に失敗: ' + e.toString()); }
      }
      L(solidLayer.name + ' の Set Channels: ' + ok + ' / 3 組を設定');
      if (ok < 3) L('⚠ 一部設定できていません。上の一覧を送ってください。');
      // アルファは触らない。平面自身のアルファ（不透明）のままでよい
      return ok;
    }

    var mulOut, addOut;
    if (nPlanes === 1) {
      mulOut = comp.layers.add(mulComps[0]); mulOut.name = 'Stride11 Fade MUL';
      addOut = comp.layers.add(addComps[0]); addOut.name = 'Stride11 Fade ADD';
      L('1 プレーン構成: コンポをそのまま 2 枚重ねました');
    } else {
      var addRefs = [], mulRefs = [];
      for (var q = 0; q < 3; q++) {
        var ra = comp.layers.add(addComps[q]); ra.enabled = false; ra.moveToBeginning(); addRefs.push(ra);
        var rm = comp.layers.add(mulComps[q]); rm.enabled = false; rm.moveToBeginning(); mulRefs.push(rm);
      }
      // チャンネル c を担当する位相を引く（プレーン順に追従させる）
      var phaseOf = [0, 0, 0];
      for (var pi2 = 0; pi2 < phases.length; pi2++) {
        if (phases[pi2].ch >= 0) phaseOf[phases[pi2].ch] = pi2;
      }

      mulOut = comp.layers.addSolid([0, 0, 0], 'Stride11 Fade MUL',
        comp.width, comp.height, comp.pixelAspect, comp.duration);
      addOut = comp.layers.addSolid([0, 0, 0], 'Stride11 Fade ADD',
        comp.width, comp.height, comp.pixelAspect, comp.duration);

      // MUL の中身はグレー（RGB が同じ値）なので、どのチャンネルを読んでも同じ。赤を読む
      wireSetChannels(mulOut, [mulRefs[phaseOf[0]], mulRefs[phaseOf[1]], mulRefs[phaseOf[2]]], [1, 1, 1]);
      wireSetChannels(addOut, [addRefs[phaseOf[0]], addRefs[phaseOf[1]], addRefs[phaseOf[2]]], [1, 2, 3]);
    }

    // 下から MUL → ADD の順に重ねる。addSolid / add は先頭へ入るので、
    // MUL を先に作れば ADD が自然にその上へ来る
    try { mulOut.blendingMode = BlendingMode.MULTIPLY; L('Stride11 Fade MUL: 乗算'); }
    catch (e) { L('⚠ 乗算に設定できませんでした: ' + e.toString()); }
    try { addOut.blendingMode = BlendingMode.ADD; L('Stride11 Fade ADD: 加算'); }
    catch (e) { L('⚠ 加算に設定できませんでした: ' + e.toString()); }
    if (addOut.index > mulOut.index) {
      L('⚠ ADD が MUL より下にあります。ADD を上へ移動してください');
    }

    ovlLayer.enabled = false;
    L('重ね合わせレイヤーはビデオ OFF にしました（中身は ADD / MUL コンポ内にあります）');
    L('');
    L('完了。"Stride11 Fade CTRL" の Fade Progress (0→100) がフェードの進行です。');
    L('MUL(乗算) と ADD(加算) の 2 枚が、その下にあるもの全部に対して効きます。');
    L('この 2 枚より下に背景を置いてください。');
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
