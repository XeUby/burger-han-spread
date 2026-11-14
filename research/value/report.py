"""Audit every planned week and retain failures before comparing policies."""

import hashlib
import json
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from scipy.stats import beta, t

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "analysis"))
from frontier_validation import load_world


def paired(values):
    x = np.asarray(values, dtype=float)/100
    mean = float(x.mean())
    if len(x) < 2:
        return {"pairs": len(x), "meanEuros": mean, "t95Euros": None, "bootstrap95Euros": None}
    width = float(t.ppf(.975,len(x)-1)*x.std(ddof=1)/np.sqrt(len(x)))
    rng = np.random.default_rng(20261114)
    boot = x[rng.integers(0,len(x),(100000,len(x)))].mean(axis=1)
    return {"pairs": len(x), "meanEuros": mean, "standardDeviationEuros": float(x.std(ddof=1)), "t95Euros": [mean-width,mean+width], "bootstrap95Euros": np.quantile(boot,[.025,.975]).tolist(), "differencesEuros": x.tolist(), "wins": int((x>0).sum()), "losses": int((x<0).sum())}


def summarize(rows):
    n=len(rows)
    wins=sum(r["score"]["ranked"] for r in rows)
    orders=sum(r["score"]["wonOrders"] for r in rows)
    return {"weeks": n, "meanProfitEuros": statistics.mean(r["score"]["marginCents"] for r in rows)/100, "qualified": wins, "qualificationLower95": float(beta.ppf(.05,wins,n-wins+1)) if wins else 0, "meanOrders": orders/n, "aggregateOnTime": sum(r["score"]["onTimeOrders"] for r in rows)/orders if orders else 0, "minimumOnTime": min(r["score"]["onTimeShare"] for r in rows), "meanDriverPaymentsEuros": -sum(r["ledger"].get("driver_fee",0) for r in rows)/n/100, "meanRefundsEuros": -sum(r["ledger"].get("late_refund",0) for r in rows)/n/100, "undelivered": sum(r["score"]["undeliveredOrders"] for r in rows), "failedVisits": sum(r["failedVisits"] for r in rows), "actionErrors": sum(len(r["actionErrors"]) for r in rows), "recoveries": sum(len(r["recoveries"]) for r in rows), "finesEuros": -sum(r["ledger"].get("fine",0) for r in rows)/100, "mechanisms": dict(sum((Counter(r["mechanisms"]) for r in rows),Counter()))}


def probes(world, decisions, events, snapshot):
    rows=[]
    for d in decisions:
        if d["kind"] != "payment_randomized":
            continue
        result=next((r for r in decisions if r["kind"]=="action_result" and r["at"]==d["at"] and r["action"]["type"]=="post" and r["action"]["stops"][0]["orderId"]==d["orderId"]),None)
        gig=result["result"]["id"] if result and result["result"] and result["result"].get("ok") else None
        booking=next((e for e in events if e["kind"]=="gig_booked" and e["gigId"]==gig),None)
        cancellation=next((e for e in events if e["kind"]=="order_cancelled" and e["orderId"]==d["orderId"]),None)
        closed=[{"at":snapshot["endsAt"],"reason":"week_end"}]
        if cancellation:closed.append({"at":cancellation["at"],"reason":"cancelled"})
        closed.extend({"at":e["at"],"reason":"expired"} for e in events if e["kind"]=="gig_expired" and e["gigId"]==gig)
        closed.extend({"at":r["at"],"reason":"withdrawn"} for r in decisions if r["kind"]=="action_result" and r["action"]["type"]=="withdraw" and r["action"]["gigId"]==gig and r["result"] and r["result"].get("ok"))
        close=min(closed,key=lambda r:r["at"])
        observed=close["at"]-d["at"]
        row={**d,"worldId":world,"gigId":gig,"postResult":result["result"] if result else None,"bookingDelay":booking["at"]-d["at"] if booking else None,"booking120":None if not gig or not booking and observed<120 else int(bool(booking and booking["at"]<=d["at"]+120)),"observedMinutes":observed,"closedBy":close["reason"],"cancelled":bool(cancellation),"firstGigDropped":any(e["kind"] in ["gig_dropped","no_show"] and e["gigId"]==gig for e in events),"firstGigDriverPaymentsCents":-sum(e["line"]["cents"] for e in events if e["kind"]=="ledger" and e["line"]["kind"]=="driver_fee" and e["line"].get("gigId")==gig)}
        rows.append(row)
    return rows


