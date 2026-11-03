"""Read-only GitHub REST collector. Raw responses and hashes are retained."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

UTC = dt.timezone.utc

def instant(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)

class GitHub:
    def __init__(self, repo):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
            raise ValueError('Expected owner/repository')
        self.base = 'https://api.github.com/repos/' + repo
        self.responses = []

    def get(self, path):
        url = path if path.startswith('https://api.github.com/') else self.base + path
        if not url.startswith('https://api.github.com/'):
            raise ValueError('Unexpected API host')
        headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ShopKZ-DORA-lab10'}
        token = os.getenv('GH_TOKEN') or os.getenv('GITHUB_TOKEN')
        if token:
            headers['Authorization'] = 'Bearer ' + token
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
                    raw = response.read()
                    data = json.loads(raw)
                    link = response.headers.get('Link', '')
                    self.responses.append({'url': url, 'fetched_at': dt.datetime.now(UTC).isoformat(), 'sha256': hashlib.sha256(raw).hexdigest(), 'raw': raw.decode(), 'link': link})
                    return data, link
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError(f'GitHub HTTP {exc.code}: {url}; check access / rate limit') from exc
                time.sleep(2 ** attempt)
        raise RuntimeError('API retries exhausted')

    def pages(self, path, key=None):
        output = []
        while path:
            data, link = self.get(path)
            output.extend(data[key] if key else data)
            match = re.search(r'<([^>]+)>; rel="next"', link)
            path = match.group(1) if match else None
        return output


def calculate(snapshot):
    start, end = instant(snapshot['start']), instant(snapshot['end'])
    days = (end - start).total_seconds() / 86400
    if days <= 0:
        raise ValueError('end must follow start')
    successes = []
    for deployment in snapshot['deployments']:
        if deployment['environment'] != snapshot['environment']:
            continue
        statuses = sorted(deployment['statuses'], key=lambda s: (s['created_at'], s['id']))
        success = next((s for s in statuses if s['state'] == 'success'), None)
        if success:
            successes.append({**deployment, 'deployed_at': success['created_at']})
    successes.sort(key=lambda d: (d['deployed_at'], d['id']))
    in_window = [d for d in successes if start <= instant(d['deployed_at']) < end]
    ids = {d['id'] for d in in_window}
    # Deduplicate commits across successful deployments, including earlier deployments.
    seen, lead_hours = set(), []
    warnings = list(snapshot.get('warnings', []))
    for dep in successes:
        changes = dep.get('changes')
        if dep['id'] in ids and changes is None:
            warnings.append(f"Deployment {dep['id']}: no comparable previous production deployment; lead time unknown")
        for commit in changes or []:
            sha = commit['sha']
            if sha not in seen and dep['id'] in ids:
                hours = (instant(dep['deployed_at']) - instant(commit['committed_at'])).total_seconds()/3600
                if hours >= 0:
                    lead_hours.append(hours)
                else:
                    warnings.append(f'Negative lead time excluded: {sha}')
            seen.add(sha)
        seen.add(dep['sha'])
    valid_incidents = []
    for incident in snapshot['incidents']:
        if incident['deployment_id'] not in ids:
            continue
        dep = next(d for d in in_window if d['id'] == incident['deployment_id'])
        if instant(incident['started_at']) < instant(dep['deployed_at']):
            raise ValueError('Incident precedes its deployment')
        if instant(incident['started_at']) < end:
            valid_incidents.append(incident)
    failures = {i['deployment_id'] for i in valid_incidents}
    recovery = []
    open_incidents = 0
    for incident in valid_incidents:
        restored = incident.get('restored_at')
        if not restored or instant(restored) >= end:
            open_incidents += 1
            continue
        hours = (instant(restored)-instant(incident['started_at'])).total_seconds()/3600
        if hours < 0:
            raise ValueError('restored_at precedes started_at')
        recovery.append(hours)
    import statistics
    lead = statistics.median(lead_hours) if lead_hours else None
    cfr = len(failures)/len(in_window)*100 if in_window and snapshot['incidents_complete'] else None
    restore = statistics.median(recovery) if recovery else None
    frequency = len(in_window)/days
    tiers = {
        'deployment_frequency': ('Elite' if frequency >= 1 else 'High' if frequency >= 1/7 else 'Medium' if frequency >= 1/30 else 'Low') if in_window else 'N/A: production events absent',
        'lead_time': tier(lead, [24, 168, 720]),
        'change_failure_rate': tier(cfr, [15.000001, 30.000001, 45.000001]),
        'recovery_time': tier(restore, [1, 24, 168])
    }
    return {'repository': snapshot['repository'], 'environment': snapshot['environment'], 'start': snapshot['start'], 'end': snapshot['end'], 'window_days': days,
            'deployment_count': len(in_window), 'deployments_per_day': frequency, 'lead_time_hours_median': lead,
            'change_failure_rate_percent': cfr, 'failed_deployment_count': len(failures), 'recovery_hours_median': restore,
            'lead_samples': len(lead_hours), 'recovery_samples': len(recovery), 'open_incidents': open_incidents,
            'incidents_complete': snapshot['incidents_complete'], 'tiers': tiers, 'warnings': warnings,
            'successful_deployments': [{'id': d['id'], 'sha': d['sha'], 'at': d['deployed_at']} for d in in_window],
            'rubric': 'Educational fixed thresholds; not a current official DORA team ranking. No events => no team tier.'}


def tier(value, bounds):
    if value is None:
        return 'N/A: insufficient evidence'
    return next((label for label, bound in zip(['Elite', 'High', 'Medium'], bounds) if value < bound), 'Low')


def collect(api, start, end, environment, complete):
    repository, _ = api.get('')
    deployments = api.pages('/deployments?per_page=100')
    issues = api.pages('/issues?state=all&per_page=100')
    runs, _ = api.get('/actions/runs?per_page=1')
    commits = api.pages('/commits?per_page=100')
    warnings, incidents = [], []
    for issue in issues:
        if 'pull_request' in issue or not any(l['name'] == 'incident' for l in issue['labels']):
            continue
        match = re.search(r'<!-- dora\s+(\{.*?\})\s*-->', issue.get('body') or '', re.S)
        if not match:
            raise ValueError(f"Incident #{issue['number']} needs a dora JSON marker")
        record = json.loads(match.group(1))
        if not isinstance(record.get('deployment_id'), int) or not record.get('started_at'):
            raise ValueError(f"Invalid incident #{issue['number']}")
        record['issue_number'] = issue['number']
        incidents.append(record)
    for dep in deployments:
        dep['statuses'] = api.pages(f"/deployments/{dep['id']}/statuses?per_page=100")
        dep['changes'] = None
    # Compare each success to the last earlier success; include history before the window.
    successes = []
    for d in deployments:
        times = [s['created_at'] for s in d['statuses'] if s['state'] == 'success']
        if d['environment'] == environment and times and instant(min(times)) < instant(end):
            successes.append((min(times), d))
    successes.sort(key=lambda item: (item[0], item[1]['id']))
    previous = None
    for deployed_at, dep in successes:
        if previous:
            path = f"/compare/{previous['sha']}...{dep['sha']}?per_page=100"
            comparison, _ = api.get(path)
            if comparison['status'] in ('ahead', 'identical'):
                changes = api.pages(path, key='commits')
                dep['changes'] = [{'sha': c['sha'], 'committed_at': c['commit']['committer']['date']} for c in changes]
            else:
                warnings.append(f"Deployment {dep['id']}: divergent/rollback history; excluded from lead time")
        previous = dep
    return {'schema': 1, 'repository': repository['full_name'], 'start': start, 'end': end, 'environment': environment,
            'incidents_complete': complete, 'deployments': deployments, 'incidents': incidents, 'warnings': warnings,
            'repository_context': {'commit_count': len(commits), 'issue_count': sum('pull_request' not in i for i in issues), 'workflow_run_count': runs['total_count']},
            'source': 'GitHub REST API; all deployment/status/issue/commit pages; no synthetic production events'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', default='DiasIsenov06/ShopKZ')
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--start')
    parser.add_argument('--end')
    parser.add_argument('--environment', default='production')
    parser.add_argument('--incidents-complete', action='store_true', help='Use only if the team confirms every production incident was recorded')
    parser.add_argument('--out', default='dora/data')
    parser.add_argument('--snapshot', help='Recalculate an existing raw snapshot without API access')
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.snapshot:
        snapshot = json.loads(Path(args.snapshot).read_text())
    else:
        end = instant(args.end) if args.end else dt.datetime.now(UTC)
        start = instant(args.start) if args.start else end-dt.timedelta(days=args.days)
        if start >= end:
            parser.error('start must be earlier than end')
        api = GitHub(args.repo)
        snapshot = collect(api, start.isoformat(), end.isoformat(), args.environment, args.incidents_complete)
        (out/'api-responses.json').write_text(json.dumps(api.responses, ensure_ascii=False, indent=2))
    (out/'snapshot.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))
    metrics = calculate(snapshot)
    (out/'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
    print(json.dumps(metrics, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
