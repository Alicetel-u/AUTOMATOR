/* Editorial / cinematic typography. All geometry uses the design-space safe area. */
(() => {
'use strict';
const E = J.E;
const reg = (g, k, d) => J.register(g, k, Object.assign({set: 'astra'}, d), 'astra');
const tags = ['calm', 'editorial', 'emotional', 'graphic'];
const fade = e => E.outCubic(J.clamp(e.lt / .45)) * (1 - E.inCubic(e.pOut));
const lines = (e) => J.splitLines(e.cut.text, e.W < e.H ? 5 : 11);
const plan = (rng, cut, st) => ({font: rng.pick(J.fontsOf(st, ['serif', 'display'])), side: rng.chance(.5) ? 1 : -1});
function item(e, extra) {
  const text = lines(e), font = e.cut.params.font;
  return Object.assign({text, font, size: J.fitSize(text, font, e.W * .76, e.H * .4, {lead: 1.25, track: .06}),
    x: e.W / 2, y: e.H / 2, lead: 1.25, track: .06, color: e.sc.fg}, extra);
}
reg('layout', 'tyCinemaTitle', {
  name: '余白のシネマタイトル', tags, ae: 'center', w: 1, fits: n => n <= 30, plan,
  render(e) {
    const {W, H, sc} = e, a = fade(e), m = Math.min(W, H);
    const it = item(e); it.size *= .78;
    const w = W * .19 * E.outExpo(J.clamp(e.lt / .6));
    e.line([[W / 2 - w / 2, H * .27], [W / 2 + w / 2, H * .27]], sc.accent, m * .002, a, false);
    e.line([[W / 2 - w / 2, H * .73], [W / 2 + w / 2, H * .73]], sc.sub, m * .001, a * .6, false);
    return J.mainDraw(e, it);
  }
});
reg('layout', 'tyMarginPress', {
  name: '余白のエディトリアル', tags, ae: 'center', w: 1, fits: n => n <= 30, plan,
  render(e) {
    const {W, H, sc} = e, a = fade(e), side = e.cut.params.side;
    const it = item(e, {x: W * (side > 0 ? .12 : .88), y: H * .52, align: side > 0 ? 'left' : 'right'});
    it.size *= .9;
    const x = W * (side > 0 ? .08 : .92);
    e.line([[x, H * .25], [x, H * (.25 + .5 * a)]], sc.accent, Math.min(W, H) * .003, a, false);
    e.draw({text: String(e.cut.line + 1).padStart(2, '0'), font: 'mono', size: Math.min(W, H) * .028,
      x: it.x, y: H * .19, align: it.align, color: sc.sub, alpha: a, ghost: false});
    return J.mainDraw(e, it);
  }
});
reg('layout', 'tyDepthPrint', {
  name: '奥行きの残像活字', tags: ['graphic', 'emotional', 'glitch'], ae: 'stack', w: .8, fits: n => n <= 24, plan,
  render(e) {
    const it = item(e), a = fade(e), m = Math.min(e.W, e.H);
    it.size *= .87;
    for (let i = 3; i > 0; i--) e.draw(Object.assign({}, it, {
      x: it.x + i * m * .018 * e.cut.params.side, y: it.y - i * m * .028,
      fill: false, stroke: Math.max(1, m * .0012), color: e.sc.sub,
      alpha: a * .13 * (4 - i), ghost: false}));
    return J.mainDraw(e, it);
  }
});
reg('layout', 'tyGalleryCaption', {
  name: 'ギャラリーの余韻', tags, ae: 'center', w: .9, fits: n => n <= 30, plan,
  render(e) {
    const {W, H, sc} = e, a = fade(e), it = item(e, {x: W * .12, y: H * .72, align: 'left'});
    it.size = Math.min(it.size * .65, J.fitSize(it.text, it.font, W * .76, H * .26, it));
    e.line([[W * .12, H * .52], [W * (.12 + .13 * a), H * .52]], sc.accent, Math.min(W, H) * .003, a, false);
    return J.mainDraw(e, it);
  }
});
reg('enter', 'tySilkRise', {
  name: '一字ずつ絹の浮上', tags, ae: 'blur', w: 1, minDur: .5,
  apply(e, it, p) {
    it.charFns.push((i, g, n) => {
      const q = J.clamp((p - .35 * i / Math.max(1, n - 1)) / .65), k = E.outCubic(q);
      return {dy: it.size * .32 * (1 - k), a: k, blur: e.allowFilter ? (1 - k) * it.size * .045 : 0};
    });
  }
});
reg('enter', 'tyApertureType', {
  name: '中央から開く活字', tags, ae: 'blur', w: .8,
  apply(e, it, p) {
    const k = E.inOutCubic(p);
    it.alpha = (it.alpha ?? 1) * E.outCubic(p);
    it.charFns.push(() => ({clipY: [-.75 * k, .75 * k], sy: .94 + .06 * k}));
  }
});
reg('enter', 'tyFocusSettle', {
  name: 'ピントが合う文字', tags, ae: 'blur', w: .9,
  apply(e, it, p) {
    const k = E.outCubic(p);
    it.alpha = (it.alpha ?? 1) * k;
    it.sx = (it.sx ?? 1) * (1.08 - .08 * k);
    it.sy = (it.sy ?? 1) * (1.08 - .08 * k);
    if (e.allowFilter) it.blur = (it.blur || 0) + it.size * .09 * (1 - k);
  }
});
reg('exit', 'tyWaterRelease', {
  name: '水にほどける文字', tags, ae: 'blur', w: 1,
  apply(e, it, p) {
    it.charFns.push((i, g, n) => {
      const q = J.clamp((p - .25 * i / Math.max(1, n - 1)) / .75), k = E.inCubic(q);
      return {dy: -it.size * .55 * k, dx: Math.sin(i * 1.7) * it.size * .12 * k,
        rot: Math.sin(i * 2.1) * 7 * k, a: 1 - q, blur: e.allowFilter ? it.size * .06 * k : 0};
    });
  }
});
reg('exit', 'tyClosePrint', {
  name: '活字の静かな閉幕', tags, ae: 'blur', w: .8,
  apply(e, it, p) {
    const k = E.inOutCubic(p);
    it.alpha = (it.alpha ?? 1) * (1 - k);
    it.charFns.push(() => ({clipY: [-.75 * (1 - k), .75 * (1 - k)]}));
  }
});
reg('hold', 'tySlowFloat', {
  name: '静かな浮遊活字', tags, ae: 'drift', w: .7,
  apply(e, it, amt) {
    const k = amt * e.fx.motion;
    it.y += Math.sin(e.ltb * 1.4) * it.size * .012 * k;
    it.rot = (it.rot || 0) + Math.sin(e.ltb * .8) * .25 * k;
  }
});
})();
