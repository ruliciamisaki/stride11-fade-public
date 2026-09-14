/* ==========================================================================
 *  リビールマップ生成 — Stride11 フェード (After Effects 用)
 *
 *  フェード全体を静止画 1 枚に畳み込む。
 *
 *    セル (バイト) のアドレス a に対し
 *      residue = a mod stride        … 第何パスで塗られるか
 *      s       = (residue + a/N) / stride   ∈ [0,1)   … 1 プレーン内の正規化順序
 *      v       = 1 + floor(254 * s)  ∈ [1,254]        … マップの明度
 *
 *    プレーン p の進行度 prog_p = clamp(nPlanes * τ - p, 0, 1)
 *    そのプレーンのマスク = ( v < 255 * prog_p )
 *    v の上限を 254 にしてあるので、prog=1 (しきい値 255) で必ず全開になる。
 *    下限を 1 にしてあるのは、AE の「しきい値」が輝度 0 の画素だけを
 *    最後まで白のままにしてしまうから（実測。v=0 のセルだけが永遠に塗り残る）。
 *
 *  3 プレーンは順序が完全に同一で時間が 1/3 ずつ後ろにずれるだけなので、
 *  マップは 1 枚で足りる。しきい値を 3 本動かすだけでよい。
 *
 *  格子はコンポジション全体にアンカーされる。重ね合わせ画像のサイズ・位置に
 *  依存しないので、どこに何を置いても画面共通の織り目になる。
 * ========================================================================== */
'use strict';

const PATTERNS = [
  { id: 1, title: '640×400（疑似 640×200・縦長ドット）', fixed: [640, 400],
    desc: 'コンポが 640×400 のとき。フェード単位は 1×2px の縦長ドット。実機と同じ 80×200 バイト。' },
  { id: 2, title: '640×400（正方形ドット）', fixed: [640, 400],
    desc: 'コンポが 640×400 のとき。フェード単位は 1×1px、80×400 バイト。' },
  { id: 3, title: '任意サイズ → 640×200 相当（縦長ドット）',
    desc: 'コンポの横を 640 等分・縦を 200 等分。16:10 ならぴったり。' },
  { id: 4, title: '任意サイズ → 640×400 相当（正方形ドット）',
    desc: 'コンポの横を 640 等分・縦を 400 等分。' },
  { id: 5, title: '任意サイズ → 1 ピクセル = 1 ドット',
    desc: '等倍で適用。バイト = 横 8px。大きいコンポほど細かい織り目になる。' }
];

/* チャンネルオフセット R=0 G=1 B=2 / 位相の並び */
const PLANE_SETS = {
  brg: { phases: [{ name: '青', ch: 2 }, { name: '赤', ch: 0 }, { name: '緑', ch: 1 }] },
  grb: { phases: [{ name: '緑', ch: 1 }, { name: '赤', ch: 0 }, { name: '青', ch: 2 }] },
  rgb: { phases: [{ name: '赤', ch: 0 }, { name: '緑', ch: 1 }, { name: '青', ch: 2 }] },
  all: { phases: [{ name: '3プレーン同時', ch: -1 }] }
};

const $ = id => document.getElementById(id);
const els = {
  compW: $('compW'), compH: $('compH'), patterns: $('patterns'),
  remModeWrap: $('remModeWrap'), remMode: $('remMode'), geo: $('geo'),
  stride: $('stride'), strideHint: $('strideHint'),
  planeOrder: $('planeOrder'), planeHint: $('planeHint'),
  dur: $('dur'), durHint: $('durHint'),
  fileA: $('fileA'), fileB: $('fileB'), dropA: $('dropA'), dropB: $('dropB'),
  thumbA: $('thumbA'), thumbB: $('thumbB'), metaA: $('metaA'), metaB: $('metaB'),
  btnCenter: $('btnCenter'), btnFit: $('btnFit'),
  ovlX: $('ovlX'), ovlY: $('ovlY'), ovlS: $('ovlS'), ovlA: $('ovlA'),
  preview: $('preview'), btnPlay: $('btnPlay'), scrub: $('scrub'), view: $('view'),
  roProg: $('roProg'), roTime: $('roTime'), roPlane: $('roPlane'),
  roPass: $('roPass'), roThr: $('roThr'),
  mapName: $('mapName'), formula: $('formula'),
  btnMap: $('btnMap'), btnParams: $('btnParams'), btnBoth: $('btnBoth'), msgExport: $('msgExport')
};

