/* Final plan boundary: exclusive Astra mode also covers saved overrides, locks and core fallbacks.
   The saved project is never mutated; switching the other libraries back on restores its choices. */
(() => {
'use strict';
J.enforceAstraPlan = (plan, project) => {
  const isAstra = (g,k) => !!(J.registry(g)[k] && J.registry(g)[k].set === 'astra');
  const neutral = (g,k) => k === 'none' && ['treat','bg'].includes(g);
  const apply = c => {
    const rng=J.rng(J.h(c.seed,98731)), W=c.zone?c.zone.w:plan.W,H=c.zone?c.zone.h:plan.H;
    const n=J.glyphCount(c.text||'');
    const choose = (g, fallback) => {
      const pool=J.order(g).filter(k=>isAstra(g,k)&&!J.registry(g)[k].special
        &&((project.enabled||{})[g]||{})[k]!==false
        &&(g!=='layout'||!J.LAYOUTS[k].fits||J.LAYOUTS[k].fits(n)));
      return pool.length?rng.pick(pool):fallback;
    };
    if(c.layout==='interlude') {
      c.layout='asInterlude';c.params=Object.assign({},c.params,{font:plan.style.fonts.serif[0]});
    } else if(!isAstra('layout',c.layout)) {
      c.layout=choose('layout','asMonument');
      c.params=J.LAYOUTS[c.layout].plan(rng,{text:c.text,n,W,H,dur:c.dur},plan.style);
    }
    for(const [g,fallback] of [['enter','asCut'],['exit','asCutExit'],['hold','asStill'],['cam','asDolly']]) {
      if(isAstra(g,c[g]))continue;
      // A transition join has no separate entrance / exit animation.
      c[g]=(g==='enter'&&c[g]==='cut')?'asCut':(g==='exit'&&c[g]==='cut')?'asCutExit':choose(g,fallback);
      if(g==='cam')c.camP={};
      if(g==='enter'&&c[g]!=='asCut')c.inDur=Math.min(.6,c.dur*.36);
      if(g==='exit'&&c[g]!=='asCutExit')c.outDur=Math.min(.55,c.dur*.3);
    }
    c.decor=(c.decor||[]).filter(d=>isAstra('decor',d.id));
    for(const g of ['treat','bg']) if(!isAstra(g,c[g])&&!neutral(g,c[g])){c[g]='none';c[g+'P']={};}
    if(c.trans&&!isAstra('trans',c.trans)){c.trans=null;c.transP={};c.transDur=0;}
    delete c.morph;delete c.weightGrow;
    if(c.companion&&typeof c.companion==='object')apply(c.companion);
  };
  plan.cuts.forEach(apply);
  plan.events=plan.events.filter(e=>isAstra('fx',e.type));
  plan.hud=false;
  return plan;
};
})();
