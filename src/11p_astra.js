/* Astra: art-directed type compositions and restrained motion, in design-space units. */
(() => {
'use strict';
const E = J.E, C = J.clamp;
const calm = ['calm', 'editorial', 'emotional'], bold = ['graphic', 'pop', 'glitch'];
const reg = (g, k, d) => J.register(g, k, Object.assign({set: 'astra', w: 1}, d), 'astra');
const alive = e => E.outCubic(C(e.lt / .4)) * (1 - E.inCubic(e.pOut));
const min = e => Math.min(e.W, e.H);
const fontPlan = (rng, c, st) => ({font: rng.pick(J.fontsOf(st, ['display', 'serif'])), side: rng.chance(.5) ? 1 : -1, variant: rng.int(0, 2)});
const wrap = (e, n = 10) => J.splitLines(e.cut.text || '', e.W < e.H ? Math.ceil(n / 2) : n);
function type(e, text, x, y, w, h, extra = {}) {
  const font = e.cut.params.font || e.st.fonts.display[0], opts = Object.assign({lead: 1.18, track: .035}, extra);
  return Object.assign({text, font, x, y, color: e.sc.fg,
    size: Math.min(min(e) * .34, J.fitSize(text, font, w, h, opts))}, opts);
}
function caption(e, text, x, y, align = 'left') {
  e.draw({text, x, y, align, font: 'mono', size: min(e) * .019, track: .12, color: e.sc.sub, alpha: alive(e), ghost: false});
}
reg('layout', 'asMonument', {
  name: 'Astra・モニュメント', tags: bold, ae: 'huge', fits: n => n <= 120, plan: fontPlan,
  render(e) {
    const {W,H,sc} = e, a = alive(e), text = wrap(e, 8);
    const it = type(e,text,W*.5,H*.48,W*.78,H*.52,{track:-.035,lead:1.07});
    e.rect(W*.1,H*.82,W*.8*a,min(e)*.007,sc.accent,a,false);
    caption(e,String(e.cut.line+1).padStart(2,'0'),W*.1,H*.88);
    return J.mainDraw(e,it);
  }
});
reg('layout', 'asDiptych', {
  name: 'Astra・二面の対話', tags: calm.concat('graphic'), ae: 'mixed', fits: n => n >= 2 && n <= 60, plan: fontPlan,
  render(e) {
    const {W,H,sc} = e, p = W < H, a = alive(e);
    const words = e.cut.text.trim().split(/\s+/), chars = [...e.cut.text];
    const units = words.length > 1 ? words : chars, mid = Math.ceil(units.length/2), join = words.length > 1 ? ' ' : '';
    const halves = [units.slice(0,mid).join(join),units.slice(mid).join(join)];
    let bb = null;
    halves.forEach((t,i) => {
      t = J.splitLines(t,p?6:5);
      const it = type(e,t,p?W*.5:W*(.28+.44*i),p?H*(.34+.32*i):H*.5,W*(p?.78:.36),H*(p?.24:.5),{mi:i, color:i?sc.accent:sc.fg});
      // Preserve contrast in arbitrary user palettes.
      if(J.contrast(it.color,sc.bg)<3) it.color=sc.fg;
      bb=J.unionBB(bb,J.mainDraw(e,it));
    });
    e.line(p?[[W*.2,H*.5],[W*(.2+.6*a),H*.5]]:[[W*.5,H*.25],[W*.5,H*(.25+.5*a)]],sc.sub,min(e)*.0015,a*.55,false);
    return bb;
  }
});
reg('layout', 'asSpine', {
  name: 'Astra・縦組みの背骨', tags: calm, ae: 'vcols', fits: n => n <= 28, plan: fontPlan,
  render(e) {
    const {W,H,sc} = e, side=e.cut.params.side, a=alive(e);
    const text=J.splitLines(e.cut.text,W<H?9:6);
    const it=type(e,text,W*(side>0?.57:.43),H*.5,W*.55,H*.75,{vertical:true,track:.12,lead:1.5});
    const x=W*(side>0?.16:.84);
    e.line([[x,H*.13],[x,H*(.13+.74*a)]],sc.accent,min(e)*.002,a,false);
    caption(e,String(e.cut.line+1).padStart(2,'0'),W*.5,H*.93,'center');
    return J.mainDraw(e,it);
  }
});
reg('layout', 'asPassepartout', {
  name: 'Astra・額装タイポ', tags: calm.concat('graphic'), ae: 'center', fits: n => n <= 80, plan: fontPlan,
  render(e) {
    const {W,H,sc}=e,a=alive(e),m=min(e),text=wrap(e);
    const it=type(e,text,W*.5,H*.5,W*.65,H*.43);
    const b={x:W*.09,y:H*.18,w:W*.82,h:H*.64};
    const ctx=e.ctx;
    if(e.pass==='main') {
      ctx.save();ctx.globalAlpha*=a*.5;ctx.strokeStyle=sc.sub;ctx.lineWidth=m*.0012;
      ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.restore();
    }
    e.rect(b.x,b.y,m*.07*a,m*.005,sc.accent,a,false);
    e.rect(b.x+b.w-m*.07*a,b.y+b.h,m*.07*a,m*.005,sc.accent,a,false);
    return J.mainDraw(e,it);
  }
});
reg('layout', 'asStaircase', {
  name: 'Astra・段差のリズム', tags: bold.concat('editorial'), ae: 'mixed', fits: n => n <= 60, plan: fontPlan,
  render(e) {
    const {W,H,sc}=e, ls=J.splitLines(e.cut.text,Math.max(1,Math.ceil(J.glyphCount(e.cut.text)/3))).split('\n');
    const count=ls.length, dy=Math.min(H*.2,H*.58/count);let bb=null;
    ls.forEach((t,i)=>{
      const x=W*(.4+.2*i/Math.max(1,count-1)),y=H*.5+(i-(count-1)/2)*dy;
      const it=type(e,t,x,y,W*.6,dy*.75,{mi:i,track:-.02});
      bb=J.unionBB(bb,J.mainDraw(e,it));
    });
    e.rect(W*.1,H*.19,min(e)*.035,min(e)*.035,sc.accent,alive(e),false);
    return bb;
  }
});
reg('layout', 'asHorizon', {
  name: 'Astra・水平線の詩', tags: calm, ae: 'center', fits: n => n <= 120, plan: fontPlan,
  render(e) {
    const {W,H,sc}=e,a=alive(e);
    e.line([[W*.1,H*.68],[W*(.1+.8*a),H*.68]],sc.sub,min(e)*.001,a*.7,false);
    const it=type(e,wrap(e),W*.5,H*.48,W*.75,H*.31,{track:.16});
    it.size*=.85;
    caption(e,String(e.cut.line+1).padStart(2,'0'),W*.88,H*.75,'right');
    return J.mainDraw(e,it);
  }
});
// Internal neutral parts keep titles, gaps and transition joins in the Astra family.
reg('layout','asInterlude',{name:'Astra・静かな間奏',special:true,tags:calm,ae:'center',plan:fontPlan,
  render(e){const p=e.cut.params;if(!p.showTitle||e.lt<(p.titleDelay||0))return null;
    const text=J.splitLines(p.titleText||e.cut.text||'',e.W<e.H?7:16);
    const it=type(e,text,e.W*.5,e.H*.6,e.W*.76,e.H*.3);
    it.alpha=E.outCubic(C((e.lt-(p.titleDelay||0))/.5));return J.mainDraw(e,it);}});
reg('enter','asCut',{name:'Astra・即時表示',tags:calm.concat(bold),ae:'cut',w:.3,apply(){}});
reg('exit','asCutExit',{name:'Astra・カットアウト',tags:calm.concat(bold),ae:'cut',w:.3,apply(e,it,p){it.alpha=(it.alpha??1)*(p<1?1:0);}});
reg('hold','asStill',{name:'Astra・静止',tags:calm.concat(bold),ae:'still',w:2,apply(){}});
reg('enter','asCascade',{name:'Astra・滝の整列',tags:bold.concat('editorial'),ae:'drop',apply(e,it,p){
  it.charFns.push((i,g,n)=>{const q=C((p-.3*i/Math.max(1,n-1))/.7),k=E.outCubic(q);
    return {dy:-it.size*.6*(1-k),rot:-5*(1-k),a:k};});}});
reg('enter','asTrackingLock',{name:'Astra・字間の収束',tags:calm.concat('graphic'),ae:'stretch',apply(e,it,p){
  const k=E.outCubic(p);it.alpha=(it.alpha??1)*k;
  it.charFns.push((i,g,n)=>({dx:(i-(n-1)/2)*it.size*.055*(1-k),sy:.92+.08*k}));}});
reg('enter','asRollPress',{name:'Astra・活版ローラー',tags:bold,ae:'wipe',apply(e,it,p){
  it.alpha=(it.alpha??1)*E.outCubic(p);
  it.charFns.push((i,g,n)=>{const q=C((p-.25*i/Math.max(1,n-1))/.75);return {clipX:[-.8,-.8+1.6*E.outCubic(q)]};});}});
reg('exit','asLetterDrift',{name:'Astra・左右に散る余韻',tags:calm.concat('graphic'),ae:'drift',apply(e,it,p){
  const k=E.inCubic(p);it.alpha=(it.alpha??1)*(1-k);
  it.charFns.push((i,g,n)=>({dx:(i-(n-1)/2)*it.size*.07*k,dy:it.size*.1*k}));}});
reg('exit','asVelvetFall',{name:'Astra・ベルベットの落幕',tags:calm,ae:'blur',apply(e,it,p){
  const k=E.inCubic(p);it.y+=it.size*.22*k;it.alpha=(it.alpha??1)*(1-k);
  if(e.allowFilter)it.blur=(it.blur||0)+it.size*.055*k;}});
reg('hold','asBeatBreath',{name:'Astra・拍の呼吸',tags:bold.concat('emotional'),ae:'breathe',apply(e,it,amt){
  const pulse=e.beat?Math.exp(-Math.max(0,e.beat.since)*9):(.5+.5*Math.sin(e.ltb*2));
  const s=1+.014*pulse*amt*e.fx.motion;it.sx=(it.sx??1)*s;it.sy=(it.sy??1)*s;}});
reg('decor','asCornerTicks',{name:'Astra・四隅のトンボ',tags:calm.concat(bold),ae:'brackets',layer:'front',subtle:true,
  draw(e,bb){const b=J.centerBB(e,bb),m=min(e),gap=m*.025,len=m*.032,a=alive(e);
    for(const sx of [-1,1])for(const sy of [-1,1]){const x=C((sx<0?b.x0:b.x1)+sx*gap,e.W*.06,e.W*.94),y=C((sy<0?b.y0:b.y1)+sy*gap,e.H*.06,e.H*.94);
      e.line([[x-sx*len*a,y],[x,y],[x,y-sy*len*a]],e.sc.accent,m*.0015,a,false);}}});
reg('decor','asOrbitDots',{name:'Astra・余白の衛星',tags:calm.concat('graphic'),ae:'dots',layer:'back',subtle:true,
  draw(e,bb,P){const a=alive(e),m=min(e);for(let i=0;i<5;i++){
    const t=e.ltb*.14+i*J.TAU/5+P.r,x=e.W*.5+Math.cos(t)*e.W*.4,y=e.H*.5+Math.sin(t)*e.H*.4;
    e.circle(x,y,m*(i===0?.004:.002),e.sc.sub,null,0,a*.45,false);}}});
reg('decor','asSideMeter',{name:'Astra・余白の拍目盛り',tags:bold.concat('editorial'),ae:'bars',layer:'front',subtle:true,
  draw(e){const a=alive(e),m=min(e),pulse=e.beat?Math.exp(-Math.max(0,e.beat.since)*7):.25;
    for(let i=0;i<7;i++)e.rect(e.W*.045,e.H*(.42+i*.025),m*(i===3?.024+.018*pulse:.012),m*.0015,e.sc.sub,a*.65,false);}});
reg('bg','asSoftField',{name:'Astra・淡い光の層',tags:calm,subtle:true,
  draw(e){const x=e.ctx,g=x.createRadialGradient(e.W*.65,e.H*.3,0,e.W*.5,e.H*.5,Math.max(e.W,e.H)*.8);
    g.addColorStop(0,J.rgba(e.sc.accent,.08));g.addColorStop(1,J.rgba(e.sc.bg,0));x.save();x.fillStyle=g;x.fillRect(0,0,e.W,e.H);x.restore();}});
reg('bg','asContourField',{name:'Astra・静かな等高線',tags:calm.concat('graphic'),subtle:true,
  draw(e){const x=e.ctx;x.save();x.strokeStyle=e.sc.sub;x.globalAlpha*=.07;x.lineWidth=min(e)*.001;
    for(let i=0;i<7;i++){x.beginPath();x.ellipse(e.W*.9,e.H*.12,e.W*(.19+i*.08),e.H*(.14+i*.06),.2,0,J.TAU);x.stroke();}x.restore();}});
reg('cam','asDolly',{name:'Astra・静かなドリー',tags:calm.concat(bold),get:e=>({s:1+.035*E.inOutSine(C(e.lt/Math.max(.1,e.cut.dur)))*e.fx.motion})});
reg('cam','asLateral',{name:'Astra・横の視差',tags:calm.concat('graphic'),get:e=>({x:Math.sin(C(e.lt/Math.max(.1,e.cut.dur))*Math.PI)*e.W*.012*e.fx.motion,s:1.015})});
reg('treat','asFineShadow',{name:'Astra・活字の薄影',tags:calm.concat(bold),safe:true,apply(e,it){if(it.fill===false)return;
  it.shadow={color:J.rgba(e.sc.bg,.7),blur:it.size*.025,dx:0,dy:it.size*.018};}});
reg('trans','asSoftCut',{name:'Astra・柔らかな切り替え',tags:calm,dur:.32,
  draw(ctx,A,B,p,info){ctx.save();ctx.drawImage(A,0,0);ctx.globalAlpha=E.inOutSine(p);ctx.drawImage(B,0,0);ctx.restore();}});
reg('trans','asSplitGate',{name:'Astra・中央の扉',tags:bold.concat('editorial'),dur:.38,
  draw(ctx,A,B,p,info){const k=E.inOutCubic(p),w=info.cw,h=info.ch;ctx.save();ctx.drawImage(A,0,0);
    ctx.beginPath();ctx.rect(w*(1-k)/2,0,w*k,h);ctx.clip();ctx.drawImage(B,0,0);ctx.restore();}});
})();
