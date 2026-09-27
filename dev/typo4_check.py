"""Render the cinematic pack in real Chromium; no server or third-party modules needed."""
import json
import pathlib
import subprocess
import contextlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHROME = pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe')
script = '\n'.join(p.read_text(encoding='utf-8') for p in sorted((ROOT / 'src').glob('*.js')) if p.name != '12_ui.js')
test = r'''
const results = {frames:0, errors:[]};
const layouts = ['tyCinemaTitle','tyMarginPress','tyDepthPrint','tyGalleryCaption'];
const cv = document.createElement('canvas'); document.body.append(cv);
cv.width=1200; cv.height=1000; const sheet=cv.getContext('2d');
const aspects=['16:9','9:16','1:1','4:3','3:4','4:5','21:9'];
const texts=['愛','ほどけた声が鳴った','Hello world','ねえ、まだ間に合うかな'];
for (let ai=0; ai<aspects.length; ai++) for(let li=0;li<layouts.length;li++) {
  try {
    const p=Object.assign(J.defaultProject(),{style:'noir',aspect:aspects[ai],lyrics:texts.join('\n'),
      overrides:Object.fromEntries(texts.map((_,i)=>[i,{single:true,layout:layouts[li],
        enter:['tySilkRise','tyApertureType','tyFocusSettle'][i%3],
        exit:i%2?'tyClosePrint':'tyWaterRelease',hold:'tySlowFloat',decor:[],bg:'none',cam:'push',treat:'none',trans:'none'}]))});
    const plan=J.plan(p), r=new J.Renderer(), c=document.createElement('canvas');
    const scale=Math.min(300/plan.W,300/plan.H);c.width=plan.W*scale;c.height=plan.H*scale;
    for(const cut of plan.cuts) for(const fraction of [0,.05,.2,.5,.8,.95,.999]) {
      r.frame(c.getContext('2d'),plan,cut.start+cut.dur*fraction,{scale});results.frames++;
    }
    const cut=plan.cuts[1];r.frame(c.getContext('2d'),plan,cut.start+cut.dur*.5,{scale});
    if(ai<3) sheet.drawImage(c,li*300,ai*330); sheet.fillStyle='#fff';sheet.font='14px sans-serif';
    if(ai<3) sheet.fillText(layouts[li]+' '+aspects[ai],li*300+8,ai*330+320);
  } catch(e) {results.errors.push(e.stack);}
}
for(const group of ['enter','exit']) for(const key of J.order(group).filter(k=>['tySilkRise','tyApertureType','tyFocusSettle','tyWaterRelease','tyClosePrint'].includes(k))) {
  const it={size:100,x:0,y:0,charFns:[]};
  J.registry(group)[key].apply({allowFilter:true},it,group==='enter'?1:1);
  for(let i=0;i<12;i++) for(const fn of it.charFns) {
    const v=fn(i,{},12);
    if(group==='enter' && ((v.a??1)!==1 || (v.dy??0)!==0)) results.errors.push(key+' does not settle');
    if(group==='exit' && (v.a??it.alpha??1)!==0) results.errors.push(key+' does not disappear');
  }
}
document.title=results.errors.length?'FAIL':'PASS';
const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(results);document.body.append(pre);
'''
with contextlib.nullcontext(ROOT / 'dev' / 'typo4-work') as temp:
    d = pathlib.Path(temp)
    d.mkdir(exist_ok=True)
    page = d / 'check.html'
    page.write_text('<body style="margin:0;background:#111"><script>'+script+'</script><script>'+test+'</script>', encoding='utf-8')
    result = subprocess.run([str(CHROME), '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--disable-background-networking', '--hide-scrollbars', '--window-size=1200,1100',
        '--user-data-dir='+str(d / 'profile'), '--dump-dom', '--screenshot='+str(ROOT / 'dev/typo4-preview.png'), page.as_uri()], capture_output=True, timeout=90)
    html = result.stdout.decode('utf-8', errors='replace')
    import re, html as html_module
    match = re.search(r'<pre id="result">(.*?)</pre>', html, re.S)
    if not match:
        raise RuntimeError(result.stderr.decode('utf-8',errors='replace')[-2000:])
    data = json.loads(html_module.unescape(match[1]))
    print(json.dumps(data, ensure_ascii=False))
    assert d.resolve().parent == (ROOT / 'dev').resolve() and d.name == 'typo4-work'
    shutil.rmtree(d)
    if data['errors']: raise SystemExit(1)
