"""Transparent planning estimates, never reported as measured business value."""
import csv,json
from pathlib import Path
P=Path(__file__).parent
specs=[('I01','Атомарность заказа и остатков',13,13,13,3,'Backend','14'),('I02','Мониторинг и автоматический перезапуск',8,13,13,3,'DevOps','30'),('I03','Внешняя UAT checkout',13,13,8,5,'QA','32'),('I04','Резервирование и проверенный rollback',8,8,13,5,'Backend','31'),('I05','Уточнение описаний и фильтров каталога',8,5,3,3,'Frontend','10'),('I06','Доступность мобильного интерфейса',8,5,5,5,'Frontend','12'),('I07','Безопасность сессий демостенда',13,8,13,8,'Backend','13'),('I08','Персональные рекомендации',5,3,3,13,'AI',''),('I09','Классификатор обращений',8,3,5,8,'AI',''),('I10','Черновик PM отчета',5,5,5,5,'PM','')]
rows=[]
for id,title,value,urgency,risk,size,owner,issue in specs:rows.append({'id':id,'initiative':title,'business_value':value,'time_criticality':urgency,'risk_reduction':risk,'job_size':size,'cost_of_delay':value+urgency+risk,'wsjf':(value+urgency+risk)/size,'owner_role':owner,'related_issue':issue,'estimate_kind':'author planning estimate, relative Fibonacci scale'})
rows.sort(key=lambda r:(-r['wsjf'],-r['time_criticality'],r['id']))
for n,r in enumerate(rows,1):r['rank']=n
with open(P/'wsjf.csv','w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
(P/'wsjf.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
# Capacity cost scenario derives from existing plan, rate is an explicit assumption.
plan_hours=300;capacity=312;rate=2000;delay_weeks=4;weekly_capacity=29
scenarios=[{'option':'A сохранить весь объем и команду','deadline':'2027-02-26','scope_hours':300,'extra_hours':0,'extra_budget_kzt':0,'total_budget_kzt':plan_hours*rate,'assumptions':'фиксированная оплата за объем, без расходов продления инфраструктуры'}, {'option':'B сохранить срок сократить объем','deadline':'2027-01-29','scope_hours':184,'extra_hours':0,'extra_budget_kzt':0,'total_budget_kzt':184*rate,'assumptions':'из 300 ч отложить 4×29=116 ч; экономия только при оплате фактического объема'}, {'option':'C сохранить срок и объем усилить команду','deadline':'2027-01-29','scope_hours':300,'extra_hours':145,'extra_budget_kzt':145*rate,'total_budget_kzt':(300+145)*rate,'assumptions':'дефицит 116 эффективных ч / 0.8 продуктивности =145 оплачиваемых ч; параллельность и 20% потерь еще не проверены'}]
(P/'sponsor_options.json').write_text(json.dumps({'hypothetical_roleplay':True,'base_deadline':'2027-01-29','delay_weeks':4,'assumed_rate_kzt_per_hour':rate,'baseline_budget_kzt':plan_hours*rate,'budget_actual_kzt':None,'options':scenarios},ensure_ascii=False,indent=2))
print([(r['rank'],r['id'],round(r['wsjf'],2)) for r in rows])
