/* Runs in Chromium with the real engine and canvas. */
const results = {plans:0, frames:0, errors:[], counts:{}};
const check = (ok,msg) => {if(!ok)throw Error(msg);};
const astra = Object.fromEntries(J.GROUP_KEYS.map(g=>[g,J.order(g).filter(k=>J.registry(g)[k].set==='astra')]));
for(const g of J.GROUP_KEYS)results.counts[g]=astra[g].length;
const only = {astra:true,base:false,extra:false,wa:false,typo:false,kinetic:false,horror:false};
const inspect = p => {
  const walk = c => {
    for(const g of ['layout','enter','exit','hold','cam','bg','treat','trans']) {
      const k=c[g]; if(!k||k==='none')continue;
      check(J.registry(g)[k]?.set==='astra',g+': leaked '+k);
    }
    check(c.decor.every(d=>J.DECOR[d.id].set==='astra'),'decor leaked');
    check(!c.morph&&!c.weightGrow,'legacy automatic motion leaked');
    if(c.companion&&typeof c.companion==='object')walk(c.companion);
  };
  p.cuts.forEach(walk);check(!p.hud,'HUD leaked');
  check(p.events.every(e=>J.FXE[e.type]?.set==='astra'),'screen effect leaked');
};
try {
  const old=J.defaultProject();delete old.base;delete old.astra;
  check(J.randomOk(old,'layout','center'),'old project lost base');
  check(!J.randomOk(old,'layout','tyCinemaTitle'),'Astra default must be off');
  check(J.randomOk({...old,astra:true},'layout','tyCinemaTitle'),'Astra mixed mode unavailable');
  for(const g of J.GROUP_KEYS)for(const k of J.order(g))
    check(J.randomOk(only,g,k)===(J.registry(g)[k].set==='astra'),'pool mismatch '+g+'.'+k);
  const aspects=['16:9','9:16','1:1','4:3','3:4','4:5','21:9'];
  for(let seed=1;seed<=70;seed++) {
    const p=Object.assign(J.defaultProject(),only,{seed,title:'光の記憶',artist:'ASTRA',aspect:aspects[seed%7],
      lyrics:'透明な夜を越えて！\n[間奏:3]\nHello world\n透明な夜を越えて！',unify:seed%2===0,centerFree:seed%3===0});
    p.timing.offset=2;
    if(seed%4===0)p.enabled=Object.fromEntries(J.GROUP_KEYS.map(g=>[g,Object.fromEntries(astra[g].map(k=>[k,false]))]));
    p.overrides={0:{single:true,layout:'center',enter:'assemble',exit:'explode',hold:'jitter',bg:'none',cam:'push',decor:['brackets'],
      cutTech:{0:{layout:'stack',enter:'spin',trans:'none'}}}};
    const before=JSON.stringify(p),plan=J.plan(p,{duration:26,beats:[1,2,3,4,5,6,7,8]});
    inspect(plan);check(JSON.stringify(p)===before,'project mutated');
    check(JSON.stringify(J.plan(p,{duration:26,beats:[1,2,3,4,5,6,7,8]}))===JSON.stringify(plan),'non-deterministic plan');
    // Locked old parts are also filtered, without changing the saved lock.
    const source=J.plan(Object.assign({},p,{astra:false,base:true}));
    p.overrides[0]={lock:true,lockedCuts:J.lineSnapshot(source,0)};
    inspect(J.plan(p,{duration:26,beats:[]}));
    const randomized=Object.assign({},p,J.omakase(p,J.rng(seed)));
    inspect(J.plan(randomized));results.plans+=3;
  }
  const canvas=document.createElement('canvas');document.body.append(canvas);canvas.width=1500;canvas.height=1100;
  const sheet=canvas.getContext('2d');sheet.fillStyle='#101219';sheet.fillRect(0,0,1500,1100);
  const r=new J.Renderer(),cv=document.createElement('canvas');
  const texts=['愛','透明な夜を越えて','We follow the light','ねえ、まだ間に合うかな','想像よりもずっと遠くまで届くこの声をあなたに届けたい'];
  for(let ai=0;ai<aspects.length;ai++)for(let li=0;li<astra.layout.length;li++) {
    const key=astra.layout[li];
    const p=Object.assign(J.defaultProject(),only,{aspect:aspects[ai],style:ai%2?'paper':'noir',lyrics:texts.join('\n'),
      overrides:Object.fromEntries(texts.map((_,i)=>[i,{single:true,layout:key,enter:astra.enter[i%astra.enter.length],
        exit:astra.exit[i%astra.exit.length],hold:astra.hold[i%astra.hold.length],decor:[astra.decor[i%astra.decor.length]],
        bg:astra.bg[i%astra.bg.length],cam:astra.cam[i%astra.cam.length],treat:'asFineShadow',trans:'asSplitGate'}]))});
    p.fx.chroma=0;p.fx.glitch=0;p.fx.texture=0;p.fx.decor=.25;
    const plan=J.plan(p),scale=Math.min(300/plan.W,300/plan.H);cv.width=plan.W*scale;cv.height=plan.H*scale;
    for(const c of plan.cuts)for(const q of [0,.03,.17,.5,.83,.98,.999]){
      r.frame(cv.getContext('2d'),plan,c.start+c.dur*q,{scale});results.frames++;
    }
    if(ai<2){const c=plan.cuts[1];r.frame(cv.getContext('2d'),plan,c.start+c.dur*.5,{scale});
      const x=li%5*300,y=(Math.floor(li/5)*2+ai)*270;
      sheet.drawImage(cv,x+(300-cv.width*.75)/2,y,cv.width*.75,cv.height*.75);
      sheet.fillStyle='#ccd2de';sheet.font='13px sans-serif';sheet.fillText(J.LAYOUTS[key].name,x+10,y+250);}
  }
  // Endpoint contracts and all motion variants, including low-cost preview mode.
  for(const g of J.GROUP_KEYS)for(const key of astra[g]){
    const p=Object.assign(J.defaultProject(),only),preview=J.previewPlan(p,g,key);
    const scale=.12;cv.width=preview.W*scale;cv.height=preview.H*scale;
    for(const fast of [false,true])for(const c of preview.cuts)for(const q of [.02,.18,.5,.82,.98]){
      r.frame(cv.getContext('2d'),preview,c.start+c.dur*q,{scale,fast});results.frames++;
    }
  }
  for(const g of ['enter','exit'])for(const key of astra[g])for(const p of [0,.5,1])for(const filters of [false,true]){
    const it={text:'文字の余韻',size:100,x:0,y:0,charFns:[]};J.registry(g)[key].apply({allowFilter:filters},it,p);
    for(let i=0;i<5;i++)for(const fn of it.charFns){const a=fn(i,{w:100,h:100},5)||{};
      for(const v of Object.values(a).flat())if(typeof v==='number')check(Number.isFinite(v),key+' non-finite');
      if(p===1&&g==='enter')check((a.a??it.alpha??1)===1&&Math.abs(a.dx||0)<1e-8&&Math.abs(a.dy||0)<1e-8,key+' not settled');
      if(p===1&&g==='exit')check((a.a??it.alpha??1)===0,key+' not hidden');
    }
    if(p===1&&g==='exit'&&!it.charFns.length)check(it.alpha===0,key+' not hidden');
  }
}catch(e){results.errors.push(e.stack);}
const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(results);document.body.append(pre);
document.title=results.errors.length?'FAIL':'PASS';
