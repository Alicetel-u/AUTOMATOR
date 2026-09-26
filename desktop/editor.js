/* Placement window: the lyric MV stays as it was timed. Clips of pictures and video
   sit on tracks behind or in front of the letters and are drawn into the same MP4. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const LS_KEY = 'jizura.project.v1';
const E = { project: null, plan: null, audio: null, renderer: new J.Renderer(), t: 0, playing: false, t0: 0, selected: null, drag: null };
const bc = (() => { try { return new BroadcastChannel('jizura'); } catch (e) { return null; } })();

function readProject() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
  if (!raw || typeof raw.lyrics !== 'string') raw = J.defaultProject();
  if (!Array.isArray(raw.clips)) raw.clips = [];
  if (!raw.clips.length && raw.characterName) {
    const c = raw.character || {};
    raw.clips = [{ id: 'legacy', place: c.place === 'front' ? 'front' : 'back', name: raw.characterName, kind: 'image', start: 0, trim: 0, dur: 86400, x: c.x, y: c.y, s: c.s }];
  }
  raw.clips = raw.clips.slice(0, 8);
  return raw;
}
function writeClips() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) {}
  raw.clips = E.project.clips;
  delete raw.character; delete raw.characterName;
  localStorage.setItem(LS_KEY, JSON.stringify(raw));
  if (E.plan) E.plan.clips = E.project.clips;
  if (bc) bc.postMessage({ type: 'clips' });
}
function audioLike() {
  if (!E.audio) return null;
  const a = Object.assign({}, E.audio);
  const T = E.project.timing || {};
  if (T.bpm > 0 && J.beatGrid) a.beats = J.beatGrid(T.bpm, T.beatOffset || 0, E.audio.duration);
  return a;
}
function replan() {
  const project = Object.assign({}, E.project, { keyBg: 'off' });
  E.plan = J.plan(project, audioLike());
  E.plan.clips = E.project.clips;
  if (E.t > E.plan.duration) E.t = 0;
  let changed = false;
  for (const c of E.project.clips) {
    const before = c.start + '/' + c.dur;
    normalizeClip(c);
    if (before !== c.start + '/' + c.dur) changed = true;
  }
  if (changed) writeClips();
  size(); renderTimeline();
}
function clipSpan(c) {
  const total = Math.max(0.2, E.plan ? E.plan.duration : 1);
  const start = J.clamp(+c.start || 0, 0, total);
  const dur = J.clamp(+c.dur || 0.2, 0.2, Math.max(0.2, total - Math.min(start, total - 0.2)));
  return { start: Math.min(start, total - dur), dur };
}
/* keep a clip inside the song. A legacy "whole length" value stored as a huge duration is cut down here. */
function normalizeClip(c) {
  const sp = clipSpan(c);
  c.start = sp.start;
  c.dur = sp.dur;
}
function visible() {
  const D = Math.max(0.001, E.plan ? E.plan.duration : 1);
  if (!E.view) return { t0: 0, dur: D };
  const dur = J.clamp(E.view.dur, Math.min(1, D), D);
  const t0 = J.clamp(E.view.t0, 0, Math.max(0, D - dur));
  return { t0, dur };
}
function setZoom(dur, anchor) {
  const D = Math.max(0.001, E.plan.duration);
  const cur = visible();
  const next = J.clamp(dur, Math.min(1, D), D);
  if (next >= D - 0.05) { E.view = null; renderTimeline(); return; }
  const a = anchor == null ? E.t : anchor;
  const f = J.clamp((a - cur.t0) / cur.dur, 0, 1);
  E.view = { t0: a - f * next, dur: next };
  renderTimeline();
}
/* drag.mode: move | r | l. Video cannot extend past the file; an image can grow from the left edge. */
function applyClipEdit(c, drag, dt, total, mediaDur) {
  const video = drag.kind === 'video' && mediaDur > 0;
  const media = video ? mediaDur : Infinity;
  if (drag.mode === 'move') {
    const dur = Math.min(drag.dur, total);
    let start = J.clamp(drag.start + dt, 0, Math.max(0, total - dur));
    if (Math.abs(start - E.t) < 0.1) start = J.clamp(E.t, 0, Math.max(0, total - dur));
    c.start = start; c.dur = dur; c.trim = drag.trim;
    return;
  }
  if (drag.mode === 'r') {
    let dur = J.clamp(drag.dur + dt, 0.2, Math.max(0.2, Math.min(total - drag.start, media - drag.trim)));
    if (Math.abs(drag.start + dur - E.t) < 0.1) dur = J.clamp(E.t - drag.start, 0.2, Math.max(0.2, Math.min(total - drag.start, media - drag.trim)));
    c.start = drag.start; c.trim = drag.trim; c.dur = dur;
    return;
  }
  const room = video ? drag.trim : drag.start;
  const minStart = Math.max(0, drag.start - room);
  const maxStart = drag.start + drag.dur - 0.2;
  const next = J.clamp(drag.start + dt, minStart, Math.max(minStart, maxStart));
  const delta = next - drag.start;
  c.start = next;
  c.dur = drag.dur - delta;
  c.trim = video ? drag.trim + delta : 0;
}
function dropEl(id) {
  const rec = J.clips[id]; if (!rec) return;
  if (rec.url) URL.revokeObjectURL(rec.url);
  if (rec.el) { if (rec.el.pause) rec.el.pause(); if (rec.el.remove) rec.el.remove(); }
  delete J.clips[id];
}
async function attach(clip, file) {
  const isVideo = clip.kind === 'video' || (file.type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const url = URL.createObjectURL(file);
  const el = isVideo ? document.createElement('video') : new Image();
  if (isVideo) {
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.volume = 0;
    el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(el);
  }
  await new Promise((res, rej) => {
    const bad = () => rej(new Error('read'));
    if (isVideo) { el.addEventListener('loadeddata', () => res(), { once: true }); el.addEventListener('error', bad, { once: true }); el.src = url; el.load(); }
    else { el.onload = () => res(); el.onerror = bad; el.src = url; }
  });
  dropEl(clip.id);
  clip.kind = isVideo ? 'video' : 'image';
  J.clips[clip.id] = { el, url, kind: clip.kind, name: file.name, mediaDur: isVideo ? el.duration : 0 };
}
async function loadClips() {
  const keep = new Set(E.project.clips.map(c => c.id));
  for (const id of Object.keys(J.clips)) if (!keep.has(id)) dropEl(id);
  for (const c of E.project.clips) {
    if (J.clips[c.id] && J.clips[c.id].name === c.name) continue;
    const f = await J.loadClipFile(c.id);
    if (f) { try { await attach(c, f); } catch (e) {} }
  }
}

const AP = { ctx: null, src: null, startAt: 0 };
function playAudio() {
  if (!E.audio) return;
  if (!AP.ctx) AP.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (AP.ctx.state === 'suspended') AP.ctx.resume();
  stopAudio();
  const s = AP.ctx.createBufferSource(); s.buffer = E.audio.buffer; s.connect(AP.ctx.destination);
  const off = Math.max(0, Math.min(E.t, E.audio.buffer.duration - 0.01));
  s.start(0, off); AP.src = s; AP.startAt = AP.ctx.currentTime - off;
}
function stopAudio() { if (AP.src) { try { AP.src.stop(); } catch (e) {} AP.src = null; } }
function audioTime() { return AP.ctx ? AP.ctx.currentTime - AP.startAt : 0; }

function syncVideos(playing) {
  for (const c of E.project.clips) {
    const rec = J.clips[c.id];
    if (!rec || rec.kind !== 'video' || !(rec.el.duration > 0)) continue;
    const v = rec.el, sp = clipSpan(c);
    const active = E.t >= sp.start && E.t < sp.start + sp.dur;
    const local = (+c.trim || 0) + (E.t - sp.start);
    if (!active || !playing || local >= v.duration - 0.05) {
      v.pause();
      if (active && Math.abs(v.currentTime - local) > 0.045) { try { v.currentTime = Math.min(Math.max(0, local), v.duration - 0.04); } catch (e) {} }
      continue;
    }
    if (v.paused) {
      try { v.currentTime = Math.max(0, local); } catch (e) {}
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    } else if (Math.abs(v.currentTime - local) > 0.2) {
      try { v.currentTime = Math.max(0, local); } catch (e) {}
    }
  }
}
function draw() {
  const c = $('view'), ctx = c.getContext('2d');
  E.renderer.frame(ctx, E.plan, E.t, { scale: c.width / E.plan.W, fast: E.playing });
  const clip = E.project.clips.find(x => x.id === E.selected);
  const rec = clip && J.clips[clip.id];
  if (clip && rec && rec.el) {
    const box = J.characterBox(E.plan, clip, rec.el);
    if (box) {
      const k = c.width / E.plan.W, rect = c.getBoundingClientRect();
      const px = 14 * E.plan.W / Math.max(1, rect.width);
      ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.strokeStyle = '#f5a50c'; ctx.lineWidth = 2 * E.plan.W / Math.max(1, rect.width);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = '#f5a50c'; ctx.fillRect(box.x + box.w - px, box.y + box.h - px, px, px);
      ctx.restore();
    }
  }
  $('time').textContent = J.fmtTime(E.t) + ' / ' + J.fmtTime(E.plan.duration);
  const head = $('playhead');
  if (head) {
    const v = visible();
    head.style.left = ((E.t - v.t0) / v.dur * 100) + '%';
  }
  const info = $('clipInfo');
  if (info) {
    if (!clip) info.textContent = '';
    else {
      const end = clip.start + clip.dur;
      info.textContent = J.fmtTime(clip.start) + ' – ' + J.fmtTime(end) + (clip.kind === 'video' ? '  ソース ' + J.fmtTime(clip.trim || 0) : '');
    }
  }
}
function size() {
  const stage = $('stage'), c = $('view');
  const ar = E.plan.W / E.plan.H;
  let w = stage.clientWidth - 24, h = w / ar;
  const maxH = Math.max(160, stage.clientHeight - 16);
  if (h > maxH) { h = maxH; w = h * ar; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(Math.min(E.plan.W, w * dpr));
  c.width = pw; c.height = Math.round(pw / ar);
  c.style.width = w + 'px'; c.style.height = (w / ar) + 'px';
}
function seek(t) {
  E.t = J.clamp(t, 0, Math.max(0, E.plan.duration - 1e-3));
  if (E.playing) { if (E.audio) playAudio(); else E.t0 = performance.now() - E.t * 1000; }
  syncVideos(E.playing); draw();
}
function play() {
  if (E.audio) playAudio(); else E.t0 = performance.now() - E.t * 1000;
  E.playing = true; $('btnPlay').textContent = '❚❚'; syncVideos(true);
}
function pause() { E.playing = false; stopAudio(); $('btnPlay').textContent = '▶'; syncVideos(false); draw(); }
function tick(now) {
  requestAnimationFrame(tick);
  if (!E.playing || E.exporting) return;
  let t = E.audio ? audioTime() : (now - E.t0) / 1000;
  if (t >= E.plan.duration - 1e-3) { pause(); t = Math.max(0, E.plan.duration - 1e-3); }
  E.t = t; syncVideos(true); draw();
}

function lanesOf(list) {
  const items = list.map(c => ({ c, start: c.start, dur: c.dur, lane: 0 })).sort((a, b) => a.start - b.start || a.dur - b.dur);
  const ends = [];
  for (const it of items) {
    let lane = ends.findIndex(e => e <= it.start + 0.001);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.start + it.dur;
    it.lane = lane;
  }
  return { items, n: Math.max(1, ends.length) };
}
function posStyle(start, dur) {
  const v = visible();
  const left = (start - v.t0) / v.dur * 100;
  const width = Math.max(0.25, dur / v.dur * 100);
  return `left:${left}%;width:${width}%`;
}
function renderTimeline() {
  const root = $('tracks');
  const v = visible();
  const front = lanesOf(E.project.clips.filter(c => c.place === 'front'));
  const back = lanesOf(E.project.clips.filter(c => c.place !== 'front'));
  const lyricH = 36;
  const laneH = 32;
  const frontH = 8 + front.n * laneH;
  const backH = 8 + back.n * laneH;
  const rulerH = 28;
  const fileBtn = (place, title) => `<button type="button" class="add" data-add="${place}" title="${title}">＋</button>`;
  const clipHtml = (it, h) => {
    const c = it.c;
    return `<i class="block clip${c.id === E.selected ? ' on' : ''}" data-id="${c.id}" style="${posStyle(c.start, c.dur)};top:${4 + it.lane * h}px"><b class="handle l"></b>${escapeHtml(c.name)}<b class="handle r"></b></i>`;
  };
  const lyrics = (E.plan.lines || []).map(ln => {
    const d = Math.max(0.05, ln.end - ln.start);
    return `<i class="block lyric" style="${posStyle(ln.start, d)};top:4px">${escapeHtml(ln.text || '間奏')}</i>`;
  }).join('');
  const ticks = [];
  const colW = ($('timeCol') && $('timeCol').clientWidth) || 640;
  const target = v.dur / Math.max(1, colW / 72);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find(s => s >= target) || 300;
  const first = Math.ceil(v.t0 / step) * step;
  for (let t = first; t < v.t0 + v.dur + 1e-6; t += step) ticks.push(t);
  root.innerHTML =
    `<div class="sheet">` +
      `<div class="gutter">` +
        `<div class="gutter-row gap" style="height:${rulerH}px"></div>` +
        `<div class="gutter-row front" style="height:${frontH}px"><span>文字の前</span>${fileBtn('front', '文字の前に追加')}</div>` +
        `<div class="gutter-row" style="height:${lyricH}px"><span>歌詞</span></div>` +
        `<div class="gutter-row back" style="height:${backH}px"><span>文字の裏</span>${fileBtn('back', '文字の裏に追加')}</div>` +
      `</div>` +
      `<div class="time" id="timeCol">` +
        `<div class="ruler" id="ruler">${ticks.map(t => `<i class="tick" style="left:${(t - v.t0) / v.dur * 100}%"><span>${tickLabel(t)}</span></i>`).join('')}</div>` +
        `<div class="track front" style="height:${frontH}px">${front.items.map(it => clipHtml(it, laneH)).join('')}</div>` +
        `<div class="track" style="height:${lyricH}px">${lyrics}</div>` +
        `<div class="track back" style="height:${backH}px">${back.items.map(it => clipHtml(it, laneH)).join('')}</div>` +
        `<div class="marks">${lineMarks()}</div>` +
        `<div class="playhead" id="playhead"><i></i></div>` +
      `</div>` +
    `</div>`;
  draw();
}
/* the same line-start marks as the original timeline: number, and 間奏. Read-only here. */
function lineMarks() {
  const LT = (E.project.timing && E.project.timing.lineTimes) || {};
  const v = visible();
  return (E.plan.lines || []).map(ln => {
    const left = (ln.start - v.t0) / v.dur * 100;
    if (left < -4 || left > 104) return '';
    const man = LT[ln.index] != null;
    const label = String(ln.index + 1).padStart(2, '0') + (ln.interlude ? ' 間奏' : '');
    const tip = label + (ln.text ? ' ' + ln.text : '');
    return `<i class="mark${man ? ' man' : ''}" style="left:${left}%" title="${escapeHtml(tip)}"><b>${escapeHtml(label)}</b><s></s></i>`;
  }).join('');
}
function tickLabel(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m ? m + ':' + String(s).padStart(2, '0') : s + 's';
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function tAt(ev) {
  const col = $('timeCol'); if (!col) return 0;
  const r = col.getBoundingClientRect();
  const v = visible();
  return J.clamp(v.t0 + (ev.clientX - r.left) / Math.max(1, r.width) * v.dur, 0, E.plan.duration);
}
function placeClipEl(el, c) {
  const v = visible();
  el.style.left = ((c.start - v.t0) / v.dur * 100) + '%';
  el.style.width = Math.max(0.25, c.dur / v.dur * 100) + '%';
}
function bindTimeline() {
  const root = $('tracks');
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.add')) { E.picking = true; return; }
    const clipEl = e.target.closest('.clip');
    if (clipEl) {
      const c = E.project.clips.find(x => x.id === clipEl.dataset.id);
      if (!c) return;
      E.selected = c.id;
      const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
      const rec = J.clips[c.id];
      E.drag = { id: c.id, mode, x: e.clientX, start: c.start, dur: c.dur, trim: +c.trim || 0, kind: c.kind, media: rec && rec.mediaDur || 0, width: $('timeCol').getBoundingClientRect().width, span: visible().dur };
      clipEl.setPointerCapture(e.pointerId);
      root.querySelectorAll('.clip').forEach(el => el.classList.toggle('on', el.dataset.id === c.id));
      draw();
      return;
    }
    E.drag = { scrub: true };
    root.setPointerCapture(e.pointerId);
    seek(tAt(e));
  });
  root.addEventListener('pointermove', e => {
    if (!E.drag || E.drag.preview) return;
    if (E.drag.scrub) { seek(tAt(e)); return; }
    const c = E.project.clips.find(x => x.id === E.drag.id); if (!c) return;
    const dt = (e.clientX - E.drag.x) / Math.max(1, E.drag.width) * E.drag.span;
    applyClipEdit(c, E.drag, dt, E.plan.duration, E.drag.media);
    E.plan.clips = E.project.clips;
    const el = root.querySelector('.clip[data-id="' + c.id + '"]');
    if (el) placeClipEl(el, c);
    draw();
  });
  const end = () => {
    if (!E.drag || E.drag.preview) return;
    const edited = !E.drag.scrub;
    E.drag = null;
    if (edited) { writeClips(); renderTimeline(); }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('wheel', e => {
    const v = visible();
    const anchor = tAt(e);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(v.dur * (e.deltaY > 0 ? 1.18 : 0.84), anchor);
      return;
    }
    if (v.dur < E.plan.duration - 0.05) {
      e.preventDefault();
      E.view = { t0: v.t0 + Math.sign(e.deltaY) * v.dur * 0.1, dur: v.dur };
      renderTimeline();
    }
  }, { passive: false });
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    E.picking = true;
    $(btn.dataset.add === 'front' ? 'addFront' : 'addBack').click();
  });
}
function viewPoint(ev) {
  const c = $('view'), r = c.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / Math.max(1, r.width) * E.plan.W, y: (ev.clientY - r.top) / Math.max(1, r.height) * E.plan.H };
}
function bindPreview() {
  const c = $('view');
  c.addEventListener('pointerdown', e => {
    const clip = E.project.clips.find(x => x.id === E.selected);
    const rec = clip && J.clips[clip.id];
    if (!clip || !rec) return;
    const box = J.characterBox(E.plan, clip, rec.el); if (!box) return;
    const p = viewPoint(e);
    const hs = 18 * E.plan.W / Math.max(1, c.getBoundingClientRect().width);
    const scale = Math.abs(p.x - (box.x + box.w)) <= hs && Math.abs(p.y - (box.y + box.h)) <= hs;
    const inside = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    if (!scale && !inside) return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    E.drag = { preview: true, mode: scale ? 'scale' : 'move', px: p.x, py: p.y, ox: clip.x, oy: clip.y, os: clip.s, cx: box.x + box.w / 2, cy: box.y + box.h / 2, dist: Math.max(8, Math.hypot(p.x - (box.x + box.w / 2), p.y - (box.y + box.h / 2))) };
  });
  c.addEventListener('pointermove', e => {
    if (!E.drag || !E.drag.preview) return;
    const clip = E.project.clips.find(x => x.id === E.selected); if (!clip) return;
    const p = viewPoint(e);
    if (E.drag.mode === 'move') {
      clip.x = J.clamp(E.drag.ox + (p.x - E.drag.px) / E.plan.W, -1, 2);
      clip.y = J.clamp(E.drag.oy + (p.y - E.drag.py) / E.plan.H, -1, 2);
    } else clip.s = J.clamp(E.drag.os * Math.hypot(p.x - E.drag.cx, p.y - E.drag.cy) / E.drag.dist, 0.05, 8);
    draw();
  });
  const end = () => { if (!E.drag || !E.drag.preview) return; E.drag = null; writeClips(); };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}
