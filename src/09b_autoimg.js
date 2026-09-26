/* 自動画像（実験）
   画像を複数渡すと、文字の配置に合わせて後ろに出す。中央の文字なら左右へ寄せ、
   文字が画面中に散るカットは全面を少し暗くする。同じ写真を数カット持ち、
   強調や構図が変わるところで次に替える。配置タイムラインのクリップより奥に描く。
   気に入らなければ画面の「自動の画像を消す」で写真だけ消える。
   仕組みごと外すときはこのファイルを削除し、AUTOIMG と書いた行を消す。
   - src/09_render.js
   - src/08_planner.js
   - src/12_ui.js
   - app/body.html の autoimg-mount
   - desktop/editor.html のこのスクリプト
   - desktop/editor.js の J.autoimgRestore
*/
(() => {
'use strict';

J.autoimgEls = [];

function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no IndexedDB'));
    const r = indexedDB.open('jizura', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  return await new Promise((res, rej) => {
    const q = db.transaction('files', 'readonly').objectStore('files').get(key);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  });
}
async function idbPut(key, value) {
  const db = await openDb();
  await new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(value, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbDeleteAuto() {
  const db = await openDb();
  const keys = await new Promise((res, rej) => {
    const q = db.transaction('files', 'readonly').objectStore('files').getAllKeys();
    q.onsuccess = () => res(q.result || []);
    q.onerror = () => rej(q.error);
  });
  await new Promise(res => {
    const tx = db.transaction('files', 'readwrite');
    for (const k of keys) if (String(k).startsWith('autoimg:')) tx.objectStore('files').delete(k);
    tx.oncomplete = res; tx.onerror = res;
  });
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => res({ el, url });
    el.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    el.src = url;
  });
}
function isImageFile(file) {
  return (file.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|heic|jfif)$/i.test(file.name || '');
}
function rngOf(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const FULL = { scatter: 1, tile: 1, marquee: 1, wave: 1, diag: 1, ring: 1, labels: 1 };

function familyOf(layout) {
  return FULL[layout] ? 'full' : 'side';
}
function dominantLayout(cuts) {
  let best = 'center', bd = -1;
  for (const c of cuts) {
    const d = (+c.end || 0) - (+c.start || 0);
    if (d > bd) { bd = d; best = c.layout || 'center'; }
  }
  return best;
}
function lyricLines(plan) {
  return (plan.lines || []).filter(ln => ln && !ln.interlude && (ln.text || ln.src));
}
/* Complete stagings. A roll picks one of these, so the pictures change look together
   instead of every knob moving on its own. */
const LOOKS = {
  yohaku: { name: '余白', hold: 1.8, impact: true, lineBreak: false, fade: 0.35, forceFull: false, dim: 0.42, sideDim: 0.1, zoom: 0.03, punch: 0.05, drift: 1, panel: 0.46 },
  cinema: { name: '映画', hold: 3.2, impact: true, lineBreak: false, fade: 0.55, forceFull: false, dim: 0.5, sideDim: 0.2, zoom: 0.07, punch: 0, drift: 1.6, panel: 0.52 },
  poster: { name: 'ポスター', hold: 2.6, impact: false, lineBreak: false, fade: 0.18, forceFull: true, dim: 0.52, sideDim: 0.1, zoom: 0.012, punch: 0, drift: 0.15, panel: 0.46 },
  cut: { name: '切り返し', hold: 0.5, impact: true, lineBreak: true, fade: 0.1, forceFull: false, dim: 0.36, sideDim: 0.05, zoom: 0.012, punch: 0.07, drift: 0.25, panel: 0.4 },
  push: { name: '寄り', hold: 2.2, impact: true, lineBreak: false, fade: 0.4, forceFull: false, dim: 0.34, sideDim: 0.08, zoom: 0.14, punch: 0.06, drift: 0.7, panel: 0.48 },
  still: { name: '静止', hold: 4.2, impact: true, lineBreak: false, fade: 0.65, forceFull: false, dim: 0.48, sideDim: 0.16, zoom: 0, punch: 0, drift: 0, panel: 0.44 },
};
const LOOK_IDS = Object.keys(LOOKS);
function lookOf(id) { return LOOKS[id] || LOOKS.yohaku; }

/* One photo is held across quiet cuts. A new photo starts on an impact line,
   or when the text layout family changes after the current photo has been up long enough. */
function buildShots(plan, look) {
  look = look || LOOKS.yohaku;
  const lines = lyricLines(plan);
  const cuts = plan.cuts || [];
  const shots = [];
  let cur = null;
  for (const ln of lines) {
    const mine = cuts.filter(c => c.line === ln.index && !c.companion);
    const layout = dominantLayout(mine);
    const family = familyOf(layout);
    const impact = !!(ln.impact || mine.some(c => c.kime || c.emph));
    const start = ln.start;
    const end = ln.visEnd || ln.end || start;
    if (!cur) {
      cur = { start, end, family, layout, impact };
      shots.push(cur);
      continue;
    }
    const held = start - cur.start;
    if (look.lineBreak || (look.impact && impact) || (family !== cur.family && held >= look.hold)) {
      cur.end = start;
      cur = { start, end, family, layout, impact };
      shots.push(cur);
    } else cur.end = end;
  }
  return appendOutro(plan, shots);
}
/* After the lyrics leave, the song is still going. Fill that tail with full-frame
   photos that keep moving, instead of a frozen side panel and an empty background. */
function appendOutro(plan, shots) {
  const tail = +plan.duration || 0;
  if (!shots.length) return shots;
  const last = shots[shots.length - 1];
  const gap = tail - last.end;
  if (gap < 0.8) {
    if (tail > last.end) last.end = tail;
    return shots;
  }
  const pics = plan.autoimg && plan.autoimg.names ? plan.autoimg.names.length : 1;
  const olook = J.outroLookOf ? J.outroLookOf(plan.outroId) : null;
  const slice = olook && olook.slice || 3.4;
  const n = pics < 2 || (olook && olook.photo === 'hold') ? 1 : Math.max(1, Math.min(pics, Math.round(gap / slice)));
  const step = gap / n;
  for (let i = 0; i < n; i++) {
    shots.push({
      start: last.end + i * step,
      end: i === n - 1 ? tail : last.end + (i + 1) * step,
      family: 'full', layout: 'outro', impact: false, outro: true,
    });
  }
  return shots;
}
function assign(count, imageCount, seed) {
  const n = imageCount | 0;
  const order = [];
  if (!n || !count) return order;
  const rng = rngOf(seed);
  const bag = [...Array(n).keys()];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
  }
  for (let i = 0; i < count; i++) order.push(bag[i % n]);
  if (n > 1) for (let i = 1; i < order.length; i++) if (order[i] === order[i - 1]) order[i] = (order[i] + 1) % n;
  return order;
}
function shotAt(shots, t) {
  let i = 0;
  for (let n = 0; n < shots.length; n++) if (shots[n].start <= t + 1e-4) i = n;
  return i;
}
function panelFor(plan, side, panel) {
  const W = plan.W, H = plan.H;
  const portrait = H > W * 1.05;
  // Vertical frames stay left / right. The column is a bit wider than the first portrait pass, and the inner edge still fades so the lyric down the middle can be read.
  const base = panel || 0.46;
  const frac = portrait ? Math.min(0.56, base + 0.08) : base;
  const bw = W * frac;
  return side === 'left' ? { x: 0, y: 0, w: bw, h: H, fade: 'right' } : { x: W - bw, y: 0, w: bw, h: H, fade: 'left' };
}
function sideFor(i, seed) {
  return ((seed + i) & 1) ? 'right' : 'left';
}
function scratch(w, h) {
  const c = J._autoimgCanvas || (J._autoimgCanvas = document.createElement('canvas'));
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const sx = c.getContext('2d');
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalAlpha = 1;
  sx.globalCompositeOperation = 'source-over';
  sx.clearRect(0, 0, W, H);
  return { c, sx };
}
function cover(sx, el, rect, zoom, drift) {
  const iw = el.naturalWidth || 0, ih = el.naturalHeight || 0;
  if (!iw || !ih) return;
  const s = Math.max(rect.w / iw, rect.h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  sx.save();
  sx.beginPath();
  sx.rect(rect.x, rect.y, rect.w, rect.h);
  sx.clip();
  sx.drawImage(el, rect.x + (rect.w - dw) / 2 + drift, rect.y + (rect.h - dh) / 2, dw, dh);
  sx.restore();
}
function feather(sx, rect, dir) {
  const f = (dir === 'left' || dir === 'right' ? rect.w : rect.h) * 0.55;
  let x0, y0, x1, y1;
  if (dir === 'right') { x0 = rect.x + rect.w - f; y0 = rect.y; x1 = rect.x + rect.w; y1 = rect.y; }
  else if (dir === 'left') { x0 = rect.x + f; y0 = rect.y; x1 = rect.x; y1 = rect.y; }
  else if (dir === 'bottom') { x0 = rect.x; y0 = rect.y + rect.h - f; x1 = rect.x; y1 = rect.y + rect.h; }
  else { x0 = rect.x; y0 = rect.y + f; x1 = rect.x; y1 = rect.y; }
  const g = sx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  sx.save();
  sx.globalCompositeOperation = 'destination-out';
  sx.fillStyle = g;
  sx.fillRect(rect.x, rect.y, rect.w, rect.h);
  sx.restore();
}
function renderPlate(sx, el, plan, shot, index, p, seed, look) {
  if (!el) return;
  look = look || LOOKS.yohaku;
  const family = look.forceFull ? 'full' : shot.family;
  const impact = !!shot.impact;
  const zoom = 1 + look.zoom * p + (impact ? look.punch * (1 - Math.min(1, p * 2)) : 0);
  const drift = ((seed + index * 13) % 7 - 3) * plan.W * 0.004 * look.drift * (p * 2 - 1);
  if (family === 'full' || shot.outro) {
    const olook = shot.outro && J.outroLookOf ? J.outroLookOf(plan.outroId) : null;
    const z = shot.outro ? 1 + ((olook && olook.zoom) || 0.1) * p : zoom;
    const d = shot.outro ? drift * ((olook && olook.drift) || 1.8) : drift;
    cover(sx, el, { x: 0, y: 0, w: plan.W, h: plan.H }, z, d);
    sx.fillStyle = 'rgba(0,0,0,' + (shot.outro ? ((olook && olook.dim) != null ? olook.dim : 0.12) : look.dim) + ')';
    sx.fillRect(0, 0, plan.W, plan.H);
    if (shot.outro) {
      const g = sx.createRadialGradient(plan.W / 2, plan.H / 2, plan.H * 0.2, plan.W / 2, plan.H / 2, plan.H * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      sx.fillStyle = g;
      sx.fillRect(0, 0, plan.W, plan.H);
    }
    return;
  }
  const rect = panelFor(plan, sideFor(index, seed), look.panel);
  cover(sx, el, rect, zoom, drift);
  sx.fillStyle = 'rgba(0,0,0,' + look.sideDim + ')';
  sx.fillRect(rect.x, rect.y, rect.w, rect.h);
  feather(sx, rect, rect.fade);
}

J.autoimgDraw = (ctx, plan, scale, t) => {
  const cfg = plan && plan.autoimg;
  const els = J.autoimgEls;
  if (!cfg || cfg.on === false || !els.length || !plan.W || !plan.H) return;
  const look = lookOf(cfg.look);
  const shots = buildShots(plan, look);
  if (!shots.length) return;
  const order = assign(shots.length, els.length, cfg.seed | 0);
  const i = shotAt(shots, t);
  const shot = shots[i];
  const span = Math.max(0.2, shot.end - shot.start);
  const p = J.clamp((t - shot.start) / span);
  const k = i > 0 ? J.clamp((t - shot.start) / (shot.outro ? Math.max(look.fade, 0.5) : look.fade)) : 1;
  const { c, sx } = scratch(plan.W, plan.H);
  const blit = (index, prog, alpha) => {
    const el = els[order[index]] && els[order[index]].el;
    sx.clearRect(0, 0, c.width, c.height);
    renderPlate(sx, el, plan, shots[index], index, prog, cfg.seed | 0, look);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, 0, 0, plan.W, plan.H);
    ctx.restore();
  };
  if (k < 1) blit(i - 1, 1, 1);
  blit(i, p, k < 1 ? k : 1);
};

function pickLook(current) {
  const choices = LOOK_IDS.filter(id => id !== (current || 'yohaku'));
  return choices[Math.floor(Math.random() * choices.length)] || 'yohaku';
}
J.autoimgReshuffle = (project) => {
  if (project && project.autoimg && project.autoimg.on !== false && project.autoimg.names && project.autoimg.names.length) {
    project.autoimg.seed = (Math.random() * 1e9) | 0;
    project.autoimg.look = pickLook(project.autoimg.look);
  }
  if (J.outroReshuffle) J.outroReshuffle(project);
  J.autoimgStatus && J.autoimgStatus();
};

J.autoimgClear = async (project) => {
  J.autoimgEls.forEach(e => { if (e.url) URL.revokeObjectURL(e.url); });
  J.autoimgEls = [];
  if (project) delete project.autoimg;
  try { await idbDeleteAuto(); } catch (e) {}
  J.autoimgStatus && J.autoimgStatus();
};

J.autoimgRestore = async (project) => {
  const cfg = project && project.autoimg;
  if (!cfg || cfg.on === false || !Array.isArray(cfg.names) || !cfg.names.length) {
    J.autoimgEls.forEach(e => { if (e.url) URL.revokeObjectURL(e.url); });
    J.autoimgEls = [];
    return;
  }
  if (J.autoimgEls.length === cfg.names.length && J.autoimgEls.every((e, i) => e.name === cfg.names[i])) return;
  const next = [];
  for (let i = 0; i < cfg.names.length; i++) {
    try {
      const rec = await idbGet('autoimg:' + i);
      if (!rec || !rec.data) continue;
      const file = new File([rec.data], rec.name || cfg.names[i] || 'image', { type: rec.type || '' });
      const got = await loadImage(file);
      next.push({ el: got.el, url: got.url, name: cfg.names[i] });
    } catch (e) {}
  }
  J.autoimgEls.forEach(e => { if (e.url) URL.revokeObjectURL(e.url); });
  J.autoimgEls = next;
};

let getProject = null, onChange = null;
async function useFiles(list) {
  const project = getProject && getProject();
  if (!project) return;
  const files = [...list].filter(isImageFile).slice(0, 12);
  if (!files.length) return;
  await J.autoimgClear(project);
  const names = [];
  const els = [];
  for (let i = 0; i < files.length; i++) {
    const data = await files[i].arrayBuffer();
    await idbPut('autoimg:' + i, { name: files[i].name, type: files[i].type, data });
    const got = await loadImage(files[i]);
    els.push({ el: got.el, url: got.url, name: files[i].name });
    names.push(files[i].name);
  }
  J.autoimgEls = els;
  const seed = (Math.random() * 1e9) | 0;
  project.autoimg = { on: true, seed, look: 'yohaku', names };
  J.autoimgStatus && J.autoimgStatus();
  if (onChange) onChange();
}
J.autoimgStatus = () => {
  const project = getProject && getProject();
  const n = project && project.autoimg && project.autoimg.on !== false ? (project.autoimg.names || []).length : 0;
  document.querySelectorAll('.autoimg-status').forEach(el => {
    const look = n && project.autoimg ? lookOf(project.autoimg.look).name : '';
    const ending = project && project.outroId && J.outroLookOf ? J.outroLookOf(project.outroId).name : '';
    el.textContent = n ? [look, ending, n + '枚'].filter(Boolean).join('・') : (ending || '画像はまだありません');
  });
};
function mount() {
  document.querySelectorAll('.autoimg-mount').forEach(host => {
    if (host.firstChild) return;
    host.innerHTML = '<p class="note">画像を複数渡すと、文字の配置に合わせて後ろに出します。「演出を変える」で、本編の見せ方と、歌詞が終わったあとの装飾・拍・曲名の出し方も替わります。</p>'
      + '<div class="row"><button type="button" class="ghost autoimg-pick">画像を渡す</button>'
      + '<button type="button" class="ghost autoimg-roll">演出を変える</button>'
      + '<button type="button" class="ghost autoimg-clear">自動の画像を消す</button></div>'
      + '<p class="autoimg-status muted"></p>'
      + '<input class="autoimg-file" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic" multiple hidden>';
    host.querySelector('.autoimg-pick').addEventListener('click', () => host.querySelector('.autoimg-file').click());
    host.querySelector('.autoimg-file').addEventListener('change', e => {
      const files = [...e.target.files];
      e.target.value = '';
      useFiles(files);
    });
    host.querySelector('.autoimg-roll').addEventListener('click', () => {
      const project = getProject && getProject();
      if (!project || !project.autoimg) return;
      J.autoimgReshuffle(project);
      if (onChange) onChange();
    });
    host.querySelector('.autoimg-clear').addEventListener('click', async () => {
      const project = getProject && getProject();
      await J.autoimgClear(project);
      if (onChange) onChange();
    });
  });
  J.autoimgStatus();
}
J.autoimgBind = (getter, change) => {
  getProject = getter;
  onChange = change;
  mount();
};

const OUTRO_LOOKS = {
  afterglow: { name: '余韻', decor: ['rings', 'dots'], count: 2, beat: 'fourth', title: 4.2, photo: 'hold', slice: 8, dim: 0.16, zoom: 0.08, drift: 1.2, cam: 'push' },
  sparks: { name: '火花', decor: ['sparks', 'slash', 'dots'], count: 3, beat: 'every', title: 3.2, photo: 'cut', slice: 2.2, dim: 0.08, zoom: 0.04, drift: 0.4, cam: 'push' },
  frame: { name: '枠', decor: ['brackets', 'barcode', 'leaders'], count: 2, beat: 'none', title: 5, photo: 'hold', slice: 8, dim: 0.2, zoom: 0.03, drift: 0.2, cam: 'push' },
  wave: { name: '波形', decor: ['waveform', 'rings'], count: 2, beat: 'shake', title: 3.6, photo: 'cycle', slice: 3.6, dim: 0.14, zoom: 0.06, drift: 1, cam: 'push' },
  circles: { name: '円', decor: ['rings', 'dots', 'leaders'], count: 3, beat: 'fourth', title: 4, photo: 'cycle', slice: 3.4, dim: 0.12, zoom: 0.05, drift: 0.8, cam: 'push' },
  arrows: { name: '矢印', decor: ['arrows', 'slash', 'brackets'], count: 3, beat: 'other', title: 3, photo: 'cut', slice: 2.4, dim: 0.1, zoom: 0.05, drift: 0.5, cam: 'push' },
  quiet: { name: '静寂', decor: ['dots'], count: 1, beat: 'none', title: 6, photo: 'hold', slice: 8, dim: 0.22, zoom: 0.02, drift: 0, cam: 'push' },
  hits: { name: 'キメ', decor: ['sparks', 'arrows', 'slash'], count: 3, beat: 'both', title: 2.4, photo: 'cut', slice: 1.8, dim: 0.06, zoom: 0.08, drift: 0.3, cam: 'push' },
  credits: { name: 'クレジット', decor: ['brackets', 'leaders'], count: 2, beat: 'none', title: 8, photo: 'hold', slice: 8, dim: 0.28, zoom: 0.06, drift: 0.6, cam: 'push' },
  pulse: { name: '脈', decor: ['dots', 'waveform', 'rings'], count: 3, beat: 'shake', title: 3.6, photo: 'cycle', slice: 2.8, dim: 0.1, zoom: 0.04, drift: 0.9, cam: 'push' },
};
J.OUTRO_LOOKS = OUTRO_LOOKS;
J.OUTRO_IDS = Object.keys(OUTRO_LOOKS);
J.outroLookOf = (id) => OUTRO_LOOKS[id] || OUTRO_LOOKS.afterglow;
J.outroIdFor = (project) => {
  if (project && project.outroId && OUTRO_LOOKS[project.outroId]) return project.outroId;
  return J.OUTRO_IDS[(Math.abs((project && project.seed) || 1) % J.OUTRO_IDS.length)];
};
J.outroReshuffle = (project) => {
  if (!project) return;
  const cur = project.outroId || J.outroIdFor(project);
  const choices = J.OUTRO_IDS.filter(id => id !== cur);
  project.outroId = choices[Math.floor(Math.random() * choices.length)] || 'afterglow';
};
J._autoimgShots = buildShots;
J._autoimgFamily = familyOf;
J._autoimgLook = lookOf;
J._autoimgLooks = LOOK_IDS;
})();
