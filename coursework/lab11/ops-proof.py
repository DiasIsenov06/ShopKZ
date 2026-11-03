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
 # Namespace PID 1 can ignore a SIGKILL sent by another container process.
 # Ask Node's local inspector to exit the main process instead, so this is
 # an application crash rather than a manual docker stop/kill policy override.
 crash="process.kill(1,'SIGUSR1');setTimeout(async()=>{const a=await(await fetch('http://127.0.0.1:9229/json/list')).json();const w=new WebSocket(a[0].webSocketDebuggerUrl);w.onopen=()=>{w.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'process.exit(23)'}}));setTimeout(()=>w.close(),200);};},600);setTimeout(()=>process.exit(2),5000);"
 started=time.monotonic();subprocess.run(['docker','exec',container,'node','-e',crash],check=False,capture_output=True,timeout=15)
 time.sleep(1);waithealthy()
 for _ in range(3):
  assert healthy();time.sleep(.3)
 recovery=time.monotonic()-started
 inspected=json.loads(subprocess.run(['docker','inspect',container],check=True,capture_output=True,text=True).stdout)[0]
 assert inspected['RestartCount']>=1
 # Rollback rehearsal with two real disposable image IDs. The bad version
 # intentionally exits on startup. No schema migration is introduced.
 old_id='rollback-proof-order'
 seed="const D=require('better-sqlite3');const d=new D(process.env.SHOPKZ_DB_PATH);d.prepare(\"INSERT INTO orders(id,user_email,items,total) VALUES(?,?,?,?)\").run('rollback-proof-order','rollback@example.test','[]',19350);console.log(d.pragma('integrity_check'));d.close();"
 subprocess.run(['docker','exec',container,'node','-e',seed],check=True,capture_output=True)
 backup="const D=require('better-sqlite3');const d=new D(process.env.SHOPKZ_DB_PATH);d.backup('/app/data/pre-rollback.db').then(()=>d.close());"
 subprocess.run(['docker','exec',container,'node','-e',backup],check=True,capture_output=True)
 good_image=inspected['Image']
 bad_image=subprocess.run(['docker','commit','--change','CMD ["node","-e","process.exit(23)"]',container,'shopkz-lab11-bad:exercise'],check=True,capture_output=True,text=True).stdout.strip()
 bad_override=OUT/'bad-version.yaml';bad_override.write_text('services:\n  shopkz:\n    image: shopkz-lab11-bad:exercise\n')
 subprocess.run(base+['-f',str(bad_override),'up','-d','--no-build','--force-recreate','shopkz'],check=True)
 time.sleep(3);assert not healthy(),'Faulty training image unexpectedly healthy'
 event('faulty training image fails readiness')
 rollback_start=time.monotonic();dc('up','-d','--no-build','--force-recreate','shopkz');waithealthy()
 container=dc('ps','-q','shopkz',capture_output=True,text=True).stdout.strip()
 check="const D=require('better-sqlite3');const d=new D(process.env.SHOPKZ_DB_PATH);const o=d.prepare('SELECT total FROM orders WHERE id=?').get('rollback-proof-order');if(!o||o.total!==19350||d.pragma('integrity_check',{simple:true})!=='ok')process.exit(1);console.log(JSON.stringify({order_preserved:true,integrity:'ok'}));d.close();"
 subprocess.run(['docker','exec',container,'node','-e',check],check=True,capture_output=True)
 restored=json.loads(subprocess.run(['docker','inspect',container],check=True,capture_output=True,text=True).stdout)[0]
 assert restored['Image']==good_image and good_image!=bad_image
 rollback={'good_image':good_image,'bad_image':bad_image,'restored_image':restored['Image'],'order_preserved':True,'integrity':'ok','seconds':time.monotonic()-rollback_start,'schema_migration_tested':False,'fault':'isolated image CMD exits 23'}
 (OUT/'rollback.json').write_text(json.dumps(rollback,indent=2));event('known-good image rollback preserves order')
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
