import json, math, numpy as np, sys, collections
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import roc_auc_score
sys.stdout.reconfigure(encoding="utf-8")
R=[json.loads(l) for l in open("cost.jsonl")]
def f(r):
    s=max(1,min(72,r["slack"]))
    u=r["unbooked"]/(r["sup"]*0.08+2); c=r["load"]/(r["sup"]*0.35+1)
    return [math.log(max(1,r["km"])), math.log(s), math.log(r["sup"]+1), math.log(r["supd"]+1), u, c, u*u, float(r["option"]=="same_day"), float(r["option"]=="within_3_days"), float(r["weekday"]==4), float(r["hour"]>=15), float(r["premium"]), math.log(max(1,r["km"]))*math.log(s)]
names=["log km","log slack","log sup","log supd","unbooked/limit","load/limit","(unbooked/limit)^2","same_day","3_days","friday","won after 15","premium","log km*log slack"]
X=np.array([f(r) for r in R]); ws=sorted({r["w"] for r in R}); test={w for i,w in enumerate(ws) if i%5==0}; tr=np.array([r["w"] not in test for r in R])
y=np.array([(r["fee"]+r["other"])/r["ref"] for r in R]); late=np.array([r["late"] for r in R]); refund=np.array([r["refund"]/r["price"] for r in R])
lin=LinearRegression().fit(X[tr],y[tr]); pred=lin.predict(X[~tr])
print("fee/ref: R2 test",round(1-((pred-y[~tr])**2).mean()/y[~tr].var(),3),"mean",round(y.mean(),3))
for n_,c in zip(names,lin.coef_): print(f"   {n_:22s} {c:+.4f}")
print("   intercept",round(lin.intercept_,4))
lg=LogisticRegression(C=1,max_iter=3000).fit(X[tr],late[tr]); p=lg.predict_proba(X[~tr])[:,1]
print("late: auc",round(roc_auc_score(late[~tr],p),3),"base",round(late.mean(),4))
for n_,c in zip(names,lg.coef_[0]): print(f"   {n_:22s} {c:+.4f}")
print("   intercept",round(lg.intercept_[0],4))
print("refund share given late",round(refund[late].mean(),3))
# effect of unbooked/limit bins
b=collections.defaultdict(list)
for r,x in zip(R,X): b[min(3,int(x[4]*2))/2].append(r)
for k in sorted(b): g=b[k]; print("unbooked/limit",k,"n",len(g),"late",round(sum(r['late'] for r in g)/len(g),3),"fee/ref",round(sum((r['fee'])/r['ref'] for r in g)/len(g),3))
json.dump({"names":names,"fee":{"coef":list(lin.coef_),"intercept":lin.intercept_},"late":{"coef":list(lg.coef_[0]),"intercept":lg.intercept_[0]},"refundShare":float(refund[late].mean())},open("cost_model.json","w"),indent=1)
