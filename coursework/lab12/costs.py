"""Content-token cost scenario. No commercial API requests are made."""
import json,statistics,math
from pathlib import Path
import tiktoken
P=Path(__file__).parent
rows=json.loads((P/'results.json').read_text());enc=tiktoken.encoding_for_model('gpt-4.1-mini')
counts=[]
for r in rows:
 messages=r['payload']['messages'];input_tokens=sum(len(enc.encode(m['content'])) for m in messages);output_tokens=len(enc.encode(r['raw_output']))
 counts.append({'id':r['id'],'input_content_tokens':input_tokens,'output_content_tokens':output_tokens,'ollama_input_tokens':r['prompt_eval_count'],'ollama_output_tokens':r['eval_count']})
in_avg=statistics.mean(x['input_content_tokens'] for x in counts);out_avg=statistics.mean(x['output_content_tokens'] for x in counts)
pin=.4;pout=1.6;hour=.89;hours=730
per=(in_avg*pin+out_avg*pout)/1_000_000;monthly=hour*hours
result={'as_of':'2026-11-03','currency':'USD','commercial_scenario_model':'gpt-4.1-mini','model_status':'Legacy/deprecated marker appears on official model page; cost comparison only, not a new deployment recommendation','tokenizer':enc.name,'token_scope':'exact content tokens on recorded prompts and outputs; chat framing, retries, reasoning and tool tokens excluded; commercial model outputs were not measured','input_price_per_million':pin,'output_price_per_million':pout,'price_source':'https://developers.openai.com/api/docs/models/gpt-4.1-mini','gpu_source':'https://www.runpod.io/pricing','gpu':'RTX 4090 Pod listed hourly rate','gpu_hourly_usd':hour,'hours_per_month_assumption':hours,'input_tokens_mean':in_avg,'output_tokens_mean':out_avg,'cost_per_request_usd':per,'scenarios':[{'requests':n,'input_tokens':n*in_avg,'output_tokens':n*out_avg,'api_usd':n*per,'gpu_compute_usd':monthly} for n in [10000,100000]],'gpu_monthly_compute_usd':monthly,'break_even_requests_compute_only':math.ceil(monthly/per),'break_even_rps':monthly/per/(hours*3600),'not_included':['GPU storage','egress','taxes','engineering','monitoring','capacity validation'],'actual_commercial_api_requests':0,'actual_paid_spend_usd':0}
(P/'token_counts.json').write_text(json.dumps(counts,ensure_ascii=False,indent=2));(P/'costs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