async function addFiles(place, files) {
  E.adding = true;
  try {
  for (const file of files) {
    if (E.project.clips.length >= 8) { $('msg').textContent = 'クリップは8個までです'; break; }
    const isVideo = (file.type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    const isImage = !isVideo && ((file.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|heic|jfif)$/i.test(file.name) || !(file.type || ''));
    if (!isVideo && !isImage) { $('msg').textContent = file.name + ' は画像か動画にしてください'; continue; }
    const clip = { id: 'c' + Math.random().toString(36).slice(2, 10), place, name: file.name, kind: isVideo ? 'video' : 'image', start: E.t, trim: 0, dur: 4, x: 0.5, y: 0.5, s: 1 };
    try { await attach(clip, file); } catch (e) { $('msg').textContent = file.name + ' を読み込めませんでした'; continue; }
    const saved = await J.saveClipFile(clip.id, file);
    const media = J.clips[clip.id].mediaDur || 0;
    clip.dur = isVideo ? Math.min(media || 4, Math.max(0.4, E.plan.duration - E.t)) : Math.max(0.4, E.plan.duration - E.t);
    E.project.clips.push(clip);
    E.selected = clip.id;
    if (!saved) $('msg').textContent = '保存容量が足りないため、次回はこのクリップを読み戻せません';
  }
  writeClips();
  } finally {
    E.adding = false;
    E.picking = false;
    renderTimeline();
  }
}
function removeSelected() {
  const i = E.project.clips.findIndex(c => c.id === E.selected);
  if (i < 0) return;
  const id = E.project.clips[i].id;
  E.project.clips.splice(i, 1);
  dropEl(id); J.forgetClipFile(id);
  E.selected = null; writeClips(); renderTimeline();
}
async function exportMp4() {
  if (E.exporting) return;
  pause(); E.exporting = true; $('btnExport').disabled = true;
  try {
    const project = Object.assign({}, E.project, { keyBg: 'off' });
    const plan = J.plan(project, audioLike());
    plan.clips = E.project.clips;
    const r = await J.exportMP4({ plan, project, audio: E.audio, onProgress: (p, m) => { $('msg').textContent = m || ''; } });
    if (r && r.blob) {
      await J.saveFile((E.project.title || 'jizura') + '.mp4', r.blob);
      $('msg').textContent = '書き出しました';
    }
  } catch (e) { $('msg').textContent = e.message || String(e); }
  E.exporting = false; $('btnExport').disabled = false;
}
async function boot() {
  E.project = readProject();
  if (E.project.audioName && J.loadSong) {
    try {
      const f = await J.loadSong();
      if (f && f.name === E.project.audioName) E.audio = await J.analyzeAudio(f);
    } catch (e) {}
  }
  replan();
  try { await J.ensureFonts((E.project.lyrics || '') + (E.project.title || ''), J.fontsOfPlan(E.plan)); } catch (e) {}
  await loadClips();
  if (J.autoimgRestore) await J.autoimgRestore(E.project);   // AUTOIMG
  draw();
  $('btnPlay').addEventListener('click', () => E.playing ? pause() : play());
  $('btnExport').addEventListener('click', exportMp4);
  $('btnDelete').addEventListener('click', removeSelected);
  $('zoomOut').addEventListener('click', () => setZoom(visible().dur * 1.4, E.t));
  $('zoomIn').addEventListener('click', () => setZoom(visible().dur / 1.4, E.t));
  $('zoomFit').addEventListener('click', () => { E.view = null; renderTimeline(); });
  bindTimeline(); bindPreview();
  const onPicked = (input, place) => {
    const files = [...input.files];
    input.value = '';
    E.picking = false;
    if (files.length) addFiles(place, files);
  };
  $('addFront').addEventListener('change', () => onPicked($('addFront'), 'front'));
  $('addBack').addEventListener('change', () => onPicked($('addBack'), 'back'));
  window.addEventListener('resize', () => { size(); draw(); });
  const reloadFromMain = () => {
    if (E.drag || E.exporting || E.picking || E.adding) return;
    const t = E.t;
    E.project = readProject();
    replan();
    Promise.all([
      loadClips(),
      J.autoimgRestore ? J.autoimgRestore(E.project) : null,   // AUTOIMG
    ]).then(() => seek(Math.min(t, E.plan.duration || 0)));
  };
  window.addEventListener('focus', () => {
    if (E.picking) { E.picking = false; return; }
    reloadFromMain();
  });
  if (bc) bc.onmessage = (e) => { if (e.data && e.data.type === 'project') reloadFromMain(); };
  requestAnimationFrame(tick);
}
window.addEventListener('DOMContentLoaded', boot);
})();
