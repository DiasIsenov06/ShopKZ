import os
# Some PID namespaces hide the Locust process from psutil. Only process CPU metrics are disabled.
if os.getenv('SHOPKZ_NO_PROCESS_METRICS') == '1':
 from locust.runners import Runner
 import gevent
 def _no_process_metrics(self):
  while True: gevent.sleep(1)
 Runner.monitor_cpu_and_memory = _no_process_metrics
from locust import HttpUser,task,between
class StoreReader(HttpUser):
 wait_time=between(.05,.15)
 @task(3)
 def products(self):
  with self.client.get('/api/products',catch_response=True) as r:
   if r.status_code!=200 or not r.json().get('products'):r.failure('catalog unavailable')
 @task
 def search(self):self.client.get('/api/products?search=Наушники',name='/api/products?search')
