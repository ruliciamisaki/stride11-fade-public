/* ==========================================================================
 *  連番PNG作成ツール — Stride11 フェード (PC-8801mkIISR)
 *
 *  実機の挙動:
 *    ・フェードの単位は VRAM の 1 バイト = 横 8 ドット × 縦 1 ライン
 *    ・1 パスでアドレスが 11 の倍数だけ離れたバイトを、アドレス昇順
 *      (画面の上から下へ) 書き込む
 *    ・開始オフセットを 0,1,…,10 とずらして 11 パスで 1 プレーン完成
 *    ・プレーン 0=青(5CH) → 1=赤(5DH) → 2=緑(5EH) の順に 3 回
 *
 *  2 枚の画像間の遷移への一般化:
 *    実機は開始時 VRAM が全面 0 なので XOR が単なるコピーに見えるだけで、
 *    本質は VRAM[a] ^= (start[a] ^ end[a])。つまり各バイトの各プレーンが
 *    予定時刻に「開始画像の値」から「終了画像の値」へ切り替わる。
 *    フルカラー入力は R/G/B の各チャンネルをプレーンとして扱う
 *    (8 色画像を入れれば実機と完全に一致する)。
 * ========================================================================== */
'use strict';

/* -------------------------------------------------------------- パターン */
const PATTERNS = [
  { id: 1, title: '640×400（疑似 640×200・縦長ドット）',
    desc: '偶数ラインが直前の奇数ラインの複製になっている素材向け。フェード単位は 1×2 ピクセルの縦長ドット。実機と同じ 80×200 バイト。',
    fixed: [640, 400] },
  { id: 2, title: '640×400（正方形ドット）',
    desc: 'ライン複製なしの素材向け。フェード単位は 1×1 ピクセル、80×400 バイトで掃引する。',
    fixed: [640, 400] },
  { id: 3, title: '任意サイズ → 640×200 相当（縦長ドット）',
    desc: '横を 640 等分・縦を 200 等分。割り切れない分は右端／下端のセルが吸収する。16:10 ならぴったり。' },
  { id: 4, title: '任意サイズ → 640×400 相当（正方形ドット）',
    desc: '横を 640 等分・縦を 400 等分。割り切れない分は右端／下端のセルが吸収する。' },
  { id: 5, title: '任意サイズ → 1 ピクセル = 1 ドット',
    desc: 'ロジックをそのまま等倍で適用。バイト = 横 8 ピクセル。横幅が 8 で割り切れない分は右端のバイトが吸収する。大きな画像ほど細かいフェードになる。' }
];

const PLANE_SETS = {
  /* RGBA でのチャンネルオフセット: R=0, G=1, B=2 */
  brg: [{ name: '青 (5CH)', chans: [2] }, { name: '赤 (5DH)', chans: [0] }, { name: '緑 (5EH)', chans: [1] }],
  grb: [{ name: '緑', chans: [1] }, { name: '赤', chans: [0] }, { name: '青', chans: [2] }],
  rgb: [{ name: '赤', chans: [0] }, { name: '緑', chans: [1] }, { name: '青', chans: [2] }],
  all: [{ name: '3プレーン同時', chans: [0, 1, 2] }]
};

/* -------------------------------------------------------------- DOM */
const $ = id => document.getElementById(id);
const els = {
  fileA: $('fileA'), fileB: $('fileB'), dropA: $('dropA'), dropB: $('dropB'),
  thumbA: $('thumbA'), thumbB: $('thumbB'), metaA: $('metaA'), metaB: $('metaB'),
  msgImages: $('msgImages'), btnSwap: $('btnSwap'),
  patterns: $('patterns'), dupLineWrap: $('dupLineWrap'), dupLine: $('dupLine'),
  remModeWrap: $('remModeWrap'), remMode: $('remMode'), geo: $('geo'),
  stride: $('stride'), strideHint: $('strideHint'), planeOrder: $('planeOrder'),
  frames: $('frames'), framesHint: $('framesHint'), msPass: $('msPass'), snapPass: $('snapPass'),
  preview: $('preview'), btnPlay: $('btnPlay'), scrub: $('scrub'), zoom: $('zoom'),
  roFrame: $('roFrame'), roPlane: $('roPlane'), roPass: $('roPass'),
  roBytes: $('roBytes'), roMs: $('roMs'),
  prefix: $('prefix'), digits: $('digits'), nameHint: $('nameHint'),
  transparent: $('transparent'), msgTrans: $('msgTrans'), slotTitleA: $('slotTitleA'),
  btnDir: $('btnDir'), btnZip: $('btnZip'), btnStop: $('btnStop'), msgExport: $('msgExport'),
  progWrap: $('progWrap'), progBar: $('progBar'), progLabel: $('progLabel')
};

