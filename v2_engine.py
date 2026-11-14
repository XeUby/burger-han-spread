"""Isolated experimental pricing and fees for Burger Han V2. No hidden simulator data."""
from __future__ import annotations
from dataclasses import dataclass
from math import ceil
from typing import Any
DECLINE = 100_000_000

@dataclass(frozen=True)
class V2Config:
    price_multiplier: float = 1.50
    fee_multiplier: float = 1.28
    max_drive_minutes: int = 600
    min_nearby_drivers: int = 1
    nearby_radius_minutes: int = 100
    max_open: int = 240
    min_slack_minutes: int = 105
    minimum_margin_cents: int = 1800
    safety_fee_buffer: float = .48
    max_price_multiplier: float = 2.15

def _distance(roads: dict, origin: str, destination: str) -> int:
    road = roads.get((origin, destination))
    return int(road['minutes']) if road else 10**8

def _has_unambiguous_note(note: Any) -> bool:
    if note is None or note == '' or note == {}: return True
    if isinstance(note, dict) and not str(note.get('text', '')).strip(): return True
    return False

def quote_v2(request: dict, now: int, roads: dict, drivers: list, orders: dict, config: V2Config) -> dict[str,int]:
    options=request.get('options') or []
    if not options: return {}
    decline={options[0]['kind']:DECLINE}
    if not _has_unambiguous_note(request.get('note')): return decline
    legs=request.get('legs') or []
    if len(legs)!=1: return decline
    leg=legs[0]
    pickup,delivery=leg['pickup'],leg['delivery']
    if pickup.get('privateAddress') or delivery.get('privateAddress'): return decline
    start,dest=pickup['placeId'],delivery['placeId']
    driving=_distance(roads,start,dest)
    if driving>config.max_drive_minutes: return decline
    car=leg.get('car',{})
    eligible=[d for d in drivers if (not car.get('premium') or (d.get('rating',0)>=4.8 and d.get('completedGigs',0)>=50))]
    nearby=sum(_distance(roads,d['homePlaceId'],start)<=config.nearby_radius_minutes for d in eligible)
    if nearby<config.min_nearby_drivers: return decline
    outstanding=[o for o in orders.values() if any(t is None for t in o.get('deliveredAt',[]))]
    if len(outstanding)>=config.max_open: return decline
    request_fee=int(request['referenceFeeCents'])
    result={}
    for option in options:
        ready=max(now,int(pickup['window']['from']))
        deadline=int(option['deadline'])
        slack=deadline-ready-driving
        if car.get('electric') and car.get('chargePercent') is not None and car['chargePercent']<30: slack-=40
        if slack<config.min_slack_minutes: continue
        scarcity=.10 if nearby==1 else .04 if nearby==2 else 0.0
        urgency=.07 if slack<210 else 0.0
        multiplier=min(config.max_price_multiplier,config.price_multiplier+scarcity+urgency)
        fee_provision=request_fee*(config.fee_multiplier+config.safety_fee_buffer)
        floor=ceil(fee_provision+config.minimum_margin_cents)
        result[option['kind']]=max(1,ceil(option['listPriceCents']*multiplier),floor)
    return result or decline

def fee_schedule_v2(now:int,reference_fee:int,cars:int,total_cars:int,urgent:bool,level:int,config:V2Config)->list[dict]:
    base=reference_fee*cars/max(1,total_cars)
    if urgent: factors=[(0,1.75),(25,2.05),(50,2.30)]
    else: factors=[(0,config.fee_multiplier),(30,config.fee_multiplier+.12),(80,config.fee_multiplier+.27)]
    if level<=1: factors=factors[:1]
    return [{'at':now+t,'feeCents':max(1,ceil(base*f))} for t,f in factors]

def evaluate_scores(scores:list[dict],target_total:int=100_000)->dict:
    euros=[float(s['marginCents'])/100 for s in scores]
    valid=[bool(s.get('ranked')) and s.get('wonOrders',0)>0 and s.get('onTimeShare',0)>=.9 for s in scores]
    return {'weeks':len(scores),'all_ranked':bool(scores) and all(valid),
      'total_margin_eur':round(sum(euros),2),
      'average_margin_eur':round(sum(euros)/len(euros),2) if euros else 0,
      'qualifying_weeks':sum(valid),
      'target_100k_reached':len(scores)==5 and all(valid) and sum(euros)>=target_total}
