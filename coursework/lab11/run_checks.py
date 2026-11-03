"""Isolated local API checks, modest load and explicitly controlled demo outage."""
import csv,datetime as dt,json,os,subprocess,sys,tempfile,time
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[2];P=Path(__file__).parent
PROJECT=ROOT if (ROOT/'server.js').exists() else ROOT/'project/ShopKZ_Modern_Complete/ShopKZ_GitHub';BASE='http://127.0.0.1:4331'
P.joinpath('results').mkdir(exist_ok=True)
def stamp():return dt.datetime.now(dt.timezone.utc).isoformat()
with tempfile.TemporaryDirectory(prefix='shopkz-uat-') as tmp:
 env={**os.environ,'PORT':'4331','SHOPKZ_DB_PATH':tmp+'/demo.db','SESSION_SECRET':'isolated-uat-session-not-production','SHOPKZ_TEST_URL':BASE,'SHOPKZ_NO_PROCESS_METRICS':'1'}
 log=open(P/'results/demo-server.log','w')
 def start():
  proc=subprocess.Popen(['node','server.js'],cwd=PROJECT,env=env,stdout=log,stderr=log)
  for _ in range(100):
   try:
    if requests.get(BASE+'/api/products',timeout=.3).status_code==200:return proc
   except requests.RequestException:pass
   time.sleep(.1)
  raise RuntimeError('server failed to start')
 proc=start();codes={}
 try:
  with open(P/'results/pytest.log','w') as out:codes['pytest']=subprocess.run([sys.executable,'-m','pytest',str(P/'test_api.py'),'-v','--junitxml='+str(P/'results/pytest.xml')],env=env,stdout=out,stderr=subprocess.STDOUT).returncode
  with open(P/'results/bruno.log','w') as out:codes['bruno']=subprocess.run([os.getenv('BRUNO_CLI','/tmp/shopkz-bruno/node_modules/.bin/bru'),'run','--env','Local','--reporter-json',str(P/'results/bruno.json')],cwd=P/'bruno',env=env,stdout=out,stderr=subprocess.STDOUT).returncode
  with open(P/'results/locust.log','w') as out:codes['locust']=subprocess.run([sys.executable,'-m','locust','-f',str(P/'locustfile.py'),'--headless','--host',BASE,'-u','10','-r','5','-t','12s','--csv',str(P/'results/load'),'--only-summary'],env=env,stdout=out,stderr=subprocess.STDOUT).returncode
  # Independent real probe readings. Not Uptime Kuma, not a production incident.
  readings=[];events=[{'at':stamp(),'event':'controlled exercise begins'}]
  def probe():
   st=time.perf_counter();status=None
   try:r=requests.get(BASE+'/api/products',timeout=.5);status=r.status_code;up=status==200 and len(r.json()['products'])>0
   except requests.RequestException:up=False
   readings.append({'at':stamp(),'up':up,'http_status':status,'elapsed_ms':(time.perf_counter()-st)*1000});time.sleep(.5)
  for _ in range(3):probe()
  events.append({'at':stamp(),'event':'operator stops isolated demo process'});proc.terminate();proc.wait(timeout=10)
  for _ in range(5):probe()
  events.append({'at':stamp(),'event':'operator starts same demo version same database'});proc=start()
  for _ in range(3):probe()
  events.append({'at':stamp(),'event':'three healthy probes confirmed recovery'})
  outage_start=next(x['at'] for x in readings if not x['up']);first_up=next(x['at'] for x in readings if x['at']>outage_start and x['up'])
  incident={'kind':'controlled local demo outage, not production','events':events,'readings':readings,'failed_probes':sum(not x['up'] for x in readings),'observed_recovery_seconds':(dt.datetime.fromisoformat(first_up)-dt.datetime.fromisoformat(outage_start)).total_seconds()}
  (P/'results/incident.json').write_text(json.dumps(incident,ensure_ascii=False,indent=2))
  rows=list(csv.DictReader(open(P/'results/load_stats.csv')));agg=next(r for r in rows if r['Name']=='Aggregated');(P/'results/summary.json').write_text(json.dumps({'exit_codes':codes,'load':agg,'process_cpu_metrics':'unavailable in PID namespace, disabled for rerun; HTTP measurements active','docker_available':False,'kuma_running':False,'external_uat':'not conducted; no external participants supplied'},ensure_ascii=False,indent=2))
  print(codes,agg,incident['observed_recovery_seconds'],flush=True)
 finally:
  if proc.poll() is None:proc.terminate();proc.wait(timeout=10)
  log.close()