def main():
    plan_path=ROOT/(sys.argv[1] if len(sys.argv)>1 else "experiments/value-development-v1.json")
    plan=json.loads(plan_path.read_text())
    prefix="value-"+plan_path.stem.rsplit("-",1)[-1]+"-"
    output="value-development" if plan_path.stem.endswith("v1") else plan_path.stem
    for path,expected in plan["files"].items():
        assert hashlib.sha256((ROOT/plan["bundle"]/path).read_bytes()).hexdigest()==expected, path
    source_hash=hashlib.sha256()
    for path in sorted((ROOT/plan["bundle"]/"src").glob("*.ts")):
        source_hash.update(path.name.encode());source_hash.update(path.read_bytes())
    revision=source_hash.hexdigest()
    attempts=[json.loads(line) for line in (ROOT/plan["attempts"]).read_text().splitlines() if line]
    key=lambda row:(row["level"],row["seed"],row["label"])
    expected={key(r):r for r in plan["trials"]}
    created={}
    for event in attempts:
        if event["event"]=="created":
            assert key(event) in expected and key(event) not in created, "Unknown or repeated trial"
            created[key(event)]=event
    records=[]; intervention=[]
    extras={"firstOptionOnly":False,"openingCostAdmission":False,"actionGuard":False,"capacityValue":False,"routeValue":False,"driverValue":False,"paymentProbe":False,"randomSeed":1}
    base=json.loads((ROOT/"experiments/final-config.json").read_text())
    for k,trial in expected.items():
        start=created.get(k)
        row={"level":trial["level"],"seed":trial["seed"],"label":trial["label"],"status":"pending"}
        if start:
            world=start["worldId"]; row["worldId"]=world
            row["runtimeFailures"]=[a for a in attempts if a["event"]=="failed" and a.get("worldId")==world]
            row["status"]="failed" if row["runtimeFailures"] else "running"
            if any(a["event"]=="completed" and a.get("worldId")==world for a in attempts):
                result=load_world(ROOT,world,trial["seed"],{"revision":revision,"settings":{**base,**extras,**trial["settings"]}})
                read=lambda kind:json.loads((ROOT/f"runs/{world}.{kind}.json").read_text())
                events=read("events"); decisions=read("decisions"); snapshot=read("snapshot")
                ledger=Counter()
                for e in events:
                    if e["kind"]=="ledger": ledger[e["line"]["kind"]]+=e["line"]["cents"]
                assert sum(ledger.values())==result["marginCents"]
                row.update(status="complete",score={k:v for k,v in result.items() if k in ["marginCents","revenueCents","wonOrders","onTimeOrders","onTimeShare","undeliveredOrders","ranked"]},ledger=dict(ledger),failedVisits=sum(e["kind"]=="visit_failed" for e in events),actionErrors=read("errors"),recoveries=read("recoveries"),mechanisms=dict(Counter(d["kind"] for d in decisions)),artifactHashes={kind:hashlib.sha256((ROOT/f"runs/{world}.{kind}.json").read_bytes()).hexdigest() for kind in ["meta","events","snapshot","score","errors","recoveries","decisions"]})
                row["errorContexts"]=[{"error":error,"events":[e for e in events if e["at"]==error["at"] and e.get("gigId")==error["action"].get("gigId")]} for error in row["actionErrors"]]
                row["routeOutcomes"]={"joined":sum(d["kind"]=="route_joined" for d in decisions),"fallback":sum(d["kind"]=="route_fallback" for d in decisions),"quotesWithCredit":sum(d["kind"]=="quote_value" and d["credit"]>0 for d in decisions),"predictedCreditCents":sum(d.get("credit",0) for d in decisions if d["kind"]=="quote_value"),"requestedOpeningSavingCents":sum(d["openingSaving"] for d in decisions if d["kind"]=="route_joined")}
                row["returnOfferOutcomes"]=[{**d,"answer":next((e for e in events if e["kind"]=="offer_answered" and e["at"]>=d["at"] and e["gigId"]==d["action"]["gigId"] and e["driverId"]==d["action"]["driverId"]),None)} for d in decisions if d["kind"]=="return_offer"]
                row["chargingRisks"]=[d for d in decisions if d["kind"]=="booked_charge_risk"]
                row["fines"]=[e for e in events if e["kind"]=="ledger" and e["line"]["kind"]=="fine"]
                if trial["label"].endswith("payment-probe"):
                    intervention.extend(probes(world,decisions,events,snapshot))
        records.append(row)
    terminal=all(r["status"]=="complete" for r in records) and not any(a["event"]=="failed" for a in attempts)
    report={"generatedAt":datetime.now(timezone.utc).isoformat(),"role":"development only, no confirmatory multiplicity-adjusted claims","planSha256":hashlib.sha256(plan_path.read_bytes()).hexdigest(),"policyRevision":revision,"terminal":terminal,"completed":sum(r["status"]=="complete" for r in records),"expected":len(records),"uniqueSeedBlocks":len({r["seed"] for r in records}),"records":records,"summary":{},"contrasts":{},"selectedForValidation":None}
    archived={"09":"wccca731d04dbfacbaba0","10":"w7b412da927edcef0081e","14":"w2464fa0a1a5ce6878d47","15":"w657d3e2075cdc8dcb443"}
    replications=[]
    for row in records:
        if row["status"]=="complete" and row["label"]==prefix+"benchmark":
            old=archived[row["seed"].split("-")[-1]]
            before=(ROOT/f"runs/{old}.events.json").read_bytes()
            after=(ROOT/f'runs/{row["worldId"]}.events.json').read_bytes()
            replications.append({"seed":row["seed"],"archivedWorld":old,"newWorld":row["worldId"],"identicalEvents":before==after,"identicalScore":json.loads((ROOT/f"runs/{old}.score.json").read_text())==json.loads((ROOT/f'runs/{row["worldId"]}.score.json').read_text())})
    report["benchmarkReplications"]=replications
    if terminal:
        for level in sorted({r["level"] for r in records}):
            per_level=[r for r in records if r["level"]==level and not r["label"].endswith("payment-probe")]
            labels=sorted({r["label"] for r in per_level})
            by_arm={label.removeprefix(prefix):[r for r in per_level if r["label"]==label] for label in labels}
            control={r["seed"]:r for r in by_arm["mechanisms"]}
            level_summary={}
            for arm,rows in by_arm.items():
                value=summarize(rows)
                value["versusMechanisms"]=paired([r["score"]["marginCents"]-control[r["seed"]]["score"]["marginCents"] for r in rows])
                kinds=set().union(*(r["ledger"] for r in rows),*(r["ledger"] for r in control.values()))
                value["meanLedgerDifferenceEuros"]={kind:statistics.mean(r["ledger"].get(kind,0)-control[r["seed"]]["ledger"].get(kind,0) for r in rows)/100 for kind in sorted(kinds)}
                assert abs(sum(value["meanLedgerDifferenceEuros"].values())-value["versusMechanisms"]["meanEuros"])<1e-6
                value["developmentGatePassed"]=level==8 and arm not in ["benchmark","mechanisms"] and value["versusMechanisms"]["meanEuros"]>=1500 and value["qualified"]==value["weeks"] and value["minimumOnTime"]>=.92 and value["aggregateOnTime"]>=summarize(list(control.values()))["aggregateOnTime"]-.005 and value["undelivered"]==value["failedVisits"]==0
                if level==8:
                    raw={r["seed"]:r for r in by_arm["benchmark"]}
                    value["versusBenchmark"]=paired([r["score"]["marginCents"]-raw[r["seed"]]["score"]["marginCents"] for r in rows])
                    value["developmentGatePassed"] &= value["versusBenchmark"]["meanEuros"]>=1500
                level_summary[arm]=value
            report["summary"][str(level)]=level_summary
            if level==8:
                indexed={arm:{r["seed"]:r["score"]["marginCents"] for r in rows} for arm,rows in by_arm.items()}
                seeds=sorted(control)
                report["contrasts"]["capacityRouteInteraction"]=paired([indexed["capacity-routes"][s]-indexed["capacity"][s]-indexed["routes"][s]+indexed["mechanisms"][s] for s in seeds])
                report["contrasts"]["driverOfferIncrement"]=paired([indexed["combined"][s]-indexed["capacity-routes"][s] for s in seeds])
        passing=[(a,v) for a,v in report["summary"]["8"].items() if v["developmentGatePassed"]]
        if passing and len(replications)==4 and all(r["identicalEvents"] and r["identicalScore"] for r in replications):
            report["selectedForValidation"]=max(passing,key=lambda av:av[1]["versusMechanisms"]["meanEuros"])[0]
    report["limitations"]=["Familiar development seeds, four independent blocks atlevel8 and two atlevels1/4; cross-level trials share blocks.","Intervals are descriptive and unstable with2or4 observations; bootstrap cannot reveal unseen tails.","Exact qualification bounds assume IID weeks. Four successes provide only47.3% lower confidence, two only22.4%.","No panel here supports a promotion, rank claim or global optimum."]
    (ROOT/f"docs/{output}-results.json").write_text(json.dumps(report,indent=2)+"\n")
    payment={"scope":"Bounded randomized development interventions, sequential interference within two seed blocks; descriptive outcomes only", "rows":intervention,"summary":{str(m):{"assigned":sum(r["multiplier"]==m for r in intervention),"observed120":sum(r["multiplier"]==m and r["booking120"] is not None for r in intervention),"booked120":sum(r["multiplier"]==m and r["booking120"]==1 for r in intervention)} for m in [.92,1,1.08]}}
    payment_path="value-payment-probes.json" if output=="value-development" else output+"-payment-probes.json"
    (ROOT/"docs"/payment_path).write_text(json.dumps(payment,indent=2)+"\n")
    print(json.dumps({"terminal":terminal,"completed":report["completed"],"expected":len(records),"selectedForValidation":report["selectedForValidation"],"summary":{level:{arm:{k:v for k,v in row.items() if k in ["meanProfitEuros","qualified","weeks","minimumOnTime","versusMechanisms","developmentGatePassed"]} for arm,row in values.items()} for level,values in report["summary"].items()}},indent=2))


if __name__=="__main__":
    main()
