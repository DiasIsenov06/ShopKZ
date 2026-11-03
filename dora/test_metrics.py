"""Synthetic unit fixtures only; never used as production evidence."""
import copy
import unittest
from collect import calculate, GitHub


def deployment(i, sha, at, changes=None, environment='production'):
    return {'id':i,'sha':sha,'environment':environment,'statuses':[{'id':i,'state':'success','created_at':at}], 'changes':changes}


def snapshot():
    return {'repository':'test/fixture','environment':'production','start':'2026-10-01T00:00:00Z','end':'2026-10-31T00:00:00Z','deployments':[], 'incidents':[], 'incidents_complete':False}

class MetricsTests(unittest.TestCase):
    def test_no_events_are_not_perfect_stability(self):
        m=calculate(snapshot())
        self.assertEqual(m['deployments_per_day'],0)
        self.assertIsNone(m['change_failure_rate_percent'])
        self.assertIsNone(m['recovery_hours_median'])
        self.assertTrue(m['tiers']['deployment_frequency'].startswith('N/A'))

    def test_failed_ci_is_not_a_deployment(self):
        s=snapshot();s['workflow_runs']=[{'conclusion':'failure'}]
        s['deployments']=[deployment(1,'x','2026-10-02T00:00:00Z',environment='staging')]
        self.assertEqual(calculate(s)['deployment_count'],0)

    def test_window_lead_dedup_and_recovery(self):
        s=snapshot();s['incidents_complete']=True
        changes=[{'sha':'a','committed_at':'2026-10-02T00:00:00Z'}]
        s['deployments']=[deployment(1,'base','2026-09-30T00:00:00Z'),deployment(2,'a','2026-10-02T02:00:00Z',changes),deployment(3,'a','2026-10-03T00:00:00Z',changes),deployment(4,'outside','2026-10-31T00:00:00Z',[])]
        s['incidents']=[{'deployment_id':2,'started_at':'2026-10-02T02:15:00Z','restored_at':'2026-10-02T02:45:00Z'}]
        m=calculate(s)
        self.assertEqual(m['deployment_count'],2)
        self.assertEqual(m['lead_samples'],1)
        self.assertEqual(m['lead_time_hours_median'],2)
        self.assertEqual(m['change_failure_rate_percent'],50)
        self.assertEqual(m['recovery_hours_median'],.5)

    def test_incomplete_incident_register_does_not_mean_zero_failures(self):
        s=snapshot();s['deployments']=[deployment(1,'x','2026-10-02T00:00:00Z')]
        self.assertIsNone(calculate(s)['change_failure_rate_percent'])
        s['incidents_complete']=True
        self.assertEqual(calculate(s)['change_failure_rate_percent'],0)

    def test_open_incident_is_counted_but_not_imputed(self):
        s=snapshot();s['incidents_complete']=True
        s['deployments']=[deployment(1,'x','2026-10-02T00:00:00Z')]
        s['incidents']=[{'deployment_id':1,'started_at':'2026-10-02T00:15:00Z','restored_at':None}]
        m=calculate(s)
        self.assertEqual(m['open_incidents'],1)
        self.assertEqual(m['change_failure_rate_percent'],100)
        self.assertIsNone(m['recovery_hours_median'])

    def test_negative_recovery_rejected(self):
        s=snapshot();s['deployments']=[deployment(1,'x','2026-10-02T00:00:00Z')]
        s['incidents']=[{'deployment_id':1,'started_at':'2026-10-02T02:00:00Z','restored_at':'2026-10-02T01:00:00Z'}]
        with self.assertRaises(ValueError):calculate(s)

    def test_all_pages_followed(self):
        api=GitHub('test/fixture');calls=[]
        def get(path):
            calls.append(path)
            return ([1],'<https://api.github.com/next>; rel="next"') if len(calls)==1 else ([2],'')
        api.get=get
        self.assertEqual(api.pages('/deployments'),[1,2])
        self.assertEqual(len(calls),2)

if __name__=='__main__':unittest.main()
