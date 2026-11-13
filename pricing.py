"""Order selection and quotes. Pure policy, no network calls or credentials."""
from dataclasses import dataclass, asdict
from note_filter import is_safe_note

@dataclass
class Policy:
    # Config F (docs/experiments/2026-11-13-capacity-sweep.md): the open-order cap of 16
    # was the binding limit; delivery capacity is now the constraint to guard.
    price_multiplier: float = 1.45
    fee_multiplier: float = 1.25
    max_drive_minutes: int = 300
    min_local_drivers: int = 1
    max_open_orders: int = 10_000
    allow_notes: bool = False  # True ignores notes entirely; False still accepts safe notes
    margin_floor_cents: int = 1000

    def to_dict(self):
        return asdict(self)

def prices_for(request, now, roads, drivers, orders, policy):
    options = request['options']
    decline = {options[0]['kind']: 100_000_000}
    # Decline notes that may change the work until the full parser (#3) is integrated.
    if not policy.allow_notes and not is_safe_note(request.get('note')):
        return decline
    if len(request['legs']) != 1:
        return decline
    leg = request['legs'][0]
    pickup, delivery = leg['pickup'], leg['delivery']
    if pickup['privateAddress'] or delivery['privateAddress']:
        return decline
    drive = roads[(pickup['placeId'], delivery['placeId'])]['minutes']
    if drive > policy.max_drive_minutes:
        return decline
    eligible = [d for d in drivers if not leg['car']['premium'] or (d['rating'] >= 4.8 and d['completedGigs'] >= 50)]
    nearby = sum(roads[(d['homePlaceId'], pickup['placeId'])]['minutes'] <= 60 for d in eligible)
    if nearby < policy.min_local_drivers:
        return decline
    open_orders = sum(any(t is None for t in o['deliveredAt']) for o in orders.values())
    if open_orders >= policy.max_open_orders:
        return decline
    result = {}
    for option in options:
        ready = max(now, pickup['window']['from'])
        if option['deadline'] - ready < drive + 240:
            continue
        # Price explicitly funds the planned opening fee and a rescue reserve.
        floor = request['referenceFeeCents'] * (policy.fee_multiplier + .35) + policy.margin_floor_cents
        result[option['kind']] = round(max(option['listPriceCents'] * policy.price_multiplier, floor))
    return result or decline