let pattern = 4;
let G = null;                     // ジオメトリ
let revealMap = null;             // Uint8Array(W*H)  … マップの明度 v
let imgA = null, imgB = null;     // プレビュー用の元 / 重ね合わせ
let baseBuf = null, ovlBuf = null;// コンポ座標に並べ直した RGBA
let outBuf = null, outImg = null; // 出力
let playing = false, t0 = 0;

const ctx = els.preview.getContext('2d', { willReadFrequently: true });

/* ------------------------------------------------------------------ 幾何 */
function boundaries(total, n, mode) {
  const b = new Int32Array(n + 1);
  if (mode === 'even') { for (let i = 0; i <= n; i++) b[i] = Math.floor(i * total / n); }
  else { const q = Math.floor(total / n); for (let i = 0; i < n; i++) b[i] = i * q; b[n] = total; }
  return b;
}

function geometry(pat, W, H, remMode) {
  let cols, rows;
  if (pat === 5) { cols = Math.floor(W / 8) * 8; rows = H; }
  else { cols = 640; rows = (pat === 1 || pat === 3) ? 200 : 400; }
  const mode = (pat === 5) ? 'edge' : (remMode || 'even');
  const cellW = Math.floor(W / cols), cellH = Math.floor(H / rows);
  return {
    W, H, cols, rows, cellW, cellH, mode,
    bx: boundaries(W, cols, mode), by: boundaries(H, rows, mode),
    bpl: cols / 8, total: (cols / 8) * rows,
    remW: W - cellW * cols, remH: H - cellH * rows
  };
}

function patternError(pat, W, H) {
  const p = PATTERNS.find(x => x.id === pat);
  if (p.fixed && (W !== p.fixed[0] || H !== p.fixed[1]))
    return `パターン${pat} はコンポが ${p.fixed[0]}×${p.fixed[1]} のとき専用です（現在 ${W}×${H}）。`;
  if (pat === 5 && W < 8) return 'コンポの幅が 8px 未満です。';
  if (pat !== 5) {
    const g = geometry(pat, W, H, 'edge');
    if (g.cellW < 1) return `コンポの幅が ${g.cols}px 未満なので ${g.cols} 等分できません。パターン5 を使ってください。`;
    if (g.cellH < 1) return `コンポの高さが ${g.rows}px 未満なので ${g.rows} 等分できません。パターン5 を使ってください。`;
  }
  return null;
}

const gcd = (a, b) => b ? gcd(b, a % b) : a;
const getStride = () => Math.max(1, Math.min(255, parseInt(els.stride.value, 10) || 11));
const getPhases = () => (PLANE_SETS[els.planeOrder.value] || PLANE_SETS.brg).phases;
const getDur = () => Math.max(0.05, Number(els.dur.value) || 1.44);

/* ------------------------------------------------------- リビールマップ */
function buildMap() {
  const { W, H, bpl, total, rows, bx, by } = G;
  const stride = getStride();
  revealMap = new Uint8Array(W * H);
  for (let line = 0; line < rows; line++) {
    const y0 = by[line], y1 = by[line + 1];
    for (let bi = 0; bi < bpl; bi++) {
      const a = line * bpl + bi;
      const s = ((a % stride) + a / total) / stride;      // ∈ [0,1)
      // 0 は使わない。AE の「しきい値」は輝度 0 の画素を決して黒にしない
      const v = 1 + Math.floor(254 * s);        // s < 1 なので 1〜254
      const x0 = bx[bi * 8], x1 = bx[bi * 8 + 8];
      for (let y = y0; y < y1; y++) revealMap.fill(v, y * W + x0, y * W + x1);
    }
  }
}

/* ---------------------------------------------------------- 画像の配置 */
function imageFromSource(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0);
      res({ w: c.width, h: c.height, canvas: c });
    };
    im.onerror = () => rej(new Error('画像を読み込めませんでした'));
    im.src = src;
  });
}

