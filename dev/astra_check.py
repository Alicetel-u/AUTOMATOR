"""Real Chromium regression and layout sheet for the opt-in Astra library."""
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CHROME = os.environ.get('CHROME_PATH', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
work = ROOT / 'dev' / 'astra-work'
work.mkdir(exist_ok=True)
ui = '--ui' in sys.argv
outro = '--outro' in sys.argv
script = '\n'.join(p.read_text(encoding='utf-8') for p in sorted((ROOT/'src').glob('*.js')) if p.name != '12_ui.js')
test = (ROOT/('dev/astra_ui_test.js' if ui else 'dev/outro_test.js' if outro else 'dev/astra_test.js')).read_text(encoding='utf-8')
page = work/'check.html'
content = (ROOT/'index.html').read_text(encoding='utf-8').replace('</body>', '<script>'+test+'</script></body>') if ui else '<body style="margin:0;background:#101219;color:white"><script>'+script+'</script><script>'+test+'</script>'
page.write_text(content, encoding='utf-8')
try:
    proc = subprocess.run([CHROME, '--headless', '--disable-gpu', '--no-first-run', '--no-sandbox',
        '--disable-background-networking', '--hide-scrollbars', '--window-size=1500,1200',
        '--user-data-dir='+str(work/'profile'), '--dump-dom',
        '--screenshot='+str(ROOT/('dev/astra-ui-preview.png' if ui else 'dev/outro-preview.png' if outro else 'dev/astra-preview.png')), page.as_uri()], capture_output=True, timeout=180)
    match = re.search(r'<pre id="result">(.*?)</pre>', proc.stdout.decode('utf-8', errors='replace'), re.S)
    if not match: raise RuntimeError(proc.stderr.decode('utf-8',errors='replace')[-2000:])
    result = json.loads(html.unescape(match[1]))
    print(json.dumps(result,ensure_ascii=False))
    if result['errors']: raise SystemExit(1)
finally:
    assert work.resolve().parent == (ROOT/'dev').resolve() and work.name == 'astra-work'
    shutil.rmtree(work)
