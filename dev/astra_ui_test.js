document.addEventListener('DOMContentLoaded',()=>{
  const result={checks:0,errors:[]};
  const check=(v,msg)=>{if(!v)throw Error(msg);result.checks++;};
  try {
    const toggle=(name,value,index=0)=>{
      const els=document.querySelectorAll('.'+name+'-toggle');check(els.length===2,name+' controls');
      els[index].checked=value;els[index].dispatchEvent(new Event('change',{bubbles:true}));
      check([...els].every(e=>e.checked===value),name+' sync');
    };
    check(J.ui.project.base===true&&J.ui.project.astra===false,'fresh defaults');
    for(const k of ['base','extra','wa','typo','kinetic','horror'])toggle(k,false);
    toggle('astra',true);
    check(J.astraOnly(J.ui.project),'exclusive mode');
    const assertPlan=()=>check(J.ui.plan.cuts.every(c=>J.LAYOUTS[c.layout].set==='astra'),'non-Astra layout in UI');
    assertPlan();
    const endings=document.querySelectorAll('.outro-select');check(endings.length===2,'ending controls');
    check(endings[0].options.length===7,'six Astra endings plus auto');
    endings[0].value='asPrismEnd';endings[0].dispatchEvent(new Event('change',{bubbles:true}));
    check(endings[1].value==='asPrismEnd'&&J.ui.project.outroId==='asPrismEnd','ending control sync');
    check(JSON.parse(localStorage.getItem('jizura.project.v1')).outroId==='asPrismEnd','ending persistence');
    const titleCheck=document.querySelector('.outro-title');titleCheck.checked=true;titleCheck.dispatchEvent(new Event('change',{bubbles:true}));
    check(J.ui.project.outroTitle===true,'title preference');
    const saved=JSON.parse(localStorage.getItem('jizura.project.v1'));
    check(saved.astra===true&&saved.base===false,'checkbox persistence');
    // Exercise the actual Randomize, Shuffle and per-cut handlers through their buttons.
    const random=document.querySelector('#btnOmakase');check(!!random,'Randomize button');
    random.click();assertPlan();
    document.querySelector('#btnShuffle').click();assertPlan();
    const cut=J.ui.plan.cuts.find(c=>c.line>=0&&c.utext!=null);
    J.uiApi.seek(cut.start+cut.dur*.5);
    document.querySelector('#modePro').click();
    const reroll=document.querySelector('.cut-roll[data-roll="shuffle"]');check(!!reroll&&!reroll.disabled,'cut shuffle button');
    reroll.click();assertPlan();
    toggle('astra',false,1);check(!J.astraOnly(J.ui.project),'disable exclusive');
    toggle('astra',true,1);assertPlan();
    toggle('base',true);check(!J.astraOnly(J.ui.project),'mixed mode');
    check(J.randomOk(J.ui.project,'layout','center')&&J.randomOk(J.ui.project,'layout','asMonument'),'mixed pool');
    toggle('base',false);
    J.uiApi.pause();
  }catch(e){result.errors.push(e.stack);}
  const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(result);document.body.prepend(pre);
});
