"""Open the real desktop placement page with an Astra-only saved project."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import html
import json
import re
import shutil
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path('C:/Program Files/Google/Chrome/Application/chrome.exe')
work = ROOT / 'dev' / 'editor-astra-work'
work.mkdir(exist_ok=True)
source = (ROOT / 'desktop/editor.html').read_text(encoding='utf-8')
files = re.findall(r'<script src="/src/([^"]+)"', source)
expected = sorted(p.name for p in (ROOT / 'src').glob('*.js') if p.name != '12_ui.js')
assert files == expected, 'Placement page must load all engine scripts in build order'
project = {
    'title': 'Astra window smoke', 'lyrics': '透明な夜を越えて\nHello world',
    'astra': True, 'base': False, 'extra': False, 'wa': False,
    'typo': False, 'kinetic': False, 'horror': False,
    'timing': {'bpm':0,'offset':.4,'snap':False,'tail':7,'lineTimes':{},'lineScale':1},
}
pre = '<script>localStorage.setItem("jizura.project.v1",'+json.dumps(json.dumps(project, ensure_ascii=False))+');</script>'
post = '''<script>
const failures=[];window.addEventListener('error',e=>failures.push(e.message));
window.addEventListener('unhandledrejection',e=>failures.push(String(e.reason)));
window.addEventListener('load',()=>setTimeout(()=>{
  const out={errors:failures, scriptsLoaded:!!(J.LAYOUTS.asMonument&&J.enforceAstraPlan),
    tracks:document.querySelector('#tracks').children.length};
  try {const p=J.plan(JSON.parse(localStorage.getItem('jizura.project.v1')));
    out.layouts=p.cuts.map(c=>c.layout);
    if(p.cuts.some(c=>J.LAYOUTS[c.layout].set!=='astra'))out.errors.push('legacy layout');
    const canvas=document.querySelector('#view');
    new J.Renderer().frame(canvas.getContext('2d'),p,p.cuts[0].start+.4,{scale:canvas.width/p.W});
    const select=document.querySelector('.outro-select');
    if(select.options.length!==7)out.errors.push('missing ending choices');
    select.value='asPrismEnd';select.dispatchEvent(new Event('change',{bubbles:true}));
    if(JSON.parse(localStorage.getItem('jizura.project.v1')).outroId!=='asPrismEnd')out.errors.push('ending not saved');
    if(window.placementPlan.cuts.find(c=>c.line===-2).layout!=='asPrismEnd')out.errors.push('placement ending not replanned');
  }catch(e){out.errors.push(e.stack);}
  if(!out.tracks)out.errors.push('placement UI did not start');
  const x=document.createElement('pre');x.id='smoke-result';x.textContent=JSON.stringify(out);document.body.append(x);
},600));
</script>'''
instrument='<script>J.ensureFonts=async()=>{};const originalPlan=J.plan;J.plan=(...args)=>{window.placementPlan=originalPlan(...args);return window.placementPlan;};</script>'
page = source.replace('</head>', pre+'</head>').replace('<script src="/desktop/editor.js">',instrument+'<script src="/desktop/editor.js">').replace('</body>',post+'</body>')
(work/'check.html').write_text(page, encoding='utf-8')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass

server = ThreadingHTTPServer(('127.0.0.1',0), Handler)
thread = threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
try:
    url=f'http://127.0.0.1:{server.server_address[1]}/dev/editor-astra-work/check.html'
    proc=subprocess.run([str(CHROME),'--headless','--disable-gpu','--no-first-run',
        '--disable-background-networking','--virtual-time-budget=3000',
        '--user-data-dir='+str(work/'profile'),'--dump-dom',url],capture_output=True,timeout=45)
    match=re.search(r'<pre id="smoke-result">(.*?)</pre>',proc.stdout.decode('utf-8',errors='replace'),re.S)
    if not match: raise RuntimeError(proc.stderr.decode('utf-8',errors='replace')[-1000:])
    result=json.loads(html.unescape(match[1]))
    print(json.dumps(result,ensure_ascii=False))
    if result['errors'] or not result['scriptsLoaded']: raise SystemExit(1)
finally:
    server.shutdown();server.server_close();thread.join(timeout=5)
    assert work.resolve().parent == (ROOT/'dev').resolve() and work.name == 'editor-astra-work'
    shutil.rmtree(work)
