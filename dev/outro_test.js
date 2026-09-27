const results={frames:0,plans:0,errors:[]};
const assert=(v,msg)=>{if(!v)throw Error(msg);};
const warn=console.warn;console.warn=(...args)=>{results.errors.push(args.map(String).join(' '));};
try{
  const only={astra:true,base:false,extra:false,wa:false,typo:false,kinetic:false,horror:false};
  assert(J.outroOptions({...only,astra:false}).every(id=>!J.OUTRO_LOOKS[id].set),'Astra leaks when off');
  assert(J.outroOptions(only).length===6,'six endings available');
  assert(J.OUTRO_LOOKS[J.outroIdFor({...only,outroId:'afterglow'})].set==='astra','saved legacy ending leaks');
  const r=new J.Renderer(),cv=document.createElement('canvas'),gallery=document.createElement('canvas');
  gallery.width=1500;gallery.height=940;document.body.append(gallery);const g=gallery.getContext('2d');
  g.fillStyle='#0b0d15';g.fillRect(0,0,1500,940);
  const aspects=['16:9','9:16','1:1','4:3','3:4','4:5','21:9'];
  const originalDraw=J.drawItem;let drawnText=0;J.drawItem=(e,it)=>{if(it.text)drawnText++;return originalDraw(e,it);};
  let idx=0;
  for(const id of J.ASTRA_OUTRO_IDS){
    for(const aspect of aspects)for(const tail of [.9,5,24])for(const audioData of [false,true]){
      const p=Object.assign(J.defaultProject(),only,{lyrics:'余韻',title:'After the last word',aspect,outroId:id,seed:47,
        centerFree:true,colors:{enabled:true,bg:'#080d18',fg:'#eef5ff',sub:'#7591ba',accentOn:true,accent:'#62dcca',ghostA:'#bd9aff',ghostB:'#62dcca'}});
      p.timing.tail=0;p.timing.offset=0;p.fx.texture=0;p.fx.chroma=0;p.fx.glitch=0;p.fx.motion=.65;
      const base=J.plan(p),audio={duration:base.duration+tail,beats:audioData?Array.from({length:100},(_,i)=>i*.5):[],
        energy:audioData?Array.from({length:1000},(_,i)=>.3+.2*Math.sin(i*.2)):null,energyRate:10};
      const plan=J.plan(p,audio),c=plan.cuts.find(c=>c.line===-2);results.plans++;
      assert(c&&c.layout===id,'selected ending not used');assert(!c.zone,'ending must fill frame');
      assert(!c.params.showTitle,'title must be opt in');
      assert(plan.events.filter(e=>e.t>=c.start).length===0,'legacy FX in authored ending');
      const s=Math.min(480/plan.W,270/plan.H);cv.width=Math.round(plan.W*s);cv.height=Math.round(plan.H*s);
      drawnText=0;
      for(const q of [0,.03,.17,.38,.62,.8,.94,.999]){
        r.frame(cv.getContext('2d'),plan,c.start+c.dur*q,{scale:s,fast:!audioData});results.frames++;
      }
      assert(drawnText===0,'text in instrumental ending');
      if(aspect==='16:9'&&tail===5&&audioData){
        const col=idx%3,row=Math.floor(idx/3),x=col*500+10,y=row*465+20;
        r.frame(cv.getContext('2d'),plan,c.start+c.dur*.48,{scale:s});g.drawImage(cv,x,y);
        g.fillStyle='#eef5ff';g.font='21px sans-serif';g.fillText(J.OUTRO_LOOKS[id].name,x+12,y+302);
        // Smaller late frame shows how the same ending settles.
        r.frame(cv.getContext('2d'),plan,c.start+c.dur*.84,{scale:s});g.drawImage(cv,x+285,y+315,192,108);
        g.fillStyle='#879bb5';g.font='14px sans-serif';g.fillText('ENDING / '+String(idx+1).padStart(2,'0'),x+12,y+345);
      }
    }
    idx++;
  }
  J.drawItem=originalDraw;
  // Optional title and mixed-library selection work too.
  const p=Object.assign(J.defaultProject(),only,{outroId:'asHaloEnd',outroTitle:true,title:'テスト',lyrics:'余韻'});
  assert(J.plan(p,{duration:14,beats:[]}).cuts.find(c=>c.line===-2).params.showTitle,'optional title missing');
  assert(J.outroIdFor({...p,base:true,outroId:'afterglow'})==='afterglow','legacy selection changed');
  const mixed={...p,base:true,outroTitle:false,fx:{...p.fx,hud:'on'}};
  const mixedPlan=J.plan(mixed,{duration:14,beats:[]}),ending=mixedPlan.cuts.find(c=>c.line===-2);
  assert(ending.decor.length===0,'legacy decor mixed into authored ending');
  let hud=0;const savedHUD=J.drawHUD;J.drawHUD=()=>hud++;
  r.frame(cv.getContext('2d'),mixedPlan,ending.start+ending.dur*.5,{scale:.15});
  J.drawHUD=savedHUD;assert(hud===0,'HUD text in instrumental ending');
}catch(e){results.errors.push(e.stack);}finally{console.warn=warn;}
const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(results);document.body.append(pre);
