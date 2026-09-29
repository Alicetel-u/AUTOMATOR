/* Placement window: the lyric MV stays as it was timed. Clips of pictures and video
   sit on tracks behind or in front of the letters and are drawn into the same MP4. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const LS_KEY = 'jizura.project.v1';
const DELETED_SOURCES_KEY = 'jizura.deletedSources.v1';
const SNAP_KEY = 'jizura.editor.snap.v1';
const TRANSITION_NAMES = { none: 'なし', dissolve: 'クロスフェード', flash: 'フラッシュ', wipe: 'ワイプ', slide: 'スライド', zoom: 'ズーム', glitch: 'グリッチ' };
const E = { project: null, plan: null, audio: null, renderer: new J.Renderer(), t: 0, playing: false, t0: 0, selected: null, drag: null,
  history: { current: null, undo: [], redo: [], restoring: false }, clipboard: null, snapEnabled: true };
const bc = (() => { try { return new BroadcastChannel('jizura'); } catch (e) { return null; } })();

function readProject() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
  if (!raw || typeof raw.lyrics !== 'string') raw = Object.assign(J.defaultProject(), raw || {});
  if (!Array.isArray(raw.clips)) raw.clips = [];
  if (!raw.clips.length && raw.characterName) {
    const c = raw.character || {};
    raw.clips = [{ id: 'legacy', place: c.place === 'front' ? 'front' : 'back', name: raw.characterName, kind: 'image', start: 0, trim: 0, dur: 86400, x: c.x, y: c.y, s: c.s }];
  }
  raw.clips = raw.clips.slice(0, 64);
  if (!raw.cutEdits || typeof raw.cutEdits !== 'object') raw.cutEdits = {};
  return raw;
}
function writeClips() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) {}
  raw.clips = E.project.clips;
  raw.cutEdits = E.project.cutEdits;
  if (raw.autoimg && E.project.autoimg && raw.autoimg.seed === E.project.autoimg.seed) {
    raw.autoimg.shots = E.project.autoimg.shots || {};
    raw.autoimg.fills = E.project.autoimg.fills || [];
  }
  delete raw.character; delete raw.characterName;
  localStorage.setItem(LS_KEY, JSON.stringify(raw));
  if (E.plan) E.plan.clips = E.project.clips;
  if (E.plan) { E.plan.cutEdits = E.project.cutEdits; E.plan.autoimg = E.project.autoimg; }
  if ($('msg')) $('msg').textContent = '配置を保存しました';
  if (bc) bc.postMessage({ type: 'clips' });
  recordHistory();
}
function layoutSnapshot() {
  const a = E.project.autoimg || {};
  return JSON.stringify({ clips: E.project.clips, cutEdits: E.project.cutEdits,
    shots: a.shots || {}, fills: a.fills || [] });
}
function recordHistory() {
  const h = E.history, next = layoutSnapshot();
  if (h.restoring) return;
  if (h.current && h.current !== next) {
    h.undo.push(h.current);
    if (h.undo.length > 50) h.undo.shift();
    h.redo.length = 0;
  }
  h.current = next;
}
async function restoreHistory(redo = false) {
  const h = E.history, from = redo ? h.redo : h.undo, to = redo ? h.undo : h.redo;
  if (h.restoring || !from.length) return;
  pause();
  const state = from.pop();
  to.push(h.current);
  const data = JSON.parse(state);
  h.restoring = true;
  try {
    E.project.clips = data.clips;
    E.project.cutEdits = data.cutEdits;
    if (E.project.autoimg) { E.project.autoimg.shots = data.shots; E.project.autoimg.fills = data.fills; }
    E.selected = E.project.clips.some(c => c.id === E.selected) ? E.selected : null;
    h.current = state;
    writeClips(); renderTimeline();
    await loadClips(); seek(E.t);
    $('msg').textContent = redo ? 'やり直しました' : '元に戻しました';
  } finally { h.restoring = false; }
}
function autoShots() { return J.autoimgShots ? J.autoimgShots(E.plan) : []; }
function selectedAuto() {
  if (!E.selected || !E.selected.startsWith('auto:')) return null;
  return autoShots().find(s => s.index === +E.selected.slice(5)) || null;
}
function selectedCut() {
  if (!E.selected || !E.selected.startsWith('cut:')) return null;
  return (E.plan.cuts || []).find(c => c.editKey === E.selected.slice(4)) || null;
}
function saveAuto(shot, values) {
  if (!E.project.autoimg) return;
  if (shot.fill) {
    const fills = E.project.autoimg.fills || (E.project.autoimg.fills = []);
    fills[shot.fillIndex] = Object.assign({}, fills[shot.fillIndex] || {}, values, { locked: true });
    E.plan.autoimg = E.project.autoimg;
    return;
  }
  const shots = E.project.autoimg.shots || (E.project.autoimg.shots = {});
  const key = 't' + Math.round(shot.base * 1000);
  const legacy = shots[shot.index];
  shots[key] = Object.assign({ base: shot.base, start: shot.start, dur: shot.end - shot.start, image: shot.image, x: shot.x, y: shot.y, s: shot.s },
    shots[key] || (legacy && Math.abs((+legacy.base || 0) - shot.base) < 0.1 ? legacy : {}), values, { base: shot.base });
  if (legacy && Math.abs((+legacy.base || 0) - shot.base) < 0.1) delete shots[shot.index];
  E.plan.autoimg = E.project.autoimg;
}
function cutEdit(cut) {
  const saved = E.project.cutEdits[cut.editKey];
  return saved && saved.text === cut.text ? saved : { text: cut.text, x: 0.5, y: 0.5, s: 1 };
}
function saveCut(cut, values) {
  E.project.cutEdits[cut.editKey] = Object.assign({}, cutEdit(cut), values, { text: cut.text });
  E.plan.cutEdits = E.project.cutEdits;
}
function audioLike() {
  if (!E.audio) return null;
  const a = Object.assign({}, E.audio);
  const T = E.project.timing || {};
  if (T.bpm > 0 && J.beatGrid) a.beats = J.beatGrid(T.bpm, T.beatOffset || 0, E.audio.duration);
  return a;
}
function replan() {
  if (J.syncOutroControls) J.syncOutroControls(E.project);
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
    const start = J.clamp(drag.start + dt, 0, Math.max(0, total - dur));
    c.start = start; c.dur = dur; c.trim = drag.trim;
    return;
  }
  if (drag.mode === 'r') {
    const dur = J.clamp(drag.dur + dt, 0.2, Math.max(0.2, Math.min(total - drag.start, media - drag.trim)));
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
function snapClip(target, drag, total) {
  if (!E.snapEnabled) return null;
  const radius = 10 * drag.span / Math.max(1, drag.width);
  const edges = drag.mode === 'move' ? [target.start, target.start + target.dur] :
    [drag.mode === 'r' ? target.start + target.dur : target.start];
  const marks = [{ t: E.t, label: '再生位置' }];
  for (const c of E.project.clips) if (c.id !== drag.id) {
    marks.push({ t: +c.start || 0, label: 'クリップ端' });
    marks.push({ t: (+c.start || 0) + (+c.dur || 0), label: 'クリップ端' });
  }
  const video = drag.kind === 'video' && drag.media > 0;
  let best = null, distance = radius + 1e-9;
  for (const mark of marks) for (const edge of edges) {
    if (mark.t < 0 || mark.t > total) continue;
    const delta = mark.t - edge, d = Math.abs(delta);
    if (d >= distance) continue;
    if (drag.mode === 'move' && (target.start + delta < 0 || target.start + delta + target.dur > total)) continue;
    if (drag.mode === 'r') {
      const maxDur = Math.max(0.2, Math.min(total - drag.start, video ? drag.media - drag.trim : Infinity));
      if (mark.t - drag.start < 0.2 || mark.t - drag.start > maxDur) continue;
    }
    if (drag.mode === 'l') {
      const minStart = Math.max(0, drag.start - (video ? drag.trim : drag.start));
      if (mark.t < minStart || mark.t > drag.start + drag.dur - 0.2) continue;
    }
    best = { t: mark.t, label: mark.label, delta }; distance = d;
  }
  if (!best) return null;
  if (drag.mode === 'move') target.start += best.delta;
  else if (drag.mode === 'r') target.dur = best.t - drag.start;
  else {
    target.start = best.t;
    target.dur = drag.start + drag.dur - best.t;
    target.trim = video ? drag.trim + best.t - drag.start : 0;
  }
  return best;
}
function showSnapGuide(snap) {
  const guide = $('snapGuide');
  if (!guide) return;
  guide.hidden = !snap;
  if (snap) {
    const v = visible();
    guide.style.left = ((snap.t - v.t0) / v.dur * 100) + '%';
    guide.querySelector('span').textContent = snap.label + ' ' + J.fmtTime(snap.t);
  }
}
function dropEl(id) {
  const rec = J.clips[id]; if (!rec) return;
  if (rec.url) URL.revokeObjectURL(rec.url);
  if (rec.el) { if (rec.el.pause) rec.el.pause(); if (rec.el.remove) rec.el.remove(); }
  delete J.clips[id];
}
async function attach(clip, file, preview = false) {
  const isVideo = clip.kind === 'video' || (file.type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const url = URL.createObjectURL(file);
  const el = isVideo ? document.createElement('video') : new Image();
  if (isVideo) {
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.volume = 0;
    el.style.cssText = 'position:fixed;width:2px;height:2px;left:0;top:0;opacity:0.01;pointer-events:none';
    document.body.appendChild(el);
  }
  await new Promise((res, rej) => {
    const bad = () => rej(new Error('read'));
    if (isVideo) { el.addEventListener('loadeddata', () => res(), { once: true }); el.addEventListener('error', bad, { once: true }); el.src = url; el.load(); }
    else { el.onload = () => res(); el.onerror = bad; el.src = url; }
  });
  dropEl(clip.id);
  clip.kind = isVideo ? 'video' : 'image';
  J.clips[clip.id] = { el, url, kind: clip.kind, name: file.name, originalName: clip.name, mediaDur: isVideo ? el.duration : 0, preview };
}
async function loadClips() {
  const keep = new Set(E.project.clips.map(c => c.id));
  for (const id of Object.keys(J.clips)) if (!keep.has(id)) dropEl(id);
  const files = new Map();
  for (const c of E.project.clips) {
    const id = sourceId(c);
    if (!files.has(id)) {
      const preview = c.kind === 'video' ? await J.loadClipPreviewFile(id) : null;
      files.set(id, { preview, file: preview || await J.loadClipFile(id) });
    }
    const { preview, file } = files.get(id);
    const have = J.clips[c.id];
    if (have && have.originalName === c.name && have.preview === !!preview && (!preview || have.name === preview.name)) continue;
    if (file) { try { await attach(c, file, !!preview); } catch (e) {} }
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
  const held = J.clipHeldFrames(E.project.clips, E.t);
  for (const c of E.project.clips) {
    const rec = J.clips[c.id];
    if (!rec || rec.kind !== 'video' || !(rec.el.duration > 0)) continue;
    const v = rec.el, sp = clipSpan(c);
    const active = E.t >= sp.start && E.t < sp.start + sp.dur;
    const hold = held.has(c.id);
    const local = hold ? held.get(c.id) : (+c.trim || 0) + (E.t - sp.start);
    if ((!active && !hold) || !playing || hold || local >= v.duration - 0.05) {
      v.pause();
      if ((active || hold) && Math.abs(v.currentTime - local) > 0.045) { try { v.currentTime = Math.min(Math.max(0, local), v.duration - 0.04); } catch (e) {} }
      continue;
    }
    if (v.paused) {
      if (rec.playPending) continue;
      if (!v.seeking && Math.abs(v.currentTime - local) > 0.1) {
        try { v.currentTime = Math.max(0, local); rec.lastSeek = performance.now(); } catch (e) {}
      }
      try {
        const p = v.play();
        if (p && p.then) {
          rec.playPending = true;
          p.then(() => { rec.playPending = false; }, () => { rec.playPending = false; });
        }
      } catch (e) {}
    } else if (!v.seeking && Math.abs(v.currentTime - local) > 0.5 && performance.now() - (rec.lastSeek || 0) > 1000) {
      try { v.currentTime = Math.max(0, local); rec.lastSeek = performance.now(); } catch (e) {}
    }
  }
}
function draw() {
  const c = $('view'), ctx = c.getContext('2d');
  E.renderer.frame(ctx, E.plan, E.t, { scale: c.width / E.plan.W, fast: E.playing });
  const clip = E.project.clips.find(x => x.id === E.selected);
  const rec = clip && J.clips[clip.id];
  const auto = selectedAuto(), cut = selectedCut();
  if ((clip && rec && rec.el) || auto || cut) {
    const box = controlBox();
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
    if (auto) info.textContent = J.fmtTime(auto.start) + ' – ' + J.fmtTime(auto.end) + (auto.fill ? ' · 補完画像' : ' · 自動画像');
    else if (cut) info.textContent = J.fmtTime(cut.start) + ' – ' + J.fmtTime(cut.end) + ' · 歌詞カット';
    else if (clip) {
      const end = clip.start + clip.dur;
      info.textContent = J.fmtTime(clip.start) + ' – ' + J.fmtTime(end) + (clip.kind === 'video' ? '  ソース ' + J.fmtTime(clip.trim || 0) : '') + (rec && rec.preview ? ' · 軽量プレビュー' : '');
    } else info.textContent = '';
  }
  $('shotImage').hidden = !auto;
  $('btnResetPosition').hidden = !auto && !cut;
  $('btnDelete').disabled = !clip && !(auto && auto.fill);
  $('btnReplace').disabled = !clip || clip.kind !== 'video';
  $('btnSplit').disabled = !selectedSplit();
  $('clipTransitionControls').hidden = !clip;
  if (clip) {
    const select = $('clipTransition'), duration = $('clipTransDuration');
    select.value = TRANSITION_NAMES[clip.transition] ? clip.transition : 'none';
    duration.disabled = select.value === 'none';
    if (document.activeElement !== duration) duration.value = String(+(+clip.transDur || 0.4).toFixed(2));
    $('btnPreviewTransition').disabled = select.value === 'none';
  }
}
function controlBox() {
  const clip = E.project.clips.find(x => x.id === E.selected);
  const rec = clip && J.clips[clip.id];
  if (rec && rec.el) return J.characterBox(E.plan, clip, rec.el);
  const auto = selectedAuto(), cut = selectedCut();
  if (!auto && !cut) return null;
  if (auto && J.autoimgBox) return J.autoimgBox(E.plan, auto);
  const e = auto || cutEdit(cut);
  const zone = cut && cut.zone ? cut.zone : { x: 0, y: 0, w: E.plan.W, h: E.plan.H };
  const w = zone.w * 0.44 * e.s, h = zone.h * 0.44 * e.s;
  return { x: zone.x + e.x * zone.w - w / 2, y: zone.y + e.y * zone.h - h / 2, w, h };
}
function refreshShotPicker() {
  const shot = selectedAuto(), select = $('shotImage');
  if (!shot) { select.hidden = true; return; }
  const names = E.project.autoimg && E.project.autoimg.names || [];
  select.innerHTML = names.map((name, i) => `<option value="${i}">${escapeHtml(name)}</option>`).join('');
  select.value = String(shot.image);
  select.hidden = false;
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
  E.t = t; syncVideos(true);
  if (E.project.clips.some(c => c.kind === 'video') && now - (E.lastDrawAt || 0) < 1000 / 30) return;
  E.lastDrawAt = now;
  draw();
}
function sourceId(c) { return c.sourceId || c.id; }
function deletedSources() {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_SOURCES_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function rememberDeletedSource(id) {
  if (E.project.clips.some(c => sourceId(c) === id)) return;
  const pending = deletedSources();
  pending.add(id);
  localStorage.setItem(DELETED_SOURCES_KEY, JSON.stringify([...pending]));
}
async function finishDeletedSources() {
  const pending = deletedSources();
  if (!pending.size) return;
  const used = new Set(E.project.clips.map(sourceId));
  for (const id of pending) {
    if (!used.has(id) && !await J.forgetClipFile(id)) continue;
    pending.delete(id);
  }
  localStorage.setItem(DELETED_SOURCES_KEY, JSON.stringify([...pending]));
}
function selectedSplit() {
  const clip = E.project.clips.find(c => c.id === E.selected);
  if (!clip || clip.kind !== 'video' || E.project.clips.length >= 64) return null;
  const sp = clipSpan(clip);
  return E.t > sp.start + 0.2 && E.t < sp.start + sp.dur - 0.2 ? clip : null;
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
  const shots = autoShots();
  const auto = lanesOf(shots.map(s => Object.assign({}, s, { dur: s.end - s.start })));
  const lyricH = 36;
  const laneH = 32;
  const autoH = shots.length ? 8 + auto.n * laneH : 0;
  const frontH = 8 + front.n * laneH;
  const backH = 8 + back.n * laneH;
  const rulerH = 28;
  const fileBtn = (place, title) => `<button type="button" class="add" data-add="${place}" title="${title}">＋</button>`;
  const clipHtml = (it, h) => {
    const c = it.c;
    const trans = TRANSITION_NAMES[c.transition] && c.transition !== 'none' ? c.transition : null;
    return `<i class="block clip editable${c.id === E.selected ? ' on' : ''}" data-id="${c.id}" title="${trans ? '切替: ' + TRANSITION_NAMES[trans] : ''}" style="${posStyle(c.start, c.dur)};top:${4 + it.lane * h}px"><b class="handle l"></b>${trans ? '<em class="transition-mark">✦</em>' : ''}${escapeHtml(c.name)}<b class="handle r"></b></i>`;
  };
  const lyrics = (E.plan.cuts || []).filter(c => c.text || (c.params && c.params.titleText)).map(c => {
    const id = 'cut:' + c.editKey;
    return `<i class="block lyric editable${id === E.selected ? ' on' : ''}" data-id="${id}" style="${posStyle(c.start, c.end - c.start)};top:4px">${escapeHtml(c.text || c.lineText || '間奏')}</i>`;
  }).join('');
  const autoHtml = auto.items.map(it => {
    const s = it.c;
    const id = 'auto:' + s.index;
    const name = E.project.autoimg.names[s.image] || '画像';
    return `<i class="block auto editable${s.fill ? ' filled' : ''}${id === E.selected ? ' on' : ''}" data-id="${id}" title="${s.fill ? '補完画像：ドラッグして調整できます' : '自動配置画像'}" style="${posStyle(s.start, s.end - s.start)};top:${4 + it.lane * laneH}px"><b class="handle l"></b>${s.fill ? '補完 · ' : ''}${escapeHtml(name)}<b class="handle r"></b></i>`;
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
        (autoH ? `<div class="gutter-row auto-row" style="height:${autoH}px"><span>自動画像</span></div>` : '') +
        `<div class="gutter-row back" style="height:${backH}px"><span>文字の裏</span>${fileBtn('back', '文字の裏に追加')}</div>` +
      `</div>` +
      `<div class="time" id="timeCol">` +
        `<div class="ruler" id="ruler">${ticks.map(t => `<i class="tick" style="left:${(t - v.t0) / v.dur * 100}%"><span>${tickLabel(t)}</span></i>`).join('')}</div>` +
        `<div class="track front" style="height:${frontH}px">${front.items.map(it => clipHtml(it, laneH)).join('')}</div>` +
        `<div class="track" style="height:${lyricH}px">${lyrics}</div>` +
        (autoH ? `<div class="track auto-track" style="height:${autoH}px">${autoHtml}</div>` : '') +
        `<div class="track back" style="height:${backH}px">${back.items.map(it => clipHtml(it, laneH)).join('')}</div>` +
        `<div class="marks">${lineMarks()}</div>` +
        `<div class="snap-guide" id="snapGuide" hidden><span></span></div>` +
        `<div class="playhead" id="playhead"><i></i></div>` +
      `</div>` +
    `</div>`;
  $('btnFillGaps').disabled = !E.project.autoimg || !E.project.autoimg.names || !E.project.autoimg.names.length;
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
    const clipEl = e.target.closest('.editable');
    if (clipEl) {
      const id = clipEl.dataset.id;
      const c = E.project.clips.find(x => x.id === id);
      const shot = id.startsWith('auto:') ? autoShots().find(s => s.index === +id.slice(5)) : null;
      const cut = id.startsWith('cut:') ? E.plan.cuts.find(x => x.editKey === id.slice(4)) : null;
      if (!c && !shot && !cut) return;
      E.selected = id;
      const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
      if (cut) {
        E.drag = null;
        seek(cut.start + Math.min(0.2, (cut.end - cut.start) / 2));
      } else {
        const rec = c && J.clips[c.id];
        E.drag = { id, mode, x: e.clientX, start: c ? c.start : shot.start, dur: c ? c.dur : shot.end - shot.start,
          trim: c ? (+c.trim || 0) : 0, kind: c ? c.kind : 'image', media: rec && rec.mediaDur || 0,
          width: $('timeCol').getBoundingClientRect().width, span: visible().dur };
        clipEl.setPointerCapture(e.pointerId);
        if (shot) seek(shot.start + Math.min(0.2, (shot.end - shot.start) / 2));
      }
      root.querySelectorAll('.editable').forEach(el => el.classList.toggle('on', el.dataset.id === id));
      refreshShotPicker();
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
    const c = E.project.clips.find(x => x.id === E.drag.id);
    const shot = E.drag.id.startsWith('auto:') ? autoShots().find(s => s.index === +E.drag.id.slice(5)) : null;
    if (!c && !shot) return;
    const dt = (e.clientX - E.drag.x) / Math.max(1, E.drag.width) * E.drag.span;
    const target = c || { start: E.drag.start, dur: E.drag.dur, trim: 0 };
    applyClipEdit(target, E.drag, dt, E.plan.duration, E.drag.media);
    showSnapGuide(e.shiftKey ? null : snapClip(target, E.drag, E.plan.duration));
    if (shot) saveAuto(shot, { start: target.start, dur: target.dur });
    E.plan.clips = E.project.clips;
    const el = root.querySelector('.editable[data-id="' + E.drag.id + '"]');
    if (el) placeClipEl(el, target);
    draw();
  });
  const end = () => {
    if (!E.drag || E.drag.preview) return;
    const edited = !E.drag.scrub;
    E.drag = null;
    showSnapGuide(null);
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
    const shot = selectedAuto(), cut = selectedCut();
    if (!clip && !shot && !cut) return;
    const box = controlBox(); if (!box) return;
    const p = viewPoint(e);
    const hs = 18 * E.plan.W / Math.max(1, c.getBoundingClientRect().width);
    const scale = Math.abs(p.x - (box.x + box.w)) <= hs && Math.abs(p.y - (box.y + box.h)) <= hs;
    const inside = (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) ||
      (!!cut && p.x >= 0 && p.x <= E.plan.W && p.y >= 0 && p.y <= E.plan.H);
    if (!scale && !inside) return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    const item = clip || shot || cutEdit(cut);
    const zone = cut && cut.zone ? cut.zone : { w: E.plan.W, h: E.plan.H };
    E.drag = { preview: true, mode: scale ? 'scale' : 'move', px: p.x, py: p.y, ox: item.x, oy: item.y, os: item.s,
      zw: zone.w, zh: zone.h, cx: box.x + box.w / 2, cy: box.y + box.h / 2,
      dist: Math.max(8, Math.hypot(p.x - (box.x + box.w / 2), p.y - (box.y + box.h / 2))) };
  });
  c.addEventListener('pointermove', e => {
    if (!E.drag || !E.drag.preview) return;
    const clip = E.project.clips.find(x => x.id === E.selected);
    const shot = selectedAuto(), cut = selectedCut();
    if (!clip && !shot && !cut) return;
    const p = viewPoint(e);
    const values = {};
    if (E.drag.mode === 'move') {
      values.x = J.clamp(E.drag.ox + (p.x - E.drag.px) / E.drag.zw, -1, 2);
      values.y = J.clamp(E.drag.oy + (p.y - E.drag.py) / E.drag.zh, -1, 2);
    } else values.s = J.clamp(E.drag.os * Math.hypot(p.x - E.drag.cx, p.y - E.drag.cy) / E.drag.dist, clip ? 0.05 : 0.25, clip ? 8 : 3);
    if (clip) Object.assign(clip, values);
    else if (shot) saveAuto(shot, values);
    else saveCut(cut, values);
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
    if (E.project.clips.length >= 64) { $('msg').textContent = 'クリップは64個までです'; break; }
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
async function replaceSelected(file) {
  const clip = E.project.clips.find(c => c.id === E.selected);
  if (!clip || clip.kind !== 'video' || !file) return;
  const id = sourceId(clip);
  E.adding = true;
  try {
    await attach(clip, file, true);
    const duration = J.clips[clip.id].mediaDur;
    if (E.project.clips.some(c => sourceId(c) === id && (+c.trim || 0) + c.dur > duration + 0.05)) throw new Error('元動画と長さが合いません');
    const saved = await J.saveClipPreviewFile(id, file);
    if (!saved) throw new Error('プレビュー用動画を保存できませんでした');
    for (const c of E.project.clips) if (sourceId(c) === id) dropEl(c.id);
    await loadClips();
    $('msg').textContent = '軽量プレビューを設定しました。書き出しは元動画を使います';
    draw();
    if (bc) bc.postMessage({ type: 'clips' });
  } catch (e) {
    dropEl(clip.id);
    await loadClips();
    draw();
    $('msg').textContent = e.message || String(e);
  }
  finally { E.adding = false; E.picking = false; }
}
function newClipId() {
  let id;
  do { id = 'c' + Math.random().toString(36).slice(2, 10); }
  while (E.project.clips.some(c => c.id === id));
  return id;
}
async function splitSelected() {
  const clip = selectedSplit();
  if (!clip) return;
  pause();
  const leftDur = E.t - clip.start;
  const right = Object.assign({}, clip, {
    id: newClipId(), sourceId: sourceId(clip), start: E.t,
    trim: (+clip.trim || 0) + leftDur, dur: clip.dur - leftDur, transition: 'none',
  });
  clip.dur = leftDur;
  E.project.clips.splice(E.project.clips.indexOf(clip) + 1, 0, right);
  E.selected = right.id;
  writeClips(); renderTimeline();
  await loadClips(); seek(E.t);
  $('msg').textContent = '再生位置で動画を分割しました';
}
function copySelected() {
  const clip = E.project.clips.find(c => c.id === E.selected);
  if (!clip) return false;
  E.clipboard = Object.assign({}, clip, { sourceId: sourceId(clip) });
  $('msg').textContent = 'クリップをコピーしました。Ctrl+Vで再生位置に貼り付けます';
  return true;
}
async function pasteClip() {
  if (!E.clipboard || E.project.clips.length >= 64) return false;
  pause();
  const clip = Object.assign({}, E.clipboard, { id: newClipId() });
  clip.start = J.clamp(E.t, 0, Math.max(0, E.plan.duration - 0.2));
  clip.dur = Math.min(clip.dur, Math.max(0.2, E.plan.duration - clip.start));
  E.project.clips.push(clip);
  E.selected = clip.id;
  writeClips(); renderTimeline();
  await loadClips(); seek(E.t);
  $('msg').textContent = '再生位置に貼り付けました';
  return true;
}
function removeSelected() {
  const shot = selectedAuto();
  if (shot && shot.fill && E.project.autoimg && Array.isArray(E.project.autoimg.fills)) {
    E.project.autoimg.fills.splice(shot.fillIndex, 1);
    E.selected = null; writeClips(); renderTimeline();
    return;
  }
  const i = E.project.clips.findIndex(c => c.id === E.selected);
  if (i < 0) return;
  const id = E.project.clips[i].id;
  const media = sourceId(E.project.clips[i]);
  E.project.clips.splice(i, 1);
  dropEl(id);
  E.selected = null; writeClips(); renderTimeline();
  rememberDeletedSource(media);
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
  if (J.bindOutroControls) J.bindOutroControls(() => E.project, () => {
    const raw=JSON.parse(localStorage.getItem(LS_KEY)||'{}');
    raw.outroId=E.project.outroId;raw.outroTitle=E.project.outroTitle;
    localStorage.setItem(LS_KEY,JSON.stringify(raw));
    if(bc)bc.postMessage({type:'outro'});
    replan();
    const ending=E.plan.cuts.find(c=>c.line===-2);
    if(ending)seek(ending.start+Math.min(1,ending.dur*.25));else draw();
  });
  await loadClips();
  if (J.autoimgRestore) await J.autoimgRestore(E.project);   // AUTOIMG
  E.history.current = layoutSnapshot();
  E.history.undo.length = 0;
  E.history.redo.length = 0;
  await finishDeletedSources();
  E.snapEnabled = localStorage.getItem(SNAP_KEY) !== 'false';
  $('snapClips').checked = E.snapEnabled;
  $('snapClips').addEventListener('change', e => {
    E.snapEnabled = e.target.checked;
    localStorage.setItem(SNAP_KEY, String(E.snapEnabled));
    showSnapGuide(null);
  });
  draw();
  $('btnPlay').addEventListener('click', () => E.playing ? pause() : play());
  $('btnExport').addEventListener('click', exportMp4);
  $('btnDelete').addEventListener('click', removeSelected);
  $('btnSplit').addEventListener('click', splitSelected);
  $('clipTransition').addEventListener('change', e => {
    const clip = E.project.clips.find(c => c.id === E.selected);
    if (!clip || !TRANSITION_NAMES[e.target.value]) return;
    clip.transition = e.target.value;
    clip.transDur = J.clamp(+clip.transDur || 0.4, 0.1, 1.5);
    writeClips(); renderTimeline();
    seek(Math.min(E.plan.duration - 1e-3, clip.start + 0.1));
  });
  $('clipTransDuration').addEventListener('change', e => {
    const clip = E.project.clips.find(c => c.id === E.selected);
    if (!clip) return;
    clip.transDur = J.clamp(+e.target.value || 0.4, 0.1, 1.5);
    writeClips(); renderTimeline();
    seek(Math.min(E.plan.duration - 1e-3, clip.start + Math.min(0.1, clip.transDur * 0.25)));
  });
  $('btnPreviewTransition').addEventListener('click', () => {
    const clip = E.project.clips.find(c => c.id === E.selected);
    if (!clip || !TRANSITION_NAMES[clip.transition] || clip.transition === 'none') return;
    pause(); seek(Math.max(0, clip.start - 0.3)); play();
  });
  document.addEventListener('keydown', e => {
    if (E.exporting || E.adding || E.picking || E.history.restoring || E.drag) return;
    const target = e.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      if (e.shiftKey ? E.history.redo.length : E.history.undo.length) {
        e.preventDefault(); restoreHistory(e.shiftKey);
      }
    } else if (mod && key === 'y' && E.history.redo.length) {
      e.preventDefault(); restoreHistory(true);
    } else if (mod && key === 'c') {
      if (copySelected()) e.preventDefault();
    } else if (mod && key === 'v') {
      if (E.clipboard) { e.preventDefault(); pasteClip(); }
    } else if (!mod && (key === 'delete' || key === 'backspace')) {
      if (E.project.clips.some(c => c.id === E.selected) || (selectedAuto() && selectedAuto().fill)) {
        e.preventDefault(); removeSelected();
      }
    }
  });
  $('btnReplace').addEventListener('click', () => {
    if (!E.project.clips.some(c => c.id === E.selected)) return;
    E.picking = true;
    $('replaceClip').click();
  });
  $('replaceClip').addEventListener('change', () => {
    const input = $('replaceClip'), file = input.files[0];
    input.value = '';
    if (file) replaceSelected(file);
    else E.picking = false;
  });
  $('shotImage').addEventListener('change', e => {
    const shot = selectedAuto(); if (!shot) return;
    saveAuto(shot, { image: +e.target.value }); writeClips(); draw(); renderTimeline();
  });
  $('btnResetPosition').addEventListener('click', () => {
    const shot = selectedAuto(), cut = selectedCut();
    if (shot) saveAuto(shot, { x: 0.5, y: 0.5, s: 1 });
    else if (cut) delete E.project.cutEdits[cut.editKey];
    else return;
    writeClips(); draw();
  });
  $('zoomOut').addEventListener('click', () => setZoom(visible().dur * 1.4, E.t));
  $('zoomIn').addEventListener('click', () => setZoom(visible().dur / 1.4, E.t));
  $('zoomFit').addEventListener('click', () => { E.view = null; renderTimeline(); });
  $('btnFillGaps').addEventListener('click', () => {
    const count = J.autoimgFillGaps ? J.autoimgFillGaps(E.plan) : 0;
    E.selected = null;
    writeClips(); renderTimeline();
    $('msg').textContent = count ? count + '区間を補完しました' : '埋められる隙間はありません';
  });
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
    const before = E.history.current;
    E.project = readProject();
    replan();
    const next = layoutSnapshot();
    if (next !== before) {
      E.history.current = next;
      E.history.undo.length = 0;
      E.history.redo.length = 0;
    }
    refreshShotPicker();
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
