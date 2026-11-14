import hashlib
import itertools
import json
import math
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path
from scipy.stats import t

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from research.value.report import load_world, paired, summarize

NAME = 'coverage-development-v2'
def read(path): return json.loads((ROOT / path).read_text())
def digest(path): return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
def interval(values):
    if len(values) < 2: return None
    mean = statistics.mean(values)
    width = float(t.ppf(.975,len(values)-1))*statistics.stdev(values)/len(values)**.5
    return [mean-width,mean+width]

def exposures(decisions, events, ended, complete, fee=None):
    rows=[]
    for i,d in enumerate(decisions):
        if d['kind'] not in ['acquisition_randomized','opening_randomized','offer_randomized']: continue
        result=next((e for e in decisions[i+1:] if e['kind']=='action_result' and e['at']==d['at'] and e['action']==d['action']),None)
        reply=result.get('result') if result else None
        row={**d,'actionResult':reply,'completeWeek':complete}
        if d['kind']=='acquisition_randomized':
            request=next((e['request'] for e in events if e['kind']=='price_request' and e['request']['id']==d['requestId'] and e['at']<=d['at']),None)
            if request is not None and fee is not None:
                extra=.18 if d['supply']<20 else .08 if d['supply']<50 else 0
                base=max(2000,math.floor(request['referenceFeeCents']*(fee+extra)+.5))
                choices=[math.ceil(max(d['listPriceCents']*ratio,base*1.35)) for ratio in [1.25,1.5]]
                row['realizedQuoteChoices']=choices
                row['quoteArmsCoincide']=choices[0]==choices[1]
                if d['arm']!='decline':assert d['priceCents']==choices[0 if d['arm']=='quote_125' else 1]
            win=next((e for e in events if e['kind']=='order_won' and e['order']['id']==d['requestId']),None)
            loss=next((e for e in events if e['kind']=='order_lost' and e['requestId']==d['requestId']),None)
            ledger=[e['line'] for e in events if e['kind']=='ledger' and e['line'].get('orderId')==d['requestId']]
            gigs={e['result']['id'] for e in decisions if e['kind']=='action_result' and e['action']['type']=='post' and (e.get('result') or {}).get('ok') and any(stop['orderId']==d['requestId'] for stop in e['action']['stops'])}
            shared=[e['line'] for e in events if e['kind']=='ledger' and e['line'].get('gigId') in gigs and not e['line'].get('orderId') and e['line']['cents']<0]
            row.update(unallocatedRelatedCostsCents=sum(e['cents'] for e in shared),contributionFullyAttributed=not shared,won=bool(win),awardObserved=bool(win or loss),order=win['order'] if win else None,attributedContributionEuros=sum(e['cents'] for e in ledger)/100 if complete else None,attributedLedger=dict(Counter({k:sum(e['cents'] for e in ledger if e['kind']==k) for k in {e['kind'] for e in ledger}})),outcomeKnown=complete)
        elif d['kind']=='opening_randomized':
            opening=d['original']['schedule'][0]['feeCents'] if 'original' in d else None
            if opening is not None:
                cap=d['original']['schedule'][1]['feeCents'] if len(d['original']['schedule'])>1 else math.inf
                choices=[max(1,min(cap,math.floor(opening*m+.5))) for m in [.92,1,1.08]]
                row['realizedOpeningChoices']=choices
                row['openingArmsCoincide']=len(set(choices))<3
                assert d['action']['schedule'][0]['feeCents']==choices[[.92,1,1.08].index(d['multiplier'])]
            gig=reply.get('id') if reply and reply.get('ok') else None
            booking=next((e for e in events if e['kind']=='gig_booked' and e['gigId']==gig),None) if gig else None
            closes=[{'at':ended,'reason':'week_end' if complete else 'interruption'}]
            closes += [{'at':e['at'],'reason':'expired'} for e in events if e['kind']=='gig_expired' and e['gigId']==gig and gig]
            closes += [{'at':e['at'],'reason':'cancelled'} for e in events if e['kind']=='order_cancelled' and len(d['orderIds'])==1 and e['orderId'] in d['orderIds'] and e['at']>=d['at']]
            closes += [{'at':e['at'],'reason':'withdrawn'} for e in decisions[i+1:] if e['kind']=='action_result' and e['action']['type']=='withdraw' and e['action']['gigId']==gig and (e.get('result') or {}).get('ok')]
            close=min(closes,key=lambda e:e['at'])
            followup=max(0,close['at']-d['at'])
            booked=bool(booking and booking['at']<=d['at']+120 and booking['at']<=close['at'])
            known=bool(reply and not reply.get('ok') or gig and (booked or followup>=120 or close['reason'] not in ['week_end','interruption']))
            row.update(gigId=gig,bookingAt=booking['at'] if booking else None,booking120=int(booked) if known else None,outcomeKnown=known,followupMinutes=followup,closedBy=close['reason'],firstGigDropped=any(e['kind'] in ['gig_dropped','no_show'] and e['gigId']==gig for e in events) if gig else None,firstGigDriverPaymentsEuros=-sum(e['line']['cents'] for e in events if e['kind']=='ledger' and e['line']['kind']=='driver_fee' and e['line'].get('gigId')==gig)/100 if gig else None)
        else:
            answer=next((e for e in events if e['kind']=='offer_answered' and e['gigId']==d['action']['gigId'] and e['driverId']==d['action']['driverId'] and e['at']>=d['at']),None)
            known=bool(answer or reply and not reply.get('ok'))
            row.update(answer=answer['answer'] if answer else 'action_failed' if reply and not reply.get('ok') else 'unobserved',answerAt=answer['at'] if answer else None,outcomeKnown=known)
        rows.append(row)
    return rows

