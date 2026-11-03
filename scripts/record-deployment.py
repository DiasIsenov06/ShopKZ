"""Record an already performed production deployment. Does not deploy code."""
import argparse
import json
import os
import re
import urllib.request

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--repo',default='DiasIsenov06/ShopKZ')
p.add_argument('--sha',required=True,help='Full commit SHA actually running in the target environment')
p.add_argument('--state',choices=['success','failure'],required=True)
p.add_argument('--environment',default='production')
a=p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',a.repo) or not re.fullmatch(r'[a-fA-F0-9]{40}',a.sha):p.error('Invalid repo or SHA')
token=os.getenv('GH_TOKEN') or os.getenv('GITHUB_TOKEN')
if not token:p.error('GH_TOKEN with deployments:write is required')
base='https://api.github.com/repos/'+a.repo
headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}
def post(path,data):
    req=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers=headers,method='POST')
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
d=post('/deployments',{'ref':a.sha,'auto_merge':False,'required_contexts':[], 'environment':a.environment,'production_environment':a.environment=='production','description':'Operator-confirmed placement; not a CI result'})
s=post(f"/deployments/{d['id']}/statuses",{'state':a.state,'description':'Recorded after operator / QA verification','auto_inactive':True})
print(json.dumps({'deployment_id':d['id'],'status_id':s['id'],'recorded_at':s['created_at']},indent=2))
