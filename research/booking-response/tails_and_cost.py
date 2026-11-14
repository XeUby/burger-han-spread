"""Challenge tail and additive cost models using the existing whole-seed split."""

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_pinball_loss

ROOT=Path(__file__).resolve().parents[2]


def main():
    data=json.loads((ROOT/"runs/booking-response-data.json").read_text())
    prior=json.loads((ROOT/"docs/booking-response-models.json").read_text())
    train_seeds=set(prior["split"]["train"])
    rows_by_world=defaultdict(dict)
    for row in data["rows"]:
        rows_by_world[row["worldId"]][row["orderId"]]=row
    groups=[];tail=[];audit=[]
    for week in data["weeks"]:
        world=week["worldId"]
        rows=rows_by_world[world]
        snapshot=json.loads((ROOT/f"runs/{world}.snapshot.json").read_text())
        events=json.loads((ROOT/f"runs/{world}.events.json").read_text())
        orders={o["id"]:o for o in snapshot["orders"]}
        members={g["id"]:set(s["orderId"] for s in g["stops"]) for g in snapshot["gigs"]}
        for e in events:
            if e["kind"]=="order_cancelled":
                for gig in e["gigs"]:members.setdefault(gig["gigId"],set()).add(e["orderId"])
        parent={oid:oid for oid in orders}
        def find(oid):
            while parent[oid]!=oid:
                parent[oid]=parent[parent[oid]];oid=parent[oid]
            return oid
        for ids in members.values():
            ids=list(ids)
            for oid in ids[1:]:parent[find(oid)]=find(ids[0])
        cost=Counter();unassigned=0
        for e in events:
            if e["kind"]!="ledger" or e["line"]["kind"]=="revenue":continue
            line=e["line"]
            oid=line.get("orderId") or next(iter(members.get(line.get("gigId"),set())),None)
            if oid is None:unassigned-=line["cents"]
            else:cost[find(oid)]-=line["cents"]
        clusters=defaultdict(list)
        for oid in orders:clusters[find(oid)].append(oid)
        included=excluded=0
        for key,ids in clusters.items():
            if any(oid not in rows for oid in ids):excluded+=cost[key];continue
            features=[rows[oid]["x"] for oid in ids]
            groups.append({"seed":week["seed"],"x":features,"costEuros":cost[key]/100,"referenceEuros":sum(x[10] for x in features)})
            included+=cost[key]
        for oid,order in orders.items():
            if oid not in rows or order["status"]=="cancelled" or any(at is None for at in order["deliveredAt"]):continue
            deadlines=[min(order["deadline"],leg["delivery"]["window"]["to"]+30) if leg["delivery"]["privateAddress"] else order["deadline"] for leg in order["legs"]]
            late=max(0,max(at-due for at,due in zip(order["deliveredAt"],deadlines)))
            tail.append({**rows[oid],"latenessHours":late/60})
        assert included+excluded+unassigned==-sum(e["line"]["cents"] for e in events if e["kind"]=="ledger" and e["line"]["kind"]!="revenue")
        audit.append({"seed":week["seed"],"worldId":world,"includedCostCents":included,"excludedCostCents":excluded,"unassignedCostCents":unassigned})
    train=np.array([g["seed"] in train_seeds for g in groups])
    scaler=StandardScaler().fit(np.array([x for g in groups if g["seed"] in train_seeds for x in g["x"]]))
    # Sum independent award-time predictions; shared fees supervise only the total group loss.
    x=np.array([np.r_[len(g["x"]),scaler.transform(g["x"]).sum(axis=0)] for g in groups])
    y=np.array([g["costEuros"] for g in groups]);reference=np.array([g["referenceEuros"] for g in groups])
    counts=Counter(g["seed"] for g in groups)
    weights=np.array([1/counts[g["seed"]] for g in groups]);weights/=weights[train].mean()
    scalar=float(np.sum(weights[train]*reference[train]*y[train])/np.sum(weights[train]*reference[train]**2))
    ridge=Ridge(alpha=100,fit_intercept=False).fit(x[train],y[train],sample_weight=weights[train])
    predictions={"scalar":reference[~train]*scalar,"additiveRidge":x[~train]@ridge.coef_}
    held=[g for g in groups if g["seed"] not in train_seeds]
    cost_scores={}
    for name,pred in predictions.items():
        per_week=[]
        for seed in sorted(set(prior["split"]["test"])):
            mask=np.array([g["seed"]==seed for g in held])
            if mask.any():per_week.append({"seed":seed,"groupRmseEuros":float(np.sqrt(np.mean((pred[mask]-y[~train][mask])**2))),"totalErrorEuros":float(np.sum(pred[mask]-y[~train][mask]))})
        cost_scores[name]={"meanWeekGroupRmseEuros":float(np.mean([r["groupRmseEuros"] for r in per_week])),"weeks":per_week}
    tx=np.array([r["x"] for r in tail]);ty=np.array([r["latenessHours"] for r in tail]);tr=np.array([r["seed"] in train_seeds for r in tail])
    tail_counts=Counter(r["seed"] for r in tail);tw=np.array([1/tail_counts[r["seed"]] for r in tail]);tw/=tw[tr].mean()
    tail_scores={}
    for q in [.95,.99]:
        ordered=np.argsort(ty[tr]);values=ty[tr][ordered];w=tw[tr][ordered]
        constant=float(values[np.searchsorted(np.cumsum(w),q*w.sum())])
        model=HistGradientBoostingRegressor(loss="quantile",quantile=q,max_iter=60,max_leaf_nodes=7,min_samples_leaf=80,l2_regularization=10,early_stopping=False,random_state=1701).fit(tx[tr],ty[tr],sample_weight=tw[tr])
        scores={}
        for name,pred in {"pooled":np.full((~tr).sum(),constant),"boosted":np.maximum(0,model.predict(tx[~tr]))}.items():
            per_week=[];held_tail=[r for r in tail if r["seed"] not in train_seeds]
            for seed in prior["split"]["test"]:
                mask=np.array([r["seed"]==seed for r in held_tail])
                if mask.any():per_week.append({"seed":seed,"pinballHours":float(mean_pinball_loss(ty[~tr][mask],pred[mask],alpha=q)),"coverage":float(np.mean(ty[~tr][mask]<=pred[mask]))})
            scores[name]={"meanWeekPinballHours":float(np.mean([r["pinballHours"] for r in per_week])),"meanWeekCoverage":float(np.mean([r["coverage"] for r in per_week])),"weeks":per_week}
        tail_scores[str(q)]=scores
    report={"role":"Supplemental development prediction study, not used in frozen v1/v2 policies","split":prior["split"],"costGroups":len(groups),"tailOrders":len(tail),"cost":cost_scores,"deliveryTails":tail_scores,"costAudit":audit,"limitations":["Shared route fees are assigned once to connected order groups; no arbitrary per-order fee labels. Additive model predictions are computed separately from each order's public award-time features and then summed for scoring.","Costs include actual refunds, fines and penalties; grouping is a target constraint, not a live feature.","Lateness is raw clock hours relative to final public deadlines, not business-day refund tiers. Cancelled/undelivered tail outcomes are excluded, not mislabeled as timely; qualification audit retains undelivered orders separately.","Historical policies lack action overlap. Better predictive scores cannot establish the value of different acceptance or payments.","No model search after reading the19test weeks; these remain development evidence and all model results are retained."]}
    (ROOT/"docs/booking-cost-and-tail-models.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"groups":len(groups),"tailOrders":len(tail),"cost":{k:v["meanWeekGroupRmseEuros"] for k,v in cost_scores.items()},"tails":{q:{k:{a:b for a,b in v.items() if a!="weeks"} for k,v in scores.items()} for q,scores in tail_scores.items()}}))


if __name__=="__main__":main()
