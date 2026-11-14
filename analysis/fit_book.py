import json, math, numpy as np, sys
from sklearn.linear_model import LogisticRegression
sys.stdout.reconfigure(encoding="utf-8")
R=[json.loads(l) for l in open("book.jsonl")]
R=[r for r in R if 0.6<=r["m"]<=1.4 and r["slack"]>=3 and r["km"]>0]
def feats(r):
    s=min(r["slack"],72)
    return [math.log(r["m"]), math.log(r["km"]), math.log(r["sup"]+1), math.log(r["supd"]+1), math.log(s), float(r["day"]==4), float(r["day"]==0), float(r["premium"]), float(r["hour"]>=16), math.log(r["m"])*math.log(r["km"])]
names=["log m","log km","log sup","log supd","log slack","friday","monday","premium","late hour","log m x log km"]
X=np.array([feats(r) for r in R]); y=np.array([r["ok"] for r in R])
# hold out whole worlds
ws=sorted({r["w"] for r in R}); test={w for i,w in enumerate(ws) if i%5==0}
tr=np.array([r["w"] not in test for r in R])
m=LogisticRegression(C=1,max_iter=3000).fit(X[tr],y[tr])
p=m.predict_proba(X[~tr])[:,1]
from sklearn.metrics import roc_auc_score, brier_score_loss
print("n",len(R),"auc",round(roc_auc_score(y[~tr],p),3),"brier",round(brier_score_loss(y[~tr],p),4),"base",round(y.mean(),3))
for n_,c in zip(names,m.coef_[0]): print(f"  {n_:16s} {c:+.3f}")
print("  intercept",round(m.intercept_[0],3))
# calibration by decile
o=np.argsort(p); 
for q in range(5):
    idx=o[q*len(o)//5:(q+1)*len(o)//5]; print(f"  quintile {q}: predicted {p[idx].mean():.3f} actual {y[~tr][idx].mean():.3f}")
json.dump({"names":names,"coef":list(m.coef_[0]),"intercept":m.intercept_[0]},open("book_model.json","w"),indent=1)