async function loadFile(slot, file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await imageFromSource(url);
    if (slot === 'A') { imgA = img; imgA.label = file.name; }
    else { imgB = img; imgB.label = file.name; }
    drawThumb(slot === 'A' ? els.thumbA : els.thumbB, img.canvas);
    (slot === 'A' ? els.dropA : els.dropB).classList.add('filled');
    (slot === 'A' ? els.metaA : els.metaB).textContent = `${file.name} — ${img.w}×${img.h}`;
    if (slot === 'A' && (!imgB || confirmCompFromBase())) { /* noop */ }
    layout(); render();
  } catch (e) { setMsg(e.message, 'err'); }
  finally { URL.revokeObjectURL(url); }
}

function confirmCompFromBase() { return false; }

function solidCanvas(w, h, color) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
  return { w, h, canvas: c, label: color };
}

function drawThumb(canvas, src) {
  const sc = Math.min(1, 360 / src.width);
  canvas.width = Math.max(1, Math.round(src.width * sc));
  canvas.height = Math.max(1, Math.round(src.height * sc));
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = sc < 1;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/** 元 / 重ね合わせをコンポ座標の RGBA バッファへ並べ直す */
function layout() {
  const W = G.W, H = G.H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });

  g.clearRect(0, 0, W, H);
  if (imgA) { g.imageSmoothingEnabled = false; g.drawImage(imgA.canvas, 0, 0); }
  baseBuf = g.getImageData(0, 0, W, H).data;

  g.clearRect(0, 0, W, H);
  if (imgB) {
    const sc = (Number(els.ovlS.value) || 100) / 100;
    const x = Math.round(Number(els.ovlX.value) || 0), y = Math.round(Number(els.ovlY.value) || 0);
    g.imageSmoothingEnabled = sc !== Math.round(sc);
    g.globalAlpha = Math.max(0, Math.min(1, (Number(els.ovlA.value) || 0) / 100));
    g.drawImage(imgB.canvas, x, y, Math.round(imgB.w * sc), Math.round(imgB.h * sc));
    g.globalAlpha = 1;
  }
  ovlBuf = g.getImageData(0, 0, W, H).data;

  els.preview.width = W; els.preview.height = H;
  outBuf = new Uint8ClampedArray(W * H * 4);
  outImg = new ImageData(outBuf, W, H);
}

/* -------------------------------------------------------------- 描画 */
function thresholds(tau) {
  const ph = getPhases(), n = ph.length;
  return ph.map((_, p) => 255 * Math.max(0, Math.min(1, n * tau - p)));
}

/** チャンネル c (0=R,1=G,2=B) が属する位相の index */
function phaseOfChannel() {
  const ph = getPhases();
  if (ph.length === 1) return [0, 0, 0];
  const m = [0, 0, 0];
  ph.forEach((p, i) => { m[p.ch] = i; });
  return m;
}

function render() {
  if (!G || !revealMap) return;
  const W = G.W, H = G.H, n = W * H;
  const tau = Number(els.scrub.value) / 1000;
  const T = thresholds(tau);
  const pc = phaseOfChannel();
  const mode = els.view.value;

  if (mode === 'map') {
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const v = revealMap[i];
      outBuf[o] = v; outBuf[o + 1] = v; outBuf[o + 2] = v; outBuf[o + 3] = 255;
    }
  } else if (mode === 'mask') {
    const tr = T[pc[0]], tg = T[pc[1]], tb = T[pc[2]];
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const v = revealMap[i];
      outBuf[o] = v < tr ? 255 : 0;
      outBuf[o + 1] = v < tg ? 255 : 0;
      outBuf[o + 2] = v < tb ? 255 : 0;
      outBuf[o + 3] = 255;
    }
  } else {
    const tr = T[pc[0]], tg = T[pc[1]], tb = T[pc[2]];
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const v = revealMap[i];
      const a = ovlBuf[o + 3] / 255;
      const br = baseBuf[o], bg = baseBuf[o + 1], bb = baseBuf[o + 2];
      outBuf[o]     = (v < tr) ? br + a * (ovlBuf[o] - br)         : br;
      outBuf[o + 1] = (v < tg) ? bg + a * (ovlBuf[o + 1] - bg)     : bg;
      outBuf[o + 2] = (v < tb) ? bb + a * (ovlBuf[o + 2] - bb)     : bb;
      outBuf[o + 3] = 255;
    }
  }
  ctx.putImageData(outImg, 0, 0);
  readout(tau, T);
}

