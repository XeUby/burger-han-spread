"""Freeze small pre-quote models on the original whole-seed development split."""

import hashlib
import json
from collections import Counter
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import brier_score_loss
import sklearn

ROOT=Path(__file__).resolve().parents[2]
saved=json.loads((ROOT/"docs/booking-response-models.json").read_text())
path=ROOT/"runs/booking-response-data.json"
if hashlib.sha256(path.read_bytes()).hexdigest()!=saved["dataSha256"]:
    raise ValueError("Rebuild the original dataset with its frozen manifest")
data=json.loads(path.read_text())
names=["level","roadHours","originSupply","destinationSupply","premium","lowCharge","referenceEuros","payout","fee","optionLeadDays","readyLeadDays","responseHour","responseWeekday"]
roads={(r["from"],r["to"]):r for r in json.loads((ROOT/"docs/map.json").read_text())["roads"]}
sources={}
for week in data["weeks"]:
    events=json.loads((ROOT/f'runs/{week["worldId"]}.events.json').read_text())
    requests={e["request"]["id"]:e["request"] for e in events if e["kind"]=="price_request"}
    options={e["order"]["id"]:e["order"]["option"] for e in events if e["kind"]=="order_won"}
    drivers=json.loads((ROOT/f'runs/{week["worldId"]}.drivers.json').read_text())
    sources[week["worldId"]]=(requests,options,drivers)
rows=[]
for row in data["rows"]:
    requests,options,drivers=sources[row["worldId"]]
    request=requests[row["orderId"]]
    option=next(o for o in request["options"] if o["kind"]==options[row["orderId"]])
    leg=request["legs"][0]; car=leg["car"]; at=request["respondBy"]
    supply=lambda place:sum(1 if roads[d["homePlaceId"],place]["km"]<=35 else .35 if roads[d["homePlaceId"],place]["km"]<=70 else 0 for d in drivers if not car["premium"] or d["rating"]>=4.8 and d["completedGigs"]>=50)
    x=[row["x"][0],roads[leg["pickup"]["placeId"],leg["delivery"]["placeId"]]["minutes"]/60,supply(leg["pickup"]["placeId"]),supply(leg["delivery"]["placeId"]),int(car["premium"]),int(car["electric"] and (car.get("chargePercent") or 0)<30),request["referenceFeeCents"]/100,row["x"][12],row["x"][13],(option["deadline"]-at)/1440,(leg["pickup"]["window"]["from"]-at)/1440,at%1440/60,at//1440%7]
    rows.append({**row,"x":x})
train_seeds=set(saved["split"]["train"])
models={}; scores={}; fixtures=[]
for target in ["booking120","dropped","late"]:
    labeled=[r for r in rows if r[target] is not None]
    x=np.array([r["x"] for r in labeled]); y=np.array([r[target] for r in labeled])
    train=np.array([r["seed"] in train_seeds for r in labeled])
    counts=Counter(r["seed"] for r in labeled)
    weights=np.array([1/counts[r["seed"]] for r in labeled]);weights/=weights[train].mean()
    scaler=StandardScaler().fit(x[train])
    model=LogisticRegression(C=.2,max_iter=1000).fit(scaler.transform(x[train]),y[train],sample_weight=weights[train])
    models[target]={"mean":scaler.mean_.tolist(),"scale":scaler.scale_.tolist(),"coefficients":model.coef_[0].tolist(),"intercept":float(model.intercept_[0])}
    pooled=float(np.average(y[train],weights=weights[train]))
    p=model.predict_proba(scaler.transform(x))[:,1]
    by_week=[]
    for seed in saved["split"]["test"]:
        use=np.array([r["seed"]==seed for r in labeled])
        if use.any():by_week.append({"seed":seed,"orders":int(use.sum()),"pooledBrier":float(brier_score_loss(y[use],np.full(use.sum(),pooled))),"logisticBrier":float(brier_score_loss(y[use],p[use]))})
    scores[target]={"labeled":len(labeled),"censored":len(rows)-len(labeled),"meanWeekPooledBrier":float(np.mean([r["pooledBrier"] for r in by_week])),"meanWeekLogisticBrier":float(np.mean([r["logisticBrier"] for r in by_week])),"weeks":by_week}
    fixtures.extend({"target":target,"x":x[i].tolist(),"probability":float(p[i])} for i in range(0,len(x),max(1,len(x)//10)))
prior={"version":1,"featureNames":names,"models":models,"trainingSeeds":sorted(train_seeds),"dataSha256":saved["dataSha256"],"sklearnVersion":sklearn.__version__,"limitations":["Accepted-work associations; no causal payment response is fitted.","Chosen option identifies the conditional training target; all inference features use the original public request and its known response time.","No open-order count, hidden readiness, final deadline, reveal field or future event enters predictors.","Manual-licence supply is not included in these priors; live feasibility still enforces licences.","Model-test weeks are familiar development data, not policy validation."]}
(ROOT/"experiments/portfolio-prior.json").write_text(json.dumps(prior,indent=2)+"\n")
(ROOT/"docs/portfolio-prior-check.json").write_text(json.dumps({"role":"pre-quote descriptive model comparison only","split":saved["split"],"sourceWeeks":saved["sourceWeeks"],"scores":scores,"fixtures":fixtures,"limitations":prior["limitations"]},indent=2)+"\n")
print(json.dumps({k:{a:b for a,b in v.items() if a!="weeks"} for k,v in scores.items()},indent=2))
