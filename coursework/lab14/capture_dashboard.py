"""Render the actual Streamlit dashboard in the disposable CI runner."""
import subprocess,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('coursework/lab11/results/docker');out.mkdir(parents=True,exist_ok=True)
log=open(out/'streamlit.log','w')
p=subprocess.Popen(['python','-m','streamlit','run','coursework/lab14/streamlit_app.py','--server.headless=true','--server.port=8514','--browser.gatherUsageStats=false'],stdout=log,stderr=log)
try:
 for _ in range(60):
  try:urllib.request.urlopen('http://localhost:8514/_stcore/health',timeout=1);break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('Streamlit readiness failed')
 with sync_playwright() as w:
  b=w.chromium.launch();page=b.new_page(viewport={'width':1300,'height':1000})
  page.goto('http://localhost:8514');page.get_by_role('heading',name='ShopKZ — статус проекта',exact=True).wait_for(timeout=30000);page.wait_for_timeout(3000)
  assert page.locator('[data-testid="stException"]').count()==0
  page.add_style_tag(content='html {filter:grayscale(1)!important;}');page.screenshot(path=str(out/'executive-dashboard.png'),full_page=True);b.close()
 print('Streamlit dashboard rendered without exceptions')
finally:p.terminate();p.wait(timeout=15);log.close()