function readout(tau, T) {
  const ph = getPhases(), n = ph.length, stride = getStride(), dur = getDur();
  els.roProg.textContent = (tau * 100).toFixed(1) + ' %';
  els.roTime.textContent = (tau * dur).toFixed(2) + ' s';
  const gp = n * tau;
  const pi = Math.min(n - 1, Math.floor(gp));
  els.roPlane.textContent = tau >= 1 ? '完了' : (tau <= 0 ? '—' : ph[pi].name);
  const within = Math.max(0, Math.min(1, gp - pi));
  els.roPass.textContent = tau >= 1 ? `${stride} / ${stride}`
    : (within === 0 ? `0 / ${stride}` : `${Math.min(stride, Math.floor(within * stride) + 1)} / ${stride}`);
  const pc = phaseOfChannel();
  els.roThr.textContent = [T[pc[0]], T[pc[1]], T[pc[2]]].map(v => v.toFixed(1)).join(' / ');
}

/* -------------------------------------------------------------- 更新 */
function setMsg(text, cls) { els.msgExport.textContent = text || ''; els.msgExport.className = 'msg' + (cls ? ' ' + cls : ''); }

function renderPatternList() {
  const W = Math.max(8, parseInt(els.compW.value, 10) || 1920);
  const H = Math.max(1, parseInt(els.compH.value, 10) || 1080);
  els.patterns.innerHTML = '';
  for (const p of PATTERNS) {
    const lab = document.createElement('label');
    lab.className = 'pat' + (p.id === pattern ? ' sel' : '');
    const rb = document.createElement('input');
    rb.type = 'radio'; rb.name = 'pattern'; rb.value = p.id; rb.checked = p.id === pattern;
    rb.addEventListener('change', () => { pattern = p.id; refresh(); });
    const box = document.createElement('div');
    const b = document.createElement('b'); b.textContent = `${p.id}. ${p.title}`;
    const s = document.createElement('span'); s.textContent = p.desc;
    box.append(b, s); lab.append(rb, box);
    if (patternError(p.id, W, H)) lab.classList.add('bad');
    els.patterns.appendChild(lab);
  }
}

function refresh() {
  const W = Math.max(8, parseInt(els.compW.value, 10) || 1920);
  const H = Math.max(1, parseInt(els.compH.value, 10) || 1080);
  renderPatternList();

  const err = patternError(pattern, W, H);
  if (err) {
    els.geo.textContent = '⚠ ' + err;
    els.remModeWrap.hidden = true;
    G = null; revealMap = null;
    els.btnMap.disabled = els.btnParams.disabled = els.btnBoth.disabled = true;
    return;
  }
  els.btnMap.disabled = els.btnParams.disabled = els.btnBoth.disabled = false;

  G = geometry(pattern, W, H, els.remMode.value);
  els.remModeWrap.hidden = (pattern === 5) || (!G.remW && !G.remH);
  buildMap();
  layout();
  showGeometry();
  render();
}

