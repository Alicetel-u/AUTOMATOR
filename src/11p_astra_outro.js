/* Astra instrumental endings: one coherent full-frame composition per ending. */
(() => {
'use strict';
const C=J.clamp,E=J.E,TAU=J.TAU;
const specs=[
  ['asHaloEnd','光の輪','HALO','hold',.025,.20],
  ['asTunnelEnd','消失点トンネル','VANISHING POINT','cycle',.07,.25],
  ['asHorizonEnd','音の水平線','HORIZON','hold',.015,.22],
  ['asOrbitEnd','軌道の粒子','ORBIT','hold',.035,.20],
  ['asPrismEnd','プリズムの余光','PRISM','cycle',.04,.25],
  ['asShutterEnd','絞り幕','IRIS','hold',.02,.20],
];
J.ASTRA_OUTRO_IDS=specs.map(s=>s[0]);
function stroke(ctx,points,color,width,alpha,closed=false){
  if(!points.length||alpha<=0)return;
  ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
  points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
  if(closed)ctx.closePath();ctx.stroke();
}
function ring(ctx,x,y,rx,ry,rot,col,lw,a){
  if(rx<=0||ry<=0||a<=0)return;
  ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot,0,TAU);ctx.stroke();
}
function render(e,id){
  if(e.pass!=='main')return null;
  const {ctx:x,W,H,sc,cut}=e,m=Math.min(W,H),u=C(e.lt/Math.max(.01,cut.dur));
  const fadeIn=E.outCubic(C(e.lt/Math.min(.65,cut.dur*.25)));
  const fadeOut=1-E.inCubic(C((e.lt-(cut.dur-Math.min(.85,cut.dur*.27)))/Math.min(.85,cut.dur*.27)));
  const a=fadeIn*fadeOut,finish=J.smooth(.72,1,u),motion=C(e.fx.motion??.7);
  const t=cut.dur*(u-.3*u*u)*(.35+.65*motion),pulse=e.beat?Math.exp(-Math.max(0,e.beat.since)*6):0;
  const energy=C(e.energy??.3),r=m*.29*(1-.3*finish),cx=W*.5,cy=H*.48;
  const accent=J.contrast(sc.accent,sc.bg)>2?sc.accent:sc.fg;
  x.save();x.lineCap='round';x.lineJoin='round';
  // Soft radial light works with a flat background or over the user's images.
  const glow=x.createRadialGradient(cx,cy,0,cx,cy,m*.65);
  glow.addColorStop(0,J.rgba(accent,.10));glow.addColorStop(1,J.rgba(accent,0));
  x.globalAlpha=a;x.fillStyle=glow;x.fillRect(0,0,W,H);
  if(id==='asHaloEnd'){
    for(let i=0;i<4;i++){
      const radius=r*(.79+i*.11+.018*pulse),start=t*.16*(i%2?-1:1)+i*.9;
      x.globalAlpha=a*(i===1?.85:.24);x.strokeStyle=i===1?accent:sc.fg;x.lineWidth=m*(i===1?.0022:.0008);
      x.beginPath();x.arc(cx,cy,radius,start,start+TAU*(.7-.1*finish));x.stroke();
    }
    for(let i=0;i<48;i++){const q=i*TAU/48,len=i%4===0?.017:.006;
      stroke(x,[[cx+Math.cos(q)*r*1.22,cy+Math.sin(q)*r*1.22],[cx+Math.cos(q)*r*(1.22+len),cy+Math.sin(q)*r*(1.22+len)]],sc.fg,m*.001,a*.35);}
    ring(x,cx,cy,m*.008*(1-finish),m*.008*(1-finish),0,accent,m*.0014,a);
  }else if(id==='asTunnelEnd'){
    for(let i=9;i>=0;i--){
      const z=((i/10+t*.06)%1),s=.035+z*z*.66,rot=.1*Math.sin(t*.3)+(.5-z)*.12;
      const pts=[];for(let k=0;k<8;k++){const q=k*TAU/8+Math.PI/8+rot;
        pts.push([cx+Math.cos(q)*W*s*(1-.65*finish),cy+Math.sin(q)*H*s*(1-.65*finish)]);}
      stroke(x,pts,i%3===0?accent:sc.fg,m*(i%3===0?.0018:.0008),a*Math.sin(z*Math.PI)*.55,true);
    }
  }else if(id==='asHorizonEnd'){
    const amp=(.035+.11*energy+.035*pulse)*m*(1-finish),width=W*.78;
    for(let band=0;band<4;band++){
      const pts=[];for(let i=0;i<=100;i++){const q=i/100,win=Math.pow(Math.sin(q*Math.PI),2);
        const y=cy+Math.sin(q*TAU*(2+band*.25)-t*(.9+band*.13))*amp*win*(1-band*.16);
        pts.push([cx+(q-.5)*width,y]);}
      stroke(x,pts,band===0?accent:sc.fg,m*(band===0?.002:.001),a*(band===0?.85:.18));
    }
    stroke(x,[[W*.11,cy],[W*.89,cy]],sc.fg,m*.0008,a*.2);
    for(let i=0;i<27;i++){const q=i/26,hh=m*(.009+Math.sin(q*Math.PI)*(.014+.035*energy))*(1-finish);
      stroke(x,[[W*(.15+.7*q),H*.76-hh],[W*(.15+.7*q),H*.76+hh]],sc.sub,m*.001,a*.45);}
  }else if(id==='asOrbitEnd'){
    for(let i=0;i<3;i++)ring(x,cx,cy,r*(1+i*.13),r*(.35+i*.09),i*Math.PI/3+t*.07,sc.sub,m*.001,a*.35);
    const dots=[];for(let i=0;i<54;i++){
      const q=i*2.399963+t*(.1+(i%3)*.035),depth=Math.sin(q*.7+i),rad=r*(.6+.6*J.r(cut.seed,i))*(1-.5*finish);
      dots.push({x:cx+Math.cos(q)*rad,y:cy+Math.sin(q)*rad*.72,z:depth});
    }
    dots.sort((a,b)=>a.z-b.z);for(const d of dots){
      const sz=m*(.0018+(d.z+1)*.0018);x.globalAlpha=a*(.25+(d.z+1)*.25);x.fillStyle=d.z>.45?accent:sc.fg;
      x.beginPath();x.arc(d.x,d.y,sz,0,TAU);x.fill();}
  }else if(id==='asPrismEnd'){
    const rr=r*(1+.025*pulse);
    for(let i=3;i>=0;i--){const rot=-Math.PI/2+t*.035+i*.12*(1-finish),pts=[];
      for(let j=0;j<3;j++){const q=rot+j*TAU/3;pts.push([cx+Math.cos(q)*rr*(1+i*.12),cy+Math.sin(q)*rr*(1+i*.12)]);}
      stroke(x,pts,i===0?accent:sc.fg,m*(i===0?.002:.0009),a*(i===0?.9:.2),true);
    }
    stroke(x,[[W*.07,cy+r*.2],[cx-r*.6,cy]],sc.fg,m*.0012,a*.65);
    for(let i=0;i<5;i++)stroke(x,[[cx+r*.5,cy],[W*.93,cy+(i-2)*m*.055*(1-finish)]],i%2?sc.fg:accent,m*.001,a*(.5-i*.05));
  }else{
    const close=E.inOutCubic(J.smooth(.66,1,u)),radius=r*(1-.93*close);
    for(let i=0;i<8;i++){
      const q=i*TAU/8+t*.04,pts=[];
      for(const [rad,ang] of [[radius,q],[radius*1.15,q+.6],[m*.85,q+.6],[m*.85,q]])pts.push([cx+Math.cos(ang)*rad,cy+Math.sin(ang)*rad]);
      x.globalAlpha=a*.065;x.fillStyle=accent;x.beginPath();pts.forEach((p,j)=>j?x.lineTo(...p):x.moveTo(...p));x.closePath();x.fill();
      stroke(x,pts.slice(0,3),i%2?sc.sub:accent,m*.0013,a*.5);
    }
    ring(x,cx,cy,radius,radius,0,sc.fg,m*.001,a*.45);
  }
  x.restore();
  // Titles are explicitly optional; instrumental endings have no text by default.
  if(cut.params.showTitle&&cut.params.titleText){
    const text=J.splitLines(cut.params.titleText,W<H?12:24),font=e.st.fonts.serif[0];
    const size=Math.min(m*.043,J.fitSize(text,font,W*.7,H*.12,{track:.12,lead:1.2}));
    e.draw({text,font,size,x:cx,y:H*.88,track:.12,lead:1.2,color:sc.fg,
      alpha:a*E.outCubic(C((u-.52)/.22)),ghost:false});
  }
  return null;
}
J.register('cam','asOutroLocked',{name:'Astra・曲末の固定カメラ',set:'astra',special:true,get:()=>({s:1})},'astra');
for(const [id,name,en,photo,zoom,dim] of specs){
  J.register('layout',id,{name:'Astra・'+name,set:'astra',special:true,ae:'center',tags:['calm','graphic','emotional'],
    plan:()=>({}),render:e=>render(e,id)},'astra');
  J.OUTRO_LOOKS[id]={name:'Astra・'+name,en:'Astra · '+en,set:'astra',layout:id,decor:[],count:0,
    beat:'none',title:0,photo,slice:4.2,zoom,dim,drift:.3,cam:'asOutroLocked'};
  J.OUTRO_IDS.push(id);
}
})();
