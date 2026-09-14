/**
 * stride11_fade.jsx  —  English UI build
 * Builds the Stride11 fade rig in After Effects.
 *
 * How to use:
 *   1) Generate a reveal map PNG with tools/ae-en/index.html
 *   2) Open a composition holding the base layer and the overlay layer
 *   3) Select those two layers (the LOWER one is the base)
 *   4) File > Scripts > Run Script File... and pick this file
 *
 * How it works:
 *   The reveal map stores, as luminance v (1-254, darker = painted earlier),
 *   the order in which each cell is painted. Apply Threshold to the map and
 *   ramp its Level L from 0 to max:
 *       v >= L  ->  white
 *       v <  L  ->  black
 *   Give the overlay a LUMA INVERTED track matte and only the black part
 *   (v < L) shows through. That is the sweep.
 *   L = 0 hides everything, L = max reveals everything (the map tops out at
 *   254, so the end point is clean). The map never emits 0 either: AE's
 *   Threshold never turns a luminance-0 pixel black, so v = 0 cells would be
 *   left unpainted forever. Re-export old maps that still contain 0.
 *
 *   The three planes reuse the same map, each delayed by one third.
 *
 * Implementation notes:
 *   ・Properties are looked up by matchName, or by capability
 *     (canVaryOverTime), never by display name — display names are localized.
 *   ・Levels (ADBE Easy Levels2) is NOT used: on AE 26 its level properties
 *     report canSetExpression = false AND canVaryOverTime = false, so they
 *     accept neither expressions nor keyframes.
 *   ・Expressions address sub-properties by index, e.g. effect("X")(1),
 *     because ("Slider") fails on localized builds.
 *   ・On failure the script stops and shows a copyable diagnostic dialog.
 */

