"""Bounded demo exercise on disposable Docker volumes, never production."""
import json,os,subprocess,time,urllib.request
from pathlib import Path
P=Path(__file__).parent; OUT=P/'results'/'docker';OUT.mkdir(parents=True,exist_ok=True)
base=['docker','compose','-p','shopkz-lab11','-f',str(P/'compose.yaml')]
def dc(*args,**kw):return subprocess.run(base+list(args),check=True,**kw)
def healthy():
 try:
  with urllib.request.urlopen('http://127.0.0.1:3000/api/products',timeout=2) as r:return r.status==200
 except Exception:return False
def waithealthy():
 for _ in range(90):
  if healthy():return
  time.sleep(1)
 raise RuntimeError('ShopKZ failed readiness')
def event(name):events.append({'event':name,'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
events=[]
try:
 dc('up','-d','--build');waithealthy()
 kuma=dc('ps','-q','uptime-kuma',capture_output=True,text=True).stdout.strip()
 for _ in range(90):
  try:urllib.request.urlopen('http://127.0.0.1:3001',timeout=2);break
  except Exception:time.sleep(2)
 else:raise RuntimeError('Kuma failed readiness')
 subprocess.run(['docker','cp',str(P/'kuma-proof.cjs'),kuma+':/tmp/kuma-proof.cjs'],check=True)
 proof=subprocess.Popen(['docker','exec','-e','KUMA_DEMO_PASSWORD='+os.environ['KUMA_DEMO_PASSWORD'],kuma,'node','/tmp/kuma-proof.cjs'],stdout=open(OUT/'kuma.log','w'),stderr=subprocess.STDOUT)
 for _ in range(40):
  if subprocess.run(['docker','exec',kuma,'test','-f','/tmp/monitor.json'],capture_output=True).returncode==0:break
  if proof.poll() is not None:raise RuntimeError('Monitor configuration failed')
  time.sleep(2)
 else:raise RuntimeError('No monitor created')
 time.sleep(25);event('healthy monitor baseline')
 dc('stop','shopkz');event('intentional demo stop');time.sleep(45)
 dc('start','shopkz');waithealthy();event('demo restarted');time.sleep(45)
 subprocess.run(['docker','cp',kuma+':/tmp/heartbeats.json',str(OUT/'heartbeats.json')],check=True)
 beats=json.loads((OUT/'heartbeats.json').read_text());statuses=[b['status'] for b in beats]
 assert 0 in statuses and 1 in statuses,statuses
 assert any(a==0 and b==1 for a,b in zip(statuses,statuses[1:])),statuses
 event('Kuma DOWN then UP confirmed')
 # Policy restart is checked separately from intentional docker compose stop.
 container=dc('ps','-q','shopkz',capture_output=True,text=True).stdout.strip()
 started=time.monotonic();subprocess.run(['docker','exec',container,'node','-e','process.kill(1,"SIGKILL")'],check=False,capture_output=True)
 time.sleep(1);waithealthy();recovery=time.monotonic()-started
 inspected=json.loads(subprocess.run(['docker','inspect',container],check=True,capture_output=True,text=True).stdout)[0]
 assert inspected['RestartCount']>=1
 (OUT/'summary.json').write_text(json.dumps({'monitor_statuses':statuses,'restart_count':inspected['RestartCount'],'restart_recovery_seconds':recovery,'events':events},indent=2))
 (OUT/'events.json').write_text(json.dumps(events,indent=2))
 # screenshot only after login, credentials never appear in the image
 from playwright.sync_api import sync_playwright
 with sync_playwright() as p:
  browser=p.chromium.launch();page=browser.new_page(viewport={'width':1250,'height':850})
  page.goto('http://127.0.0.1:3001');page.locator('#floatingInput').fill('demo-admin');page.locator('#floatingPassword').fill(os.environ['KUMA_DEMO_PASSWORD']);page.get_by_role('button',name='Log in',exact=True).click();page.wait_for_url('**/dashboard**');page.wait_for_timeout(2500)
  page.add_style_tag(content='* {filter: grayscale(1) !important;}');page.screenshot(path=str(OUT/'kuma-dashboard.png'),full_page=True)
  browser.close()
 print(json.dumps({'restart_count':inspected['RestartCount'],'Kuma':'DOWN/UP confirmed'}))
finally:
 dc('logs','--no-color',stdout=open(OUT/'compose.log','w'),stderr=subprocess.STDOUT)
 dc('down','-v')