/* -------------------------------------------------------------- 状態 */
let imgA = null, imgB = null;            // {w,h,data} 元画像
let uidSeq = 0, bufSig = '';             // バッファ再構築の判定用
let pattern = 1;
let G = null;                            // ジオメトリ
let order = null;                        // バイトの書き込み順 (剰余ごと・アドレス昇順)
let phases = PLANE_SETS.brg;
let srcA = null, srcB = null, cur = null;  // 作業用 RGBA
let mulBuf = null, addBuf = null;        // 透明出力用（乗算パス / 加算パス）
let transparent = false;                 // 透明で出力するか（applyByte が毎バイト見るので変数で持つ）
let imgData = null;                      // preview canvas 用 ImageData
let doneEvents = 0;                      // 適用済みイベント数
let totalEvents = 0;
let playing = false, aborting = false, busy = false;

const ctx = els.preview.getContext('2d', { willReadFrequently: true });

/* ========================================================================== *
 *  画像の読み込み
 * ========================================================================== */
function imageFromSource(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      for (let o = 3; o < d.data.length; o += 4) d.data[o] = 255;   // 不透明に固定
      resolve({ w: c.width, h: c.height, data: d.data });
    };
    im.onerror = () => reject(new Error('画像を読み込めませんでした'));
    im.src = src;
  });
}

