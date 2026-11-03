"""Render genuine observations; missing data is displayed explicitly."""
import argparse
import html
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def render(folder):
    p=Path(folder)
    m=json.loads((p/'metrics.json').read_text())
    s=json.loads((p/'snapshot.json').read_text())
    cards=[('Deployment frequency',f"{m['deployments_per_day']:.3f} / day",f"{m['deployment_count']} successful production deployments",'deployment_frequency'),
           ('Lead time for changes',fmt(m['lead_time_hours_median'],'h'),f"{m['lead_samples']} commit samples",'lead_time'),
           ('Change failure rate',fmt(m['change_failure_rate_percent'],'%'),'Complete incident register required','change_failure_rate'),
           ('Failed deployment recovery time',fmt(m['recovery_hours_median'],'h'),f"{m['recovery_samples']} recovered; {m['open_incidents']} still open",'recovery_time')]
    fig,axes=plt.subplots(2,2,figsize=(13,7),facecolor='#101b2d')
    for ax,(title,value,note,key) in zip(axes.flat,cards):
        ax.set_facecolor('#1c2b43');ax.set_xticks([]);ax.set_yticks([])
        for spine in ax.spines.values():spine.set_visible(False)
        ax.text(.06,.78,title,transform=ax.transAxes,color='#ced9eb',size=13)
        ax.text(.06,.43,value,transform=ax.transAxes,color='#6ce5c2',size=27,weight='bold')
        ax.text(.06,.23,note,transform=ax.transAxes,color='white',size=10)
        ax.text(.06,.10,m['tiers'][key],transform=ax.transAxes,color='#ffcd8a',size=10)
    fig.suptitle(m['repository']+' | DORA | production',color='white',size=19)
    fig.text(.5,.025,m['start'][:10]+' to '+m['end'][:10]+' | Source: GitHub REST API | N/A is not zero',ha='center',color='#ced9eb',size=10)
    fig.subplots_adjust(top=.87,bottom=.09,hspace=.18,wspace=.12)
    fig.savefig(p/'dashboard.png',dpi=160);plt.close(fig)
    blocks=''.join(f'<article><h2>{html.escape(t)}</h2><strong>{html.escape(v)}</strong><p>{html.escape(n)}</p><small>{html.escape(m["tiers"][k])}</small></article>' for t,v,n,k in cards)
    context=s.get('repository_context',{})
    page='''<!doctype html><html lang="kk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShopKZ · DORA</title><style>body{font:16px system-ui;background:#101b2d;color:#e7edf6;max-width:1050px;margin:48px auto;padding:20px}h1{font-size:36px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}article{background:#1c2b43;padding:28px;border-radius:18px}h2{font-size:18px;font-weight:500}strong{font-size:35px;color:#6ce5c2}small{color:#ffcd8a}p{line-height:1.7}a{color:#6ce5c2}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style>'''
    page+=f'<h1>ShopKZ · DORA дашборды</h1><p>{html.escape(m["start"])} → {html.escape(m["end"])} · production</p><div class="grid">{blocks}</div>'
    page+=f'<h2>Деректің шекарасы</h2><p>GitHub REST API: {context.get("commit_count",0)} commit, {context.get("issue_count",0)} issue, {context.get("workflow_run_count",0)} Actions run. Deployment және инцидент деректері болмаған жағдайда N/A көрсетіледі. Commit немесе CI саны production deployment санына ауыстырылмайды. 0/day — тек API-де байқалған жиілік; ол команданың нақты деңгейін дәлелдемейді.</p>'
    page+='<p>Деңгейлер — оқу жұмысына арналған тұрақты шкала. Бұл қазіргі DORA есебінің ресми рейтингтері емес. Recovery — қалпына келтірілген инциденттер уақытының медианасы; ашық инциденттер бөлек есептеледі. Lead time — commit-тен алғашқы сәтті production орналастыруына дейін.</p><p><a href="metrics.json">Есептелген мәндер</a> · <a href="snapshot.json">Бастапқы деректер</a> · <a href="api-responses.json">API жауаптары және SHA-256</a></p>'
    (p/'dashboard.html').write_text(page,encoding='utf-8')

def fmt(value,unit):
    return 'N/A' if value is None else f'{value:.2f} {unit}'

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--data',default='dora/data');args=parser.parse_args();render(args.data)
