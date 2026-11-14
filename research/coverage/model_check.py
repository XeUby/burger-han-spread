import hashlib
import json
import statistics
from pathlib import Path
import numpy as np
from scipy.stats import t
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss

ROOT=Path(__file__).resolve().parents[2]
NAME='coverage-model-check-v1'
def sha(path):return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
def read(path):return json.loads((ROOT/path).read_text())

def fit_fold(x,y,seeds,held):
    train=seeds!=held;test=~train
    assert set(seeds[train]).isdisjoint(set(seeds[test]))
    counts={s:sum(seeds[train]==s) for s in set(seeds[train])}
    weights=np.array([1/counts[s] for s in seeds[train]]);weights*=sum(train)/weights.sum()
    constant=(np.dot(weights,y[train])+1)/(weights.sum()+2)
    scaler=StandardScaler().fit(x[train],sample_weight=weights)
    model=LogisticRegression(C=1,solver='lbfgs',max_iter=2000,random_state=20261114).fit(scaler.transform(x[train]),y[train],sample_weight=weights)
    if model.n_iter_[0]>=2000:raise RuntimeError('Model did not converge')
    return test,np.full(sum(test),constant),model.predict_proba(scaler.transform(x[test]))[:,1],{'trainSeeds':sorted(set(seeds[train])),'testSeed':held,'mean':scaler.mean_.tolist(),'scale':scaler.scale_.tolist(),'coefficients':model.coef_[0].tolist(),'intercept':model.intercept_[0]}

def evaluate(rows,names,heuristic):
    x=np.array([r['x'] for r in rows]);y=np.array([r['y'] for r in rows]);seeds=np.array([r['seed'] for r in rows])
    assert np.isfinite(x).all() and len(set(seeds))==8
    folds=[];predictions=[]
    for held in sorted(set(seeds)):
        test,constant,fitted,model=fit_fold(x,y,seeds,held)
        ys=y[test]
        fold={'seed':held,'n':int(sum(test)),'positive':int(sum(ys)),'fit':model,'scores':{}}
        values={'constant':constant,'logistic':fitted}
        if heuristic:values['existingDemand']=np.array([rows[i]['heuristic'] for i in np.flatnonzero(test)])
        for name,p in values.items():fold['scores'][name]={'brier':float(np.mean((p-ys)**2)),'logLoss':float(log_loss(ys,p,labels=[0,1])),'meanPrediction':float(p.mean()),'observedRate':float(ys.mean())}
        for j,i in enumerate(np.flatnonzero(test)):predictions.append({'id':rows[i]['id'],'seed':held,'target':int(y[i]),'predictions':{name:float(p[j]) for name,p in values.items()}})
        folds.append(fold)
    scores={name:{metric:statistics.mean(f['scores'][name][metric] for f in folds) for metric in ['brier','logLoss']} for name in folds[0]['scores']}
    gains=[f['scores']['constant']['brier']-f['scores']['logistic']['brier'] for f in folds]
    mean=statistics.mean(gains);width=float(t.ppf(.975,7))*statistics.stdev(gains)/8**.5
    gate=mean>=.01 and sum(g>0 for g in gains)>=6 and heuristic and scores['logistic']['brier']<scores['existingDemand']['brier']
    return {'observations':len(rows),'positive':int(sum(y)),'features':names,'scoresEqualWeekWeighted':scores,'folds':folds,'predictions':predictions,'brierGainOverConstant':mean,'descriptiveWeekT95':[mean-width,mean+width],'improvedWeeks':sum(g>0 for g in gains),'existingHeuristicComparable':heuristic,'developmentGatePassed':bool(gate)}

def main():
    protocol=read(f'experiments/{NAME}-protocol.json')
    for file,digest in protocol['files'].items():assert sha(file)==digest,file
    exposures=read('docs/coverage-development-v2-exposures.json')['rows']
    replay={(r['worldId'],r['requestId']):r for r in read('docs/coverage-demand-replay.json')['rows']}
    roads={(r['from'],r['to']):r for r in read('docs/map.json')['roads']}
    rosters={}
    acq=[];booking=[]
    for r in exposures:
        if r['kind']=='acquisition_randomized' and r['arm']!='decline' and r['outcomeKnown']:
            row=replay[r['worldId'],r['requestId']]
            assert row['at']==r['at']
            acq.append({'id':r['worldId']+':'+r['requestId'],'seed':r['seed'],'y':int(r['won']),'heuristic':row['probability'],'x':[r['priceCents']/r['listPriceCents'],r['features']['km']/100,r['supply'],(r['latestStart']-r['at'])/60,r['exposed'],r['delay']/60,r['at']%1440/60]})
        elif r['kind']=='opening_randomized' and r['booking120'] is not None:
            world=r['worldId']
            if world not in rosters:rosters[world]=read(f'runs/{world}.drivers.json')
            action=r['action'];audience=action['audience']
            supply=[]
            for feature in r['features']:
                eligible=[d for d in rosters[world] if (not audience.get('manualLicence') or d['licence']=='manual') and (not audience.get('experienced') or d['rating']>=4.8 and d['completedGigs']>=50)]
                supply.append(sum(1 if roads[d['homePlaceId'],feature['origin']]['km']<=35 else .35 if roads[d['homePlaceId'],feature['origin']]['km']<=70 else 0 for d in eligible))
            booking.append({'id':world+':'+r['gigId'],'seed':r['seed'],'y':r['booking120'],'x':[sum(f['km'] for f in r['features'])/100,r['slack']/60,min(supply),action['schedule'][0]['feeCents']/100,r['multiplier'],r['delay']/60,len(r['orderIds']),max(0,r['at']-action['schedule'][0]['at'])/60]})
    report={'scope':'Fixed-model leave-one-underlying-week-out development diagnostics. No hyperparameter search, promotion, causal policy ranking or new worlds. Same underlying seeds never cross a training/test fold.','protocol':f'experiments/{NAME}-protocol.json','acquisition':evaluate(acq,protocol['acquisitionFeatures'],True),'booking':evaluate(booking,protocol['bookingFeatures'],False),'bookingComparatorLimitation':'Existing portfolio booking prior predicts booking within120minutes from award, whereas these interventions measure120minutes from posting. The full action-conditioned heuristic was not reconstructed; the comparable-heuristic gate is unmet.','costModelLimitation':'First-gig payments and incompletely allocated order ledgers are not full continuation cost. No cost-prediction validation or capacity-value inference is claimed.','decision':'Keep the retained policy and simple baselines unless every predeclared model gate passes. Passing only permits a separately frozen structural experiment; it is not validation of policy economics.'}
    (ROOT/f'docs/{NAME}-results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:{a:v[a] for a in ['observations','positive','scoresEqualWeekWeighted','brierGainOverConstant','improvedWeeks','developmentGatePassed']} for k,v in report.items() if k in ['acquisition','booking']},indent=2))
if __name__=='__main__':main()