def main():
    plan=read(f'experiments/{NAME}.json')
    for file,expected in plan['files'].items(): assert digest(file)==expected,file
    revision=hashlib.sha256()
    for file in sorted((ROOT/plan['bundle']/'src').glob('*.ts')):revision.update(file.name.encode());revision.update(file.read_bytes())
    defaults=json.loads(subprocess.check_output(['node','--input-type=module','-e','const {defaults}=await import(process.argv[1]);console.log(JSON.stringify(defaults))',(ROOT/plan['bundle']/'src/policy.ts').as_uri()],text=True))
    attempts=[json.loads(line) for line in (ROOT/plan['attempts']).read_text().splitlines()]
    archived=read('docs/level8-estimate-v1-results.json')
    references={r['seed']:r for r in archived['records'] if r['label'].endswith('-payments')}
    records=[];all_exposures=[]
    for trial in plan['schedule']['trials']:
        created=next((a for a in attempts if a['event']=='created' and a['case']['trial']['id']==trial['id']),None)
        row={'seed':trial['seed'],'label':trial['id'],'level':8,'delay':trial['settings']['escalationDelay'],'status':'not_started'}
        if not created:records.append(row);continue
        world=created['case']['worldId'];row['worldId']=world
        failures=[a for a in attempts if a['event'] in ['failed','creation_unknown'] and a.get('case',{}).get('trial',{}).get('id')==trial['id']]
        complete=any(a['event']=='completed' and a['case']['worldId']==world for a in attempts)
        row.update(status='complete' if complete else 'failed' if failures else 'running',runtimeFailures=failures)
        kinds=['meta','events','decisions','errors','recoveries','score','snapshot']
        row['artifactHashes']={k:digest(f'runs/{world}.{k}.json') for k in kinds if (ROOT/f'runs/{world}.{k}.json').exists()}
        if 'events' not in row['artifactHashes'] or 'decisions' not in row['artifactHashes']:records.append(row);continue
        events=read(f'runs/{world}.events.json');decisions=read(f'runs/{world}.decisions.json')
        end=read(f'runs/{world}.snapshot.json')['endsAt'] if complete else max([e['at'] for e in events]+[0])
        rows=exposures(decisions,events,end,complete,trial['settings']['fee'])
        all_exposures.extend({**r,'worldId':world,'seed':trial['seed'],'delay':row['delay']} for r in rows)
        row['funnel']=dict(Counter(d['stage'] for d in decisions if d['kind']=='acquisition_funnel'))
        row['assignments']=dict(Counter(r['kind'] for r in rows))
        row['observedOfferActions']=sum(d['kind']=='action_result' and d['action']['type']=='offer' for d in decisions)
        row['observedOfferAnswers']=sum(e['kind']=='offer_answered' for e in events)
        if complete:
            outcome=load_world(ROOT,world,trial['seed'],{'revision':revision.hexdigest(),'settings':{**defaults,**trial['settings']}})
            ledger=Counter()
            for e in events:
                if e['kind']=='ledger':ledger[e['line']['kind']]+=e['line']['cents']
            assert sum(ledger.values())==outcome['marginCents']
            row.update(score={k:outcome[k] for k in ['marginCents','revenueCents','wonOrders','onTimeOrders','onTimeShare','undeliveredOrders','ranked']},ledger=dict(ledger),failedVisits=sum(e['kind']=='visit_failed' for e in events),actionErrors=read(f'runs/{world}.errors.json'),recoveries=read(f'runs/{world}.recoveries.json'),mechanisms=dict(Counter(d['kind'] for d in decisions)),unallocatedLedgerCents=sum(e['line']['cents'] for e in events if e['kind']=='ledger' and not e['line'].get('orderId')))
            ref=references[trial['seed']]
            for kind,expected in ref['artifactHashes'].items():assert digest(f"runs/{ref['worldId']}.{kind}.json")==expected
            row['referenceWorld']=ref['worldId'];row['profitDifferenceEuros']=(row['score']['marginCents']-ref['score']['marginCents'])/100
        records.append(row)
    terminal=all(r['status']=='complete' for r in records)
    report={'scope':'Randomized development coverage; eight familiar underlying weeks. No economic-model validation, architecture validation, promotion or rank claim.','terminal':terminal,'completed':sum(r['status']=='complete' for r in records),'expected':8,'records':records,'summary':{},'support':{},'assignmentContrasts':{},'limitations':['Interventions change later eligibility and interfere within a week. Descriptive conditional assignment contrasts do not add up to whole-policy effects.','Request contribution omits costs without explicit order attribution and does not estimate displaced capacity.','Only targeted offers are randomized; no comparison to sending no offer.','Nominal arms may produce identical prices after floors or clipping.','Four versus four weekly regimes and eight reused development seeds give weak generalization evidence.']}
    groups=[('acquisition_randomized',['decline','quote_125','quote_150'],'arm'),('opening_randomized',[.92,1,1.08],'multiplier'),('offer_randomized',[1,1.08],'multiplier')]
    for kind,arms,key in groups:
        group=[r for r in all_exposures if r['kind']==kind]
        support={str(a):{'assigned':sum(r[key]==a for r in group),'weeks':len({r['seed'] for r in group if r[key]==a}),'observed':sum(r[key]==a and r['outcomeKnown'] for r in group)} for a in arms}
        event_count=sum(r.get('won',False) if kind=='acquisition_randomized' else r.get('booking120')==1 if kind=='opening_randomized' else r.get('answer')=='accepted' for r in group)
        adequate=terminal and all(s['assigned']>=12 and s['weeks']>=3 for s in support.values()) and event_count>=10
        report['support'][kind]={'arms':support,'relevantEvents':event_count,'minimumSupportPassed':adequate,'modelDecision':'Eligible for held-out development model checks; not validated' if adequate else 'Insufficient support; do not fit or extrapolate an action-response model'}
        if not terminal:continue
        metric='attributedContributionEuros' if kind=='acquisition_randomized' else 'booking120' if kind=='opening_randomized' else 'accepted'
        by_week=[]
        for trial in plan['schedule']['trials']:
            week=[r for r in group if r['seed']==trial['seed']]
            scores={}
            for arm in arms:
                selected=[r for r in week if r[key]==arm]
                scores[str(arm)]=None if not week or any(not r['outcomeKnown'] for r in selected) else sum((r[metric] if metric!='accepted' else int(r['answer']=='accepted'))/r['probability'] for r in selected)/len(week)
            by_week.append({'seed':trial['seed'],'eligibleAssignments':len(week),'weightedScores':scores})
        contrasts={}
        for arm in arms[1:]:
            differences=[w['weightedScores'][str(arm)]-w['weightedScores'][str(arms[0])] for w in by_week if w['weightedScores'][str(arm)] is not None and w['weightedScores'][str(arms[0])] is not None]
            contrasts[str(arm)]={'versus':str(arms[0]),'weeks':len(differences),'mean':statistics.mean(differences) if differences else None,'descriptiveT95':interval(differences),'differences':differences}
        report['assignmentContrasts'][kind]={'metric':metric,'unit':'euros per eligible assignment' if metric=='attributedContributionEuros' else 'outcome probability per eligible assignment','perWeek':by_week,'contrasts':contrasts}
    if terminal:
        report['summary']=summarize(records)
        report['versusArchivedCandidate']=paired([round(r['profitDifferenceEuros']*100) for r in records])
        report['weeklyRegimes']={str(delay):summarize([r for r in records if r['delay']==delay]) for delay in [0,60]}
        profits=[r['score']['marginCents']/100 for r in records]
        observed=statistics.mean(profits[i] for i,r in enumerate(records) if r['delay']==60)-statistics.mean(profits[i] for i,r in enumerate(records) if r['delay']==0)
        distribution=[statistics.mean(profits[i] for i in chosen)-statistics.mean(profits[i] for i in range(8) if i not in chosen) for chosen in itertools.combinations(range(8),4)]
        report['weeklyRegimeContrast']={'delayMinusOriginalEuros':observed,'allocations':len(distribution),'sharpNullTwoSidedP':sum(abs(x)>=abs(observed)-1e-9 for x in distribution)/len(distribution),'interpretation':'Exact randomization diagnostic for the eight fixed development weeks under the sharp null; not a generalization or promotion claim.'}
    report['realizedActionSeparation']={kind:{'assigned':sum(r['kind']==kind for r in all_exposures),'reconstructed':sum(r['kind']==kind and key in r for r in all_exposures),'coincidentArms':sum(r['kind']==kind and r.get(key,False) for r in all_exposures)} for kind,key in [('acquisition_randomized','quoteArmsCoincide'),('opening_randomized','openingArmsCoincide')]}
    report['protocolConformant']=False
    report['executionDeviation']={'kind':'batch_interception_gap','observedOfferActions':sum(r.get('observedOfferActions',0) for r in records),'offerAssignments':sum(r['kind']=='offer_randomized' for r in all_exposures),'cause':'Frozen practice loop advances through an external connection, bypassing the dispatcher world proxy for takeActions batches. Direct world.act actions were intercepted; queued batches were not.','impact':'H3 was not executed. H2 assignments cover intercepted direct posts only, not the promised first eligible posts across both paths. H1 and weekly regimes executed, but the package is narrower than planned. Do not claim complete protocol execution or fit an offer response model.','correction':'Current research source adds takeActions interception and a practice-batch-path regression test. Frozen executed bundle remains unchanged; no replacement worlds were launched. Any follow-up will have a separate freeze.'}
    if 'offer_randomized' in report['support']:
        report['support']['offer_randomized']['modelDecision']='Instrumentation failure: no randomized offer evidence despite actual offers. A separately frozen corrected study is required.'
    report['support']['opening_randomized']['scope']='Randomized direct-action posts only; batched post interception was missing. Assess this restricted support before modeling.'
    report['support']['acquisition_randomized']['contributionIncompleteAssignments']=sum(r['kind']=='acquisition_randomized' and not r['contributionFullyAttributed'] for r in all_exposures)
    report['support']['acquisition_randomized']['scope']='Minimum support covers acquisition response, not a complete cost or capacity-value model. Shared unattributed costs and displaced work prevent interpreting attributed request contribution as incremental policy profit.'
    report['decision']='Finish all planned cases before economic decisions' if not terminal else 'Reject this exploratory package as a policy replacement. Preserve the batch-interception deviation; H3 has no randomized evidence. H1 and restricted direct-post H2 data may support held-out simple-model checks, not validation. Repair and separately freeze any further coverage; no automatic rerun.'
    (ROOT/f'docs/{NAME}-results.json').write_text(json.dumps(report,indent=2)+'\n')
    (ROOT/f'docs/{NAME}-exposures.json').write_text(json.dumps({'scope':report['scope'],'rows':all_exposures},indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['terminal','completed','expected','support']},indent=2))

if __name__=='__main__': main()