function showGeometry() {
  const stride = getStride(), ph = getPhases(), dur = getDur();
  const L = [];
  L.push(`コンポジション  : ${G.W} × ${G.H}`);
  L.push(`ドット格子      : ${G.cols} × ${G.rows}`);
  if (!G.remW && !G.remH) L.push(`1 ドットの画素数: ${G.cellW} × ${G.cellH} px（割り切れ）`);
  else if (G.mode === 'even')
    L.push(`1 ドットの画素数: ${G.remW ? G.cellW + '〜' + (G.cellW + 1) : G.cellW} × ${G.remH ? G.cellH + '〜' + (G.cellH + 1) : G.cellH} px（余りを均等分配）`);
  else {
    L.push(`1 ドットの画素数: ${G.cellW} × ${G.cellH} px（余り 右端 +${G.remW}px / 下端 +${G.remH}px）`);
    if (G.remW > G.cellW || G.remH > G.cellH)
      L.push(`⚠ 余りが 1 ドット分より大きく、右端／下端が不自然に太くなります（右端 ${G.cellW + G.remW}px / 下端 ${G.cellH + G.remH}px）。「均等に分配」を検討してください。`);
  }
  L.push(`バイト格子      : ${G.bpl} × ${G.rows} = ${G.total.toLocaleString()} セル`);
  L.push(`パス数          : ${ph.length} プレーン × ${stride} パス = ${ph.length * stride} 回`);
  const shift = G.bpl % stride;
  L.push(`ライン間のずれ  : ${shift} セル = ${shift * 8 * G.cellW} px` + (gcd(stride, G.bpl) === 1 ? '' : '  ← 互いに素でないため縦縞になります'));
  L.push(`マップの分解能  : 1 パスあたり ${(254 / stride).toFixed(1)} 階調 / 1 階調 = ${(dur / ph.length / 255 * 1000).toFixed(1)} ms`);
  els.geo.textContent = L.join('\n');

  els.strideHint.textContent = `実機は 11。1 ライン下がるごとに ${shift} セル右へずれます。`;
  els.planeHint.textContent = ph.length === 1
    ? 'マスク1つで済むので最も軽い構成です。色の段取りは出ません。'
    : `${ph.map(p => p.name).join(' → ')} の順。マスクは同じマップをしきい値 1/${ph.length} ずつずらして ${ph.length} 個。`;
  els.durHint.textContent = `1 パス ${(dur / (ph.length * stride) * 1000).toFixed(1)} ms 相当。実機は 43.5 ms（全体 1.44 秒）。`;

  const n = ph.length;
  els.formula.textContent =
    `prog_p = clamp(${n} × τ − p, 0, 1)          τ = 経過 / 全体尺 (0〜1)\n` +
    ph.map((p, i) => `  p=${i} … ${p.name}${p.ch >= 0 ? '（' + 'RGB'[p.ch] + ' チャンネル）' : ''}  しきい値 = 255 × prog_${i}`).join('\n');

  els.mapName.textContent = mapFileName();
}

function mapFileName() {
  return `revealmap_${G.W}x${G.H}_p${pattern}_s${getStride()}_${G.mode}.png`;
}

