"""Executive dashboard over the saved GitHub evidence. No paid BI."""
import json
from pathlib import Path
import streamlit as st
P=Path(__file__).parent
st.set_page_config(page_title='ShopKZ — статус',layout='wide')
st.markdown('<style>html,body,[data-testid="stAppViewContainer"],header{background:white!important;color:black!important}*{color:black!important}svg{filter:grayscale(1)}</style>',unsafe_allow_html=True)
d=json.loads((P/'dashboard-data.json').read_text())
st.title('ShopKZ — статус проекта')
st.caption('Срез GitHub: '+d['snapshot_at']+'. Плановые оценки отделены от измерений.')
a,b,c=st.columns(3)
a.metric('Открытые задачи',d['open']);b.metric('Закрытые задачи',d['closed']);c.metric('Максимальный возраст',str(d['max_open_age_days'])+' дн.')
st.subheader('Вехи и прогресс')
st.table([{'Веха':m['release'],'План':m['planned'],'Факт':m['actual'] or 'Не подтверждён','Приёмка':'Ожидается'} for m in d['milestones']])
st.write('Процент готовности вех не измерен: GitHub Milestones пуст. Число открытых задач не отражает объём реализованного кода.')
st.subheader('Метрики потока и DORA')
st.write('Throughput:',d['throughput_closed'],'задач. Cycle time:',d['cycle_time_days'] if d['cycle_time_days'] is not None else 'N/A, нет завершённых задач.')
st.json(d['dora'],expanded=False)
st.write('CI не считается production deployment. Для lead time, CFR и recovery нужны реальные события поставки и инцидентов.')
st.subheader('Бюджет')
st.table([{'Показатель':'План труда','Значение':'300 чел.-ч'},{'Показатель':'Доступная ёмкость','Значение':'312 чел.-ч'},{'Показатель':'Условная ставка','Значение':'2 000 ₸/ч'},{'Показатель':'Сценарный бюджет','Значение':'600 000 ₸'},{'Показатель':'Фактические расходы','Значение':'Нет табеля и платежей'}])
st.subheader('Риски и зависимости')
st.write('Ожидаются внешняя UAT, независимый review main и подтверждение производственных релизов. AI-классификатор не прошёл порог допуска.')
st.table(d['dependencies'])
st.subheader('Приоритеты WSJF')
st.dataframe(json.loads((P/'wsjf.json').read_text()),hide_index=True,use_container_width=True)
