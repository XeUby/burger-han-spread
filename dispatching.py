"""Fee policy, separated so another teammate can improve dispatch independently."""
def fee_schedule(now, reference_fee, cars, total_cars, urgent, level, policy):
    fee = reference_fee * cars / total_cars
    multiplier = max(policy.fee_multiplier, 1.8) if urgent else policy.fee_multiplier
    steps = [(0, multiplier)]
    if level >= 2:
        steps += [(60, multiplier + .15), (120, multiplier + .3)]
    return [{'at': now + offset, 'feeCents': max(1, round(fee * factor))} for offset, factor in steps]
