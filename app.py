from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import json, uuid, datetime, os
from rule_engine import eval_expr

app = FastAPI()
with open('ruleset.json') as f:
    RULES = json.load(f)

def build_context(checks):
    ctx = {}
    for c in checks:
        cid = c.get('id'); ctx[cid] = c.get('value')
    return ctx

@app.post('/upload-file')
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        payload = json.loads(contents)
    except Exception:
        raise HTTPException(400, 'Invalid JSON')
    context = build_context(payload.get('checks', []))
    results=[]; passed=0
    for rule in RULES:
        try:
            ok = eval_expr(rule['rule'], context)
            status = 'PASS' if ok else 'FAIL'
        except Exception:
            status = 'ERROR'
        if status=='PASS': passed +=1
        results.append({'control':rule['control_id'],'status':status,'rule':rule['rule']})
    score = int((passed/len(RULES))*100)
    report = {'report_id':str(uuid.uuid4()),'asset':payload.get('asset_id'),'score':score,'details':results,'timestamp':datetime.datetime.utcnow().isoformat()+'Z'}
    os.makedirs('reports', exist_ok=True)
    with open(os.path.join('reports',report['report_id']+'.json'),'w') as f:
        json.dump(report,f,indent=2)
    return JSONResponse(report)