async function loadFile(slot, file) {
  if (!file || !file.type.startsWith('image/')) {
    return setMsg(els.msgImages, '画像ファイルではありません。', 'err');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await imageFromSource(url);
    setSlot(slot, img, file.name);
  } catch (e) {
    setMsg(els.msgImages, e.message, 'err');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function solidImage(w, h, color) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  return { w, h, data: d.data };
}

function setSlot(slot, img, label) {
  img.label = label; img.uid = ++uidSeq;
  if (slot === 'A') imgA = img; else imgB = img;
  drawThumb(slot === 'A' ? els.thumbA : els.thumbB, img);
  (slot === 'A' ? els.dropA : els.dropB).classList.add('filled');
  (slot === 'A' ? els.metaA : els.metaB).textContent = `${label} — ${img.w}×${img.h}`;
  refresh();
}

function drawThumb(canvas, img) {
  const max = 360;
  const sc = Math.min(1, max / img.w);
  const src = document.createElement('canvas');
  src.width = img.w; src.height = img.h;
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  canvas.width = Math.max(1, Math.round(img.w * sc));
  canvas.height = Math.max(1, Math.round(img.h * sc));
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = sc < 1;
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/* ========================================================================== *
 *  ジオメトリ
 * ========================================================================== */
/**
 * 境界配列を作る。
 *   'even' … 余りを全ドットへ 1px ずつ配る（境界は整数のまま）。既定
 *   'edge' … 整数商で等分し、余りは最後のドットが吸収する
 *
 * 割り切れる素材ではどちらも同じ境界になる。
 */
function boundaries(total, n, mode) {
  const b = new Int32Array(n + 1);
  if (mode === 'even') {
    for (let i = 0; i <= n; i++) b[i] = Math.floor(i * total / n);
  } else {
    const q = Math.floor(total / n);
    for (let i = 0; i < n; i++) b[i] = i * q;
    b[n] = total;
  }
  return b;
}

function geometry(pat, W, H, remMode) {
  let cols, rows;
  if (pat === 5) { cols = Math.floor(W / 8) * 8; rows = H; }
  else { cols = 640; rows = (pat === 1 || pat === 3) ? 200 : 400; }
  const mode = (pat === 5) ? 'edge' : (remMode || 'even');
  const bx = boundaries(W, cols, mode);
  const by = boundaries(H, rows, mode);
  const cellW = Math.floor(W / cols), cellH = Math.floor(H / rows);
  const bpl = cols / 8;
  return {
    cols, rows, cellW, cellH, bpl, total: bpl * rows, bx, by, mode,
    remW: W - cellW * cols, remH: H - cellH * rows, W, H
  };
}

function patternError(pat, W, H) {
  const p = PATTERNS.find(p => p.id === pat);
  if (p.fixed && (W !== p.fixed[0] || H !== p.fixed[1])) {
    return `このパターンは ${p.fixed[0]}×${p.fixed[1]} 専用です（現在 ${W}×${H}）。パターン3〜5 を使ってください。`;
  }
  if (pat === 5 && W < 8) return '横幅が 8 ピクセル未満です。';
  if (pat !== 5) {
    const g = geometry(pat, W, H, 'edge');
    if (g.cellW < 1) return `横幅が ${g.cols} ピクセル未満なので ${g.cols} 等分できません（現在 ${W}）。パターン5 を使ってください。`;
    if (g.cellH < 1) return `高さが ${g.rows} ピクセル未満なので ${g.rows} 等分できません（現在 ${H}）。パターン5 を使ってください。`;
  }
  return null;
}

/* ========================================================================== *
 *  スケジュール
 * ========================================================================== */
function buildOrder(total, stride) {
  const o = new Int32Array(total);
  let i = 0;
  for (let r = 0; r < stride; r++) for (let a = r; a < total; a += stride) o[i++] = a;
  return o;
}

const gcd = (a, b) => b ? gcd(b, a % b) : a;

/* ========================================================================== *
 *  レンダラ
 * ========================================================================== */
function prepareBuffers() {
  const W = G.W, H = G.H;
  const sig = [imgA.uid, imgB.uid, pattern, els.dupLine.checked, W, H, transparent].join('|');
  if (sig === bufSig && cur && cur.length === W * H * 4) {
    rewind();                            // 素材は同じ。頭出しだけ
    return;
  }
  bufSig = sig;
  srcA = new Uint8ClampedArray(imgA.data);
  srcB = new Uint8ClampedArray(imgB.data);
  if (pattern === 1 && els.dupLine.checked) {
    duplicateLines(srcA, W, H);
    duplicateLines(srcB, W, H);
  }
  cur = new Uint8ClampedArray(srcA);
  if (transparent) {
    mulBuf = new Uint8ClampedArray(W * H * 4);
    addBuf = new Uint8ClampedArray(W * H * 4);
  } else {
    mulBuf = addBuf = null;                 // 使わないなら抱えない
  }
  els.preview.width = W; els.preview.height = H;
  imgData = new ImageData(cur, W, H);       // cur を直接参照する
  rewind();
}

/**
 * 先頭に巻き戻す。
 *
 * 透明出力の2パスは「何もしていない状態」が乗算=白 / 加算=黒。
 * 乗算パスは 1 を掛ける＝背景をそのまま通し、加算パスは 0 を足す＝何も足さない。
 */
function rewind() {
  cur.set(srcA);
  if (mulBuf) {
    mulBuf.fill(255);                       // RGB も A も 255
    addBuf.fill(0);
    for (let o = 3; o < addBuf.length; o += 4) addBuf[o] = 255;   // 不透明にする
  }
  doneEvents = 0;
}

/** 偶数ライン(0基点で奇数 index)を直前のラインで上書きする */
function duplicateLines(buf, W, H) {
  const stride = W * 4;
  for (let y = 1; y < H; y += 2) buf.copyWithin(y * stride, (y - 1) * stride, y * stride);
}

function applyByte(a, chans) {
  const bpl = G.bpl, W = G.W;
  const line = (a / bpl) | 0, bi = a - line * bpl;
  const x0 = G.bx[bi * 8], x1 = G.bx[bi * 8 + 8];
  const y0 = G.by[line], y1 = G.by[line + 1];

  if (transparent) {
    /*
     * 塗り終わったチャンネルだけ、背景を終了画像に差し替える。
     *   乗算パス: 255 - a   … そのチャンネルのぶんだけ背景を削る
     *   加算パス: 終了画像 × a … 削った分に絵を足す
     * 合わせると 背景×(1-a) + 絵×a になり、通常のアルファ合成と一致する。
     * プレビュー(cur)には、その合成結果を直接書いておく。
     */
    for (let y = y0; y < y1; y++) {
      let o = (y * W + x0) * 4;
      for (let x = x0; x < x1; x++, o += 4) {
        const al = srcB[o + 3];
        for (let i = 0; i < chans.length; i++) {
          const p = o + chans[i];
          mulBuf[p] = 255 - al;
          addBuf[p] = Math.round(srcB[p] * al / 255);
          // プレビューは出力の2パスと同じ順で計算する。
          // 素直にアルファ合成すると丸めが1階調ずれて、見えているものと
          // 書き出されるものが一致しなくなる
          cur[p] = Math.round(srcA[p] * mulBuf[p] / 255) + addBuf[p];
        }
      }
    }
    return;
  }

  if (chans.length === 1) {
    const c = chans[0];
    for (let y = y0; y < y1; y++) {
      let o = (y * W + x0) * 4 + c;
      for (let x = x0; x < x1; x++, o += 4) cur[o] = srcB[o];
    }
  } else {
    for (let y = y0; y < y1; y++) {
      let o = (y * W + x0) * 4;
      for (let x = x0; x < x1; x++, o += 4) {
        cur[o] = srcB[o]; cur[o + 1] = srcB[o + 1]; cur[o + 2] = srcB[o + 2];
      }
    }
  }
}

function applyEvents(from, to) {
  const total = G.total;
  for (let e = from; e < to; e++) {
    const phase = (e / total) | 0;
    applyByte(order[e - phase * total], phases[phase].chans);
  }
}

/** 指定イベント数まで進める（戻る場合は先頭から再生し直す） */
function seek(target) {
  target = Math.max(0, Math.min(totalEvents, target));
  if (target < doneEvents) { rewind(); }
  applyEvents(doneEvents, target);
  doneEvents = target;
}

/** フレーム番号 → イベント数 */
function eventsForFrame(f, frameCount) {
  const p = frameCount <= 1 ? 1 : f / (frameCount - 1);
  let target = Math.round(p * totalEvents);
  if (els.snapPass.checked) {
    const per = G.total / getStride();
    target = Math.round(Math.round(target / per) * per);
  }
  return Math.max(0, Math.min(totalEvents, target));
}

function paint() {
  ctx.putImageData(imgData, 0, 0);
  applyZoom();
}

function applyZoom() {
  const z = Number(els.zoom.value);
  els.preview.style.width = z ? (G.W * z) + 'px' : '';
  els.preview.style.maxWidth = z ? 'none' : '100%';
}

/* ========================================================================== *
 *  UI 更新
 * ========================================================================== */
const getStride = () => Math.max(1, Math.min(255, parseInt(els.stride.value, 10) || 11));
const getFrames = () => Math.max(2, Math.min(2000, parseInt(els.frames.value, 10) || 43));

function setMsg(el, text, cls) {
  el.textContent = text || '';
  el.className = 'msg' + (cls ? ' ' + cls : '');
}

function renderPatternList() {
  els.patterns.innerHTML = '';
  for (const p of PATTERNS) {
    const lab = document.createElement('label');
    lab.className = 'pat' + (p.id === pattern ? ' sel' : '');
    const rb = document.createElement('input');
    rb.type = 'radio'; rb.name = 'pattern'; rb.value = p.id; rb.checked = p.id === pattern;
    rb.addEventListener('change', () => { pattern = p.id; renderPatternList(); refresh(); });
    const box = document.createElement('div');
    const b = document.createElement('b'); b.textContent = `${p.id}. ${p.title}`;
    const s = document.createElement('span'); s.textContent = p.desc;
    box.append(b, s);
    lab.append(rb, box);
    if (imgA && patternError(p.id, imgA.w, imgA.h)) lab.classList.add('bad');
    els.patterns.appendChild(lab);
  }
  els.dupLineWrap.hidden = pattern !== 1;
  els.remModeWrap.hidden = true;      // 余りが出るときだけ showGeometry() で表示
}

function refresh() {
  transparent = els.transparent.checked;
  updateTransparentUI();
  els.btnSwap.disabled = !(imgA && imgB);
  renderPatternList();

  if (!imgA || !imgB) {
    setMsg(els.msgImages, imgA || imgB ? 'もう 1 枚読み込んでください。' : '');
    els.geo.textContent = '画像を読み込むと、分割の内訳を表示します。';
    setReady(false);
    return;
  }
  if (imgA.w !== imgB.w || imgA.h !== imgB.h) {
    setMsg(els.msgImages, `2 枚のサイズが違います（${imgA.w}×${imgA.h} と ${imgB.w}×${imgB.h}）。同じサイズにしてください。`, 'err');
    els.geo.textContent = '—';
    setReady(false);
    return;
  }
  const err = patternError(pattern, imgA.w, imgA.h);
  if (err) {
    setMsg(els.msgImages, err, 'err');
    els.geo.textContent = '—';
    setReady(false);
    return;
  }
  setMsg(els.msgImages, `${imgA.w}×${imgA.h} — 準備完了。`, 'ok');

  G = geometry(pattern, imgA.w, imgA.h, els.remMode.value);
  phases = PLANE_SETS[els.planeOrder.value] || PLANE_SETS.brg;
  const stride = getStride();
  order = buildOrder(G.total, stride);
  totalEvents = phases.length * G.total;

  prepareBuffers();
  seek(eventsForFrame(Math.round(Number(els.scrub.value) / 1000 * (getFrames() - 1)), getFrames()));
  paint();

  showGeometry(stride);
  showHints(stride);
  setReady(true);
  updateReadout();
}

function showGeometry(stride) {
  els.remModeWrap.hidden = (pattern === 5) || (!G.remW && !G.remH);
  const lines = [];
  lines.push(`ドット格子      : ${G.cols} × ${G.rows}`);
  if (!G.remW && !G.remH) {
    lines.push(`1 ドットの画素数: ${G.cellW} × ${G.cellH} px（割り切れ）`);
  } else if (G.mode === 'even') {
    const rw = G.remW ? `${G.cellW}〜${G.cellW + 1}` : `${G.cellW}`;
    const rh = G.remH ? `${G.cellH}〜${G.cellH + 1}` : `${G.cellH}`;
    lines.push(`1 ドットの画素数: ${rw} × ${rh} px（余りを均等分配）`);
  } else {
    lines.push(`1 ドットの画素数: ${G.cellW} × ${G.cellH} px` +
      `（余り 右端 +${G.remW}px / 下端 +${G.remH}px を端のドットが吸収）`);
  }
  if (G.mode === 'edge' && (G.remW > G.cellW || G.remH > G.cellH)) {
    lines.push(`⚠ 余りが 1 ドット分より大きいため、右端／下端が不自然に太くなります（右端 ${G.cellW + G.remW}px / 下端 ${G.cellH + G.remH}px）。「均等に分配」を検討してください。`);
  }
  lines.push(`バイト格子      : ${G.bpl} × ${G.rows} = ${G.total.toLocaleString()} バイト / プレーン`);
  lines.push(`1 パスの書込量  : ${Math.ceil(G.total / stride).toLocaleString()} バイト（全 ${phases.length * stride} パス）`);
  const shift = G.bpl % stride;
  lines.push(`ライン間のずれ  : ${shift} バイト = ${shift * 8 * G.cellW} px` +
    (gcd(stride, G.bpl) === 1 ? '' : '  ← ストライドと桁数が互いに素でないため縦縞になります'));
  els.geo.textContent = lines.join('\n');
}

function showHints(stride) {
  const passes = phases.length * stride;
  const ms = Number(els.msPass.value) || 43.5;
  const frames = getFrames();
  const dur = passes * ms / 1000;
  els.framesHint.textContent = `実機と同じ速さで再生するなら 約 ${(frames / dur).toFixed(1)} fps（全体 ${dur.toFixed(2)} 秒）`;
  const shift = G ? G.bpl % stride : 0;
  els.strideHint.textContent = `実機は 11。1 ライン下がるごとに ${shift} バイト右へずれます。` +
    (G && gcd(stride, G.bpl) !== 1 ? ' ※互いに素でないと均一になりません' : '');
  updateNameHint();
}

function updateNameHint() {
  const d = Math.max(1, Math.min(8, parseInt(els.digits.value, 10) || 4));
  const n = `${safePrefix()}${'0'.repeat(d)}.png`;
  els.nameHint.textContent = els.transparent.checked
    ? `mul/${n} ／ add/${n} …`
    : `${n} …`;
}

/**
 * 透明モードの見た目を整える。
 *
 * 透明モードでは開始画像を出力に使わない。何に重ねるとどう見えるかを
 * 確かめるための背景として残してあるので、呼び名をそう変える。
 */
function updateTransparentUI() {
  const on = els.transparent.checked;
  els.slotTitleA.textContent = on ? '背景（プレビュー用）' : '開始画像';
  setMsg(els.msgTrans, on
    ? '背景を含まない2本の連番を書き出します。乗算用（mul）と加算用（add）です。'
      + '編集ソフトでは下から 乗算 → 加算 の順に重ねてください。'
      + '「開始画像」は出力に含まれません。何に重ねるとどう見えるかの確認用です。'
    : '開始画像から終了画像へ切り替わる、そのままの連番を書き出します。'
      + '背景が決まっているならこちらが確実です。', on ? '' : '');
  updateNameHint();
}

function setReady(ok) {
  els.btnPlay.disabled = !ok;
  els.scrub.disabled = !ok;
  els.btnZip.disabled = !ok || busy;
  els.btnDir.disabled = !ok || busy || !window.showDirectoryPicker;
  if (!window.showDirectoryPicker) {
    els.btnDir.title = 'このブラウザは File System Access API に未対応です';
  }
}

function updateReadout() {
  const frames = getFrames();
  const f = Math.round(Number(els.scrub.value) / 1000 * (frames - 1));
  const total = G.total, stride = getStride();
  const phase = Math.min(phases.length - 1, Math.floor(doneEvents / total));
  const within = doneEvents - phase * total;
  const per = total / stride;
  els.roFrame.textContent = `${f} / ${frames - 1}`;
  els.roPlane.textContent = doneEvents >= totalEvents ? '完了'
    : (doneEvents === 0 ? '—' : phases[phase].name);
  els.roPass.textContent = doneEvents >= totalEvents ? `${stride} / ${stride}`
    : `${Math.min(stride, Math.ceil(within / per) || (within ? 1 : 0))} / ${stride}`;
  els.roBytes.textContent = doneEvents.toLocaleString();
  const ms = Number(els.msPass.value) || 43.5;
  els.roMs.textContent = `${Math.round(doneEvents / per * ms)} ms`;   // 経過パス数 × 1パスの時間
}

/* ========================================================================== *
 *  プレビュー再生
 * ========================================================================== */
function gotoFrame(f) {
  const frames = getFrames();
  f = Math.max(0, Math.min(frames - 1, f));
  els.scrub.value = Math.round(f / (frames - 1) * 1000);
  seek(eventsForFrame(f, frames));
  paint();
  updateReadout();
}

function play() {
  if (playing) { playing = false; els.btnPlay.textContent = '▶ 再生'; return; }
  playing = true; els.btnPlay.textContent = '⏸ 停止';
  const frames = getFrames();
  const ms = Number(els.msPass.value) || 43.5;
  const dur = phases.length * getStride() * ms;             // 全体 ms
  let f = (doneEvents >= totalEvents) ? 0 : Math.round(Number(els.scrub.value) / 1000 * (frames - 1));
  let t0 = performance.now() - f / (frames - 1) * dur;
  const step = now => {
    if (!playing) return;
    const p = (now - t0) / dur;
    f = Math.round(p * (frames - 1));
    if (f >= frames - 1) { gotoFrame(frames - 1); playing = false; els.btnPlay.textContent = '▶ 再生'; return; }
    gotoFrame(f);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ========================================================================== *
 *  書き出し
 * ========================================================================== */
const nextTick = () => new Promise(res => setTimeout(res, 0));

/* 書き出し用の隠しキャンバス。プレビューを止めずに別のバッファを PNG にできる */
const expCanvas = document.createElement('canvas');
const expCtx = expCanvas.getContext('2d');

function bufToBlob(buf) {
  if (expCanvas.width !== G.W || expCanvas.height !== G.H) {
    expCanvas.width = G.W; expCanvas.height = G.H;
  }
  expCtx.putImageData(new ImageData(buf, G.W, G.H), 0, 0);
  return new Promise(res => expCanvas.toBlob(res, 'image/png'));
}

/** Windows / macOS で使えない文字を落とす */
function safePrefix() {
  const banned = '\\/:*?"<>|';
  let out = '';
  for (const ch of (els.prefix.value || '')) {
    out += (ch.codePointAt(0) < 32 || banned.includes(ch)) ? '_' : ch;
  }
  return out === '' ? 'fade_' : out;
}

function fileName(i) {
  const d = Math.max(1, Math.min(8, parseInt(els.digits.value, 10) || 4));
  return `${safePrefix()}${String(i).padStart(d, '0')}.png`;
}

/** 書き出す層。通常は1つ、透明出力なら乗算パスと加算パスの2つ */
function exportLayers() {
  return transparent
    ? [{ dir: 'mul', buf: () => mulBuf }, { dir: 'add', buf: () => addBuf }]
    : [{ dir: null, buf: () => cur }];
}

function setProgress(i, n, extra) {
  els.progWrap.hidden = false;
  els.progBar.style.width = (i / n * 100).toFixed(1) + '%';
  els.progLabel.textContent = `${i} / ${n} 枚${extra ? ' — ' + extra : ''}`;
}

async function exportSequence(mode) {
  if (busy) return;
  busy = true; aborting = false; playing = false;
  els.btnPlay.textContent = '▶ 再生';
  els.btnStop.hidden = false;
  setReady(true);
  els.btnZip.disabled = els.btnDir.disabled = true;

  const frames = getFrames();
  const layers = exportLayers();
  const total = frames * layers.length;
  const entries = [];
  let dirHandle = null;

  try {
    if (mode === 'dir') {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    }
    setMsg(els.msgExport, '書き出し中…', '');
    rewind();                                      // 先頭から順に進める（巻き戻しなし）
    let bytes = 0, written = 0;

    // 透明出力は層ごとにフォルダを分ける。連番として読み込みやすくするため
    const dirs = {};
    if (dirHandle) {
      for (const layer of layers) {
        dirs[layer.dir] = layer.dir
          ? await dirHandle.getDirectoryHandle(layer.dir, { create: true })
          : dirHandle;
      }
    }

    for (let f = 0; f < frames; f++) {
      if (aborting) throw new Error('中止しました');
      seek(eventsForFrame(f, frames));
      paint();
      for (const layer of layers) {
        const blob = await bufToBlob(layer.buf());
        if (!blob) throw new Error('PNG の生成に失敗しました');
        bytes += blob.size; written++;
        if (dirHandle) {
          const fh = await dirs[layer.dir].getFileHandle(fileName(f), { create: true });
          const w = await fh.createWritable();
          await w.write(blob); await w.close();
        } else {
          entries.push({
            name: (layer.dir ? layer.dir + '/' : '') + fileName(f),
            data: new Uint8Array(await blob.arrayBuffer())
          });
        }
        setProgress(written, total, fmtBytes(bytes));
      }
      if ((f & 1) === 0) await nextTick();          // UI を止めない
    }

    if (dirHandle) {
      setMsg(els.msgExport, `完了。${written} 枚（${fmtBytes(bytes)}）を書き出しました。`, 'ok');
    } else {
      setProgress(total, total, 'ZIP を作成中…');
      await nextTick();
      const zip = buildZip(entries);
      downloadBlob(zip, safePrefix().replace(/[_\-.]+$/, '') + '_png.zip');
      setMsg(els.msgExport, `完了。${written} 枚（${fmtBytes(zip.size)}）の ZIP をダウンロードしました。`, 'ok');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') setMsg(els.msgExport, 'フォルダの選択をキャンセルしました。', '');
    else setMsg(els.msgExport, 'エラー: ' + (e && e.message ? e.message : e), 'err');
  } finally {
    busy = false; aborting = false;
    els.btnStop.hidden = true;
    els.progWrap.hidden = true;
    setReady(true);
    updateReadout();
  }
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/* -------------------------------------------------------------- ZIP (無圧縮) */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const parts = [], central = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const flags = name.some(b => b > 127) ? 0x0800 : 0;   // bit11 = 名前が UTF-8
    const crc = crc32(e.data);
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, e.data);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + e.data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eo = new Uint8Array(22);
  const ev = new DataView(eo.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eo], { type: 'application/zip' });
}

/* ========================================================================== *
 *  イベント配線
 * ========================================================================== */
els.fileA.addEventListener('change', e => loadFile('A', e.target.files[0]));
els.fileB.addEventListener('change', e => loadFile('B', e.target.files[0]));

for (const [slot, drop] of [['A', els.dropA], ['B', els.dropB]]) {
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    loadFile(slot, e.dataTransfer.files[0]);
  });
}

document.querySelectorAll('[data-fill]').forEach(btn => {
  btn.addEventListener('click', () => {
    const other = btn.dataset.fill === 'A' ? imgB : imgA;
    const w = other ? other.w : 640, h = other ? other.h : 400;
    setSlot(btn.dataset.fill, solidImage(w, h, btn.dataset.color),
      btn.dataset.color === '#000000' ? '黒一色' : '白一色');
  });
});

els.btnSwap.addEventListener('click', () => {
  if (!imgA || !imgB) return;
  const a = imgA, b = imgB;
  setSlot('A', b, b.label); setSlot('B', a, a.label);
});

['planeOrder', 'frames', 'msPass', 'snapPass', 'dupLine', 'remMode'].forEach(k => {
  els[k].addEventListener('change', refresh);
});
els.transparent.addEventListener('change', refresh);
els.stride.addEventListener('input', refresh);
els.frames.addEventListener('input', () => { if (G) showHints(getStride()); });
['prefix', 'digits'].forEach(k => els[k].addEventListener('input', updateNameHint));

els.scrub.addEventListener('input', () => {
  playing = false; els.btnPlay.textContent = '▶ 再生';
  gotoFrame(Math.round(Number(els.scrub.value) / 1000 * (getFrames() - 1)));
});
els.btnPlay.addEventListener('click', play);
els.zoom.addEventListener('change', applyZoom);

els.btnZip.addEventListener('click', () => exportSequence('zip'));
els.btnDir.addEventListener('click', () => exportSequence('dir'));
els.btnStop.addEventListener('click', () => { aborting = true; });

/* -------------------------------------------------------------- 初期化 */
renderPatternList();
updateTransparentUI();
setReady(false);
if (!window.showDirectoryPicker) {
  setMsg(els.msgExport, 'このブラウザは「フォルダへ直接書き出し」に未対応です（Chrome / Edge 推奨）。ZIP をご利用ください。', 'warn');
}