/* -------------------------------------------------------------- 書き出し */
function mapBlob() {
  const c = document.createElement('canvas'); c.width = G.W; c.height = G.H;
  const g = c.getContext('2d');
  const d = g.createImageData(G.W, G.H);
  for (let i = 0, o = 0; i < revealMap.length; i++, o += 4) {
    const v = revealMap[i];
    d.data[o] = v; d.data[o + 1] = v; d.data[o + 2] = v; d.data[o + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

function paramsObject() {
  const ph = getPhases(), stride = getStride(), dur = getDur();
  return {
    tool: 'stride11-fade / reveal map',
    generated: new Date().toISOString(),
    comp: { width: G.W, height: G.H },
    pattern, remainderMode: G.mode,
    grid: { cols: G.cols, rows: G.rows, cellW: G.cellW, cellH: G.cellH, bytesPerLine: G.bpl, cells: G.total },
    stride,
    planeOrder: els.planeOrder.value,
    phases: ph.map((p, i) => ({ index: i, name: p.name, channel: p.ch < 0 ? 'RGB' : 'RGB'[p.ch] })),
    durationSeconds: dur,
    msPerPass: dur / (ph.length * stride) * 1000,
    mapFile: mapFileName(),
    mask: {
      note: 'マップの明度 v (1-254) が小さいほど早く塗られる。プレーン p のマスクは v < 255*prog_p。',
      progExpression: `prog_p = clamp(${ph.length} * tau - p, 0, 1)`,
      thresholdExpression: 'threshold_p = 255 * prog_p',
      thresholdHint: 'AE ではマップに「しきい値」を適用し、レベルを 0→最大 へ動かして、重ね合わせに「ルミナンス反転」トラックマットを掛ける。Levels は AE 26 でレベル系プロパティが式もキーフレームも受け付けないため使わないこと。'
    }
  };
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/* --- 無圧縮 ZIP -------------------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function buildZip(entries) {
  const enc = new TextEncoder(), now = new Date();
  const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const parts = [], central = []; let off = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const flags = name.some(b => b > 127) ? 0x0800 : 0;
    const crc = crc32(e.data);
    const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dt, true); lv.setUint16(12, dd, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30); parts.push(lh, e.data);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dt, true); cv.setUint16(14, dd, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, off, true); ch.set(name, 46);
    central.push(ch); off += lh.length + e.data.length;
  }
  const cd = central.reduce((s, c) => s + c.length, 0);
  const eo = new Uint8Array(22), ev = new DataView(eo.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cd, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, eo], { type: 'application/zip' });
}

/* -------------------------------------------------------------- 再生 */
function play() {
  if (playing) { playing = false; els.btnPlay.textContent = '▶ 再生'; return; }
  playing = true; els.btnPlay.textContent = '⏸ 停止';
  const dur = getDur() * 1000;
  let start = performance.now() - (Number(els.scrub.value) / 1000 >= 1 ? 0 : Number(els.scrub.value) / 1000 * dur);
  if (Number(els.scrub.value) >= 1000) start = performance.now();
  const step = now => {
    if (!playing) return;
    const tau = Math.min(1, (now - start) / dur);
    els.scrub.value = Math.round(tau * 1000);
    render();
    if (tau >= 1) { playing = false; els.btnPlay.textContent = '▶ 再生'; return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* -------------------------------------------------------------- 配線 */
['compW', 'compH', 'stride', 'remMode', 'planeOrder', 'dur'].forEach(k => {
  els[k].addEventListener('input', refresh);
  els[k].addEventListener('change', refresh);
});
['ovlX', 'ovlY', 'ovlS', 'ovlA'].forEach(k => {
  els[k].addEventListener('input', () => { layout(); render(); });
});
els.scrub.addEventListener('input', () => { playing = false; els.btnPlay.textContent = '▶ 再生'; render(); });
els.view.addEventListener('change', render);
els.btnPlay.addEventListener('click', play);

els.fileA.addEventListener('change', e => loadFile('A', e.target.files[0]));
els.fileB.addEventListener('change', e => loadFile('B', e.target.files[0]));
for (const [slot, drop] of [['A', els.dropA], ['B', els.dropB]]) {
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); loadFile(slot, e.dataTransfer.files[0]); });
}
document.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', () => {
  imgA = solidCanvas(G ? G.W : 1920, G ? G.H : 1080, b.dataset.color);
  drawThumb(els.thumbA, imgA.canvas); els.dropA.classList.add('filled');
  els.metaA.textContent = `${b.dataset.color} — ${imgA.w}×${imgA.h}`;
  layout(); render();
}));
document.querySelectorAll('[data-comp]').forEach(b => b.addEventListener('click', () => {
  const [w, h] = b.dataset.comp.split(',');
  els.compW.value = w; els.compH.value = h; refresh();
}));
els.btnCenter.addEventListener('click', () => {
  if (!imgB || !G) return;
  const sc = (Number(els.ovlS.value) || 100) / 100;
  els.ovlX.value = Math.round((G.W - imgB.w * sc) / 2);
  els.ovlY.value = Math.round((G.H - imgB.h * sc) / 2);
  layout(); render();
});
els.btnFit.addEventListener('click', () => {
  if (!imgB || !G) return;
  const sc = Math.min(G.W / imgB.w, G.H / imgB.h);
  els.ovlS.value = Math.round(sc * 100);
  const s2 = Math.round(sc * 100) / 100;
  els.ovlX.value = Math.round((G.W - imgB.w * s2) / 2);
  els.ovlY.value = Math.round((G.H - imgB.h * s2) / 2);
  layout(); render();
});

els.btnMap.addEventListener('click', async () => {
  download(await mapBlob(), mapFileName());
  setMsg(`${mapFileName()} を保存しました。`, 'ok');
});
els.btnParams.addEventListener('click', () => {
  const j = JSON.stringify(paramsObject(), null, 2);
  download(new Blob([j], { type: 'application/json' }), 'stride11_fade_params.json');
  setMsg('stride11_fade_params.json を保存しました。', 'ok');
});
els.btnBoth.addEventListener('click', async () => {
  const png = new Uint8Array(await (await mapBlob()).arrayBuffer());
  const json = new TextEncoder().encode(JSON.stringify(paramsObject(), null, 2));
  const zip = buildZip([{ name: mapFileName(), data: png }, { name: 'stride11_fade_params.json', data: json }]);
  download(zip, `stride11_fade_${G.W}x${G.H}.zip`);
  setMsg(`ZIP を保存しました（${(zip.size / 1024).toFixed(0)} KB）。`, 'ok');
});

/* 初期化 */
imgA = solidCanvas(1920, 1080, '#000000');
drawThumb(els.thumbA, imgA.canvas); els.dropA.classList.add('filled');
els.metaA.textContent = '黒一色 — 1920×1080';
refresh();
