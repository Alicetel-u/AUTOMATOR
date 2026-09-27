/* Shared ending controls for the main application and placement window. */
(() => {
'use strict';
J.syncOutroControls = project => {
  const ja=!document.documentElement.lang||document.documentElement.lang==='ja';
  const name=id=>ja?J.OUTRO_LOOKS[id].name:(J.OUTRO_LOOKS[id].en||id);
  const ids=J.outroOptions(project),current=J.outroIdFor(project);
  document.querySelectorAll('.outro-select').forEach(el=>{
    const value=project.outroId&&ids.includes(project.outroId)?project.outroId:'';
    const signature=ids.join('|');
    if(el.dataset.options!==signature){
      el.replaceChildren();
      const auto=document.createElement('option');auto.value='';auto.textContent=ja?'自動':'Auto';el.append(auto);
      for(const id of ids){const option=document.createElement('option');option.value=id;option.textContent=name(id);el.append(option);}
      el.dataset.options=signature;
    }
    el.value=value;
  });
  document.querySelectorAll('.outro-title').forEach(el=>{el.checked=project.outroTitle===true;el.disabled=!J.OUTRO_LOOKS[current]?.layout;});
  document.querySelectorAll('.outro-note').forEach(el=>{el.textContent=ja
    ?(project.astra===true?'選択中：'+name(current):'新しい6種類は「Astra生成部品」をオンにすると選べます。')+' 最後の歌詞のあとに音声が残る区間で使います。'
    :(project.astra===true?'Selected: '+name(current):'Enable Astra-generated parts for the six new endings.')+' Used when audio continues after the final lyric.';});
};
J.bindOutroControls = (getter,change) => {
  const bind=(selector,update)=>document.querySelectorAll(selector).forEach(el=>el.addEventListener('change',()=>{
    const p=getter();update(p,el);J.syncOutroControls(p);change();
  }));
  bind('.outro-select',(p,el)=>{p.outroId=el.value;});
  bind('.outro-title',(p,el)=>{p.outroTitle=el.checked;});
  document.querySelectorAll('.outro-roll').forEach(el=>el.addEventListener('click',()=>{
    const p=getter();J.outroReshuffle(p);J.syncOutroControls(p);change();
  }));
  J.syncOutroControls(getter());
};
})();