(function stride11Fade() {
  'use strict';

  var SCRIPT = 'Stride11 Fade';
  var log = [];
  function L(s) { log.push(s === undefined ? '' : String(s)); }

  /* ------------------------------------------------------------ diagnostics */
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
    g.add('statictext', undefined, 'Ctrl+A then Ctrl+C copies everything.');
    g.add('button', undefined, 'Close', { name: 'ok' });
    w.show();
  }

  /* ------------------------------------------------------------------ utils */
  function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }

  /* 同じ内容を何度も出さないための覚え書き。ログが画面に収まらなくなるため */
  var seenDump = {}, seenFx = {};

  /** Safe accessors: some properties throw merely on access */
  function propAt(group, i) {
    return safe(function () { return group.property(i); }, null);
  }

  function propCount(group) {
    return safe(function () { return group.numProperties; }, 0);
  }

  /*
   * Dump a property group to the log.
   *
   * Some properties throw ("numeric result is not valid") just from reading
   * matchName or name -- AE 26's Fill does. A diagnostic dump must never be
   * the thing that kills the run, so every read is wrapped.
   */
  /*
   * Wrap the conversion to string as well. Reading a value can succeed while
   * turning it into a string throws; concatenating outside safe() leaks that.
   */
  function safeStr(fn, dflt) {
    return safe(function () {
      var v = fn();
      return (v === undefined || v === null) ? String(dflt) : String(v);
    }, dflt);
  }

  /** 同じラベルの一覧は一度だけ出す */
  function dumpOnce(group, label) {
    if (seenDump[label]) { L('(' + label + ' listing omitted, already shown above)'); return; }
    seenDump[label] = true;
    dumpGroup(group, label);
  }

  function dumpGroup(group, label) {
    L('--- properties of ' + label + ' ---');
    try {
      var n = propCount(group);
      for (var i = 1; i <= n; i++) {
        var pr = propAt(group, i);
        if (!pr) { L('  [' + i + '] (cannot be read)'); continue; }
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
      L('  (stopped listing: ' + safeStr(function () { return e.toString(); }, '?') + ')');
    }
    L('---');
  }

  /** First 1D property that can be animated (name independent) */
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

  /** Try each candidate matchName until one sticks */
  function addEffectAny(layer, candidates, label) {
    var parade = layer.property('ADBE Effect Parade');
    for (var i = 0; i < candidates.length; i++) {
      try {
        var fx = parade.addProperty(candidates[i]);
        if (!seenFx[label]) {
          seenFx[label] = true;
          L(label + ': using ' + candidates[i]);
        }
        return fx;
      } catch (e) {}
    }
    L('■ Could not add the effect for ' + label + '. Tried: ' + candidates.join(', '));
    try {
      var key = label.toLowerCase();
      L('  Installed effects with a similar name:');
      for (var j = 0; j < app.effects.length; j++) {
        var e2 = app.effects[j];
        if (e2.matchName.toLowerCase().indexOf(key) >= 0 ||
            String(e2.displayName).toLowerCase().indexOf(key) >= 0) {
          L('    ' + e2.matchName + '  "' + e2.displayName + '"  [' + e2.category + ']');
        }
      }
    } catch (e3) { L('  Could not enumerate app.effects: ' + e3.toString()); }
    throw new Error('Could not add the effect for ' + label);
  }

  /** Copy a transform verbatim (JS accessors, so no localized names) */
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
    throw new Error('Could not set the track matte: ' + e2);
  }

  /** Ramp a value linearly, by expression if possible, otherwise by keyframes.
   *  An expression that merely *sets* is not trusted — expressionError is
   *  checked so a silent evaluation failure cannot slip through. */
  function driveLinear(prop, ownerGroup, useExpr, exprText, t0, v0, t1, v1) {
    if (useExpr && safe(function () { return prop.canSetExpression; }, false)) {
      try {
        prop.expression = exprText;
        var err = safe(function () { return prop.expressionError; }, '');
        if (!err) return 'expression';
        L('  ⚠ Expression failed to evaluate → falling back to keyframes');
        L('     ' + err);
        try { prop.expression = ''; } catch (e0) {}
      } catch (e) { L('  ⚠ Could not set the expression → falling back to keyframes: ' + e.toString()); }
    }
    if (!safe(function () { return prop.canVaryOverTime; }, false)) {
      dumpGroup(ownerGroup, 'the effect that could not be animated');
      throw new Error('"' + prop.name + '" accepts neither expressions nor keyframes (please send the list above)');
    }
    prop.setValueAtTime(t0, v0);
    prop.setValueAtTime(t1, v1);
    for (var k = 1; k <= prop.numKeys; k++) {
      try { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (e2) {}
    }
    return 'keyframes';
  }

  /* --------------------------------------------------------- preconditions */
  var comp = app.project.activeItem;
  if (!(comp && comp instanceof CompItem)) {
    alert(SCRIPT + '\n\nOpen a composition first.');
    return;
  }
  if (comp.selectedLayers.length !== 2) {
    alert(SCRIPT + '\n\nSelect exactly two layers: the base and the overlay.\n' +
          '(The lower one is treated as the base.)');
    return;
  }
  var s0 = comp.selectedLayers[0], s1 = comp.selectedLayers[1];
  var baseLayer = (s0.index > s1.index) ? s0 : s1;
  var ovlLayer = (s0.index > s1.index) ? s1 : s0;

  /* ---------------------------------------------------------------- dialog */
  var dlg = new Window('dialog', SCRIPT);
  dlg.alignChildren = 'fill';

  var g0 = dlg.add('panel', undefined, 'Layers');
  g0.alignChildren = 'left';
  g0.add('statictext', undefined, 'Base (lower)   : ' + baseLayer.name);
  g0.add('statictext', undefined, 'Overlay (upper): ' + ovlLayer.name);

  var g1 = dlg.add('panel', undefined, 'Reveal map');
  g1.alignChildren = 'fill';
  var pathRow = g1.add('group');
  var pathTxt = pathRow.add('edittext', undefined, ''); pathTxt.characters = 46;
  var browse = pathRow.add('button', undefined, 'Browse…');

  var g2 = dlg.add('panel', undefined, 'Fade');
  g2.alignChildren = 'left';
  var r1 = g2.add('group');
  r1.add('statictext', undefined, 'Plane order');
  var planesDd = r1.add('dropdownlist', undefined, [
    'blue > red > green (PC-88 hardware, 5CH/5DH/5EH)',
    'green > red > blue (reversed)',
    'red > green > blue',
    'all three at once (single mask)'
  ]);
  planesDd.selection = 0;
  var r2 = g2.add('group');
  r2.add('statictext', undefined, 'Duration (s)');
  var durTxt = r2.add('edittext', undefined, '1.44'); durTxt.characters = 6;
  r2.add('statictext', undefined, '  Start at (s)');
  var startTxt = r2.add('edittext', undefined, '0'); startTxt.characters = 6;
  var rdir = g2.add('group');
  rdir.add('statictext', undefined, 'Direction');
  var dirDd = rdir.add('dropdownlist', undefined, ['Appear (fade in)', 'Disappear (fade out)']);
  dirDd.selection = 0;
  var exprCb = g2.add('checkbox', undefined, 'Drive by expression when possible (one Fade Progress slider)');
  exprCb.value = true;
  var diagCb = g2.add('checkbox', undefined, 'Include property listings in the diagnostic log');
  diagCb.value = true;

  var gb = dlg.add('group'); gb.alignment = 'right';
  var okBtn = gb.add('button', undefined, 'Build', { name: 'ok' });
  var cancelBtn = gb.add('button', undefined, 'Cancel', { name: 'cancel' });

  browse.onClick = function () {
    var f = File.openDialog('Choose the reveal map PNG', '*.png');
    if (f) pathTxt.text = f.fsName;
  };
  var go = false;
  okBtn.onClick = function () {
    if (!pathTxt.text) { alert('Please choose the reveal map PNG.'); return; }
    go = true; dlg.close();
  };
  cancelBtn.onClick = function () { dlg.close(); };
  dlg.show();
  if (!go) return;

  /* Plane order. ch is the RGBA channel index (R=0, G=1, B=2).
     The map itself does not depend on plane order, so it needs no regenerating. */
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
    // matchName can be looked up directly; enumeration is the last resort
    var direct = safe(function () { return group.property(mn); }, null);
    if (direct) return direct;
    var n = propCount(group);
    for (var i = 1; i <= n; i++) {
      var pr = propAt(group, i);
      if (pr && safe(function () { return pr.matchName; }, '') === mn) return pr;
    }
    return null;
  }

  /* ----------------------------------------------------------------- build */
  var failed = false;
  app.beginUndoGroup(SCRIPT);
  try {
    L('AE ' + app.version);
    L('Comp: ' + comp.name + ' ' + comp.width + '×' + comp.height + ' / ' + comp.frameRate + 'fps');
    L('Plane order: ' + orderKey + ' = ' + (function () {
      var a = []; for (var i = 0; i < phases.length; i++) a.push(phases[i].name); return a.join(' > ');
    })());
    L('');

    /* --- reveal map ----------------------------------------------------- */
    var mapFile = new File(pathTxt.text);
    if (!mapFile.exists) throw new Error('Reveal map PNG not found: ' + pathTxt.text);
    var io = new ImportOptions(mapFile);
    io.importAs = ImportAsType.FOOTAGE;
    var mapItem = app.project.importFile(io);
    mapItem.name = 'revealmap';
    L('Reveal map imported: ' + mapItem.width + '×' + mapItem.height);
    if (mapItem.width !== comp.width || mapItem.height !== comp.height) {
      L('⚠ The map does not match the comp size. Re-export it at the comp size.');
    }

    /* --- control null --------------------------------------------------- */
    var ctrl = comp.layers.addNull(comp.duration);
    ctrl.name = 'Stride11 Fade CTRL';
    ctrl.enabled = false;
    var slider = addEffectAny(ctrl, ['ADBE Slider Control'], 'Slider Control');
    slider.name = 'Fade Progress';
    var sliderProp = byMatch(slider, 'ADBE Slider Control-0001') || firstAnimatableOneD(slider);
    if (!sliderProp) { dumpGroup(slider, 'Slider Control'); throw new Error('Could not reach the slider property'); }
    // 消滅は出現の逆再生。スライダーを逆に振るだけで、下流はそのまま使える
    sliderProp.setValueAtTime(startAt, fadeOut ? 100 : 0);
    sliderProp.setValueAtTime(startAt + duration, fadeOut ? 0 : 100);
    for (var k = 1; k <= sliderProp.numKeys; k++) {
      try { sliderProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (e) {}
    }
    L('Fade Progress: ' + startAt + 's → ' + (startAt + duration) + 's');
    L(fadeOut ? 'Direction: disappear (appearance reversed)' : 'Direction: appear');
    // Address sub-properties by index, not by name — display names are localized.
    var compRef = String(comp.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var CTRL_EXPR = 'comp("' + compRef + '").layer("Stride11 Fade CTRL").effect("Fade Progress")(1)';

    /* --- one MIX comp per plane ----------------------------------------- */
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
        if (p === 0) L('Copied the base and overlay transforms');
      } catch (e) { L('⚠ Could not copy a transform: ' + e.toString()); }

      var m = mix.layers.add(mapItem, comp.duration); m.name = 'MASK_' + p;
      var thr = addEffectAny(m, THRESHOLD_FX, 'Threshold');
      if (p === 0 && diagCb.value) dumpOnce(thr, 'Threshold');

      var lvlProp = firstAnimatableOneD(thr);
      if (!lvlProp) { dumpGroup(thr, 'Threshold'); throw new Error('No usable Level property on the Threshold effect'); }

      if (unit === null) {
        // The Level default sits mid-scale: 127 on a 0-255 scale, 0.5 on a 0-1 scale
        unit = (lvlProp.value > 1.5) ? 255 : 1;
        L('Threshold property: "' + lvlProp.name + '" (' + lvlProp.matchName + ') default ' +
          lvlProp.value + ' → range 0-' + unit);
      }

      /* Disappearing is the appearance played backwards. With an expression
         the slider already runs in reverse, but keyframes need both the
         times and the values swapped. */
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
        L('Threshold driven by: ' + how);
        if (how === 'expression') {
          L('  expression:');
          var el = expr.split('\n');
          for (var ei = 0; ei < el.length; ei++) L('    ' + el[ei]);
        } else {
          L('  keyframes: plane p ramps 0→' + unit +
            ' across [dur*p/' + nPlanes + ', dur*(p+1)/' + nPlanes + ']');
        }
      }

      // Threshold paints v >= L white, so take the black side with an inverted matte
      var tm = setTrackMatte(o, m, true);
      if (p === 0) L('Track matte: luma inverted (' + tm + ')');

      mixComps.push(mix);
      L('Created: ' + mix.name);
    }

    /* --- master comp ---------------------------------------------------- */
    if (nPlanes === 1) {
      var single = comp.layers.add(mixComps[0]);
      single.name = 'Stride11 Fade OUT';
      single.moveToBeginning();
      L('Single-plane build: placed the MIX comp directly');
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
      catch (e) { L('⚠ Could not copy the ALPHA SOURCE transform: ' + e.toString()); }
      baseRef.enabled = false; baseRef.moveToBeginning();

      var sol = comp.layers.addSolid([0, 0, 0], 'Stride11 Fade OUT',
        comp.width, comp.height, comp.pixelAspect, comp.duration);
      sol.moveToBeginning();

      var sc = addEffectAny(sol, ['ADBE Set Channels'], 'Set Channels');
      if (diagCb.value) dumpOnce(sc, 'Set Channels');

      // Which phase owns each channel — follows the chosen plane order
      var phaseOf = [0, 0, 0];
      for (var pi2 = 0; pi2 < phases.length; pi2++) {
        if (phases[pi2].ch >= 0) phaseOf[phases[pi2].ch] = pi2;
      }
      var pairs = [
        [SC.src1, refs[phaseOf[0]], SC.useR, 1],   // red
        [SC.src2, refs[phaseOf[1]], SC.useG, 2],   // green
        [SC.src3, refs[phaseOf[2]], SC.useB, 3],   // blue
        [SC.src4, baseRef,          SC.useA, 4]    // alpha
      ];
      var scOk = 0;
      for (var j = 0; j < pairs.length; j++) {
        var srcProp = byMatch(sc, pairs[j][0]);
        var useProp = byMatch(sc, pairs[j][2]);
        if (!srcProp || !useProp) { L('⚠ Set Channels: could not find ' + pairs[j][0] + ' / ' + pairs[j][2]); continue; }
        try { srcProp.setValue(pairs[j][1].index); useProp.setValue(pairs[j][3]); scOk++; }
        catch (e) { L('⚠ Set Channels assignment failed: ' + e.toString()); }
      }
      L('Set Channels: ' + scOk + ' / 4 pairs assigned');
      if (scOk < 4) L('⚠ Some assignments are missing. Please send the listing above.');
    }

    baseLayer.enabled = false;
    ovlLayer.enabled = false;
    L('Turned video off on the original two layers (their content now lives in the MIX comps)');
    L('');
    L('Done. Animate Fade Progress (0→100) on "Stride11 Fade CTRL".');
    L('※ If the motion looks uneven, set Project Settings > Color > Working Space to None,');
    L('   or match the revealmap footage interpretation to the working space.');

  } catch (err) {
    failed = true;
    L('');
    L('■ Stopped: ' + err.toString());
    if (err.line) L('  line ' + err.line);
    L('');
    L('※ One Ctrl+Z undoes everything this script created.');
    L('   Only the imported revealmap footage stays in the Project panel.');
  } finally {
    app.endUndoGroup();
  }

  showLog(failed ? 'Stopped' : 'Done');
})();
