import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root=Path(__file__).resolve().parents[2]
path=root/"experiments/value-v2-protocol.json"
if path.exists():
    raise RuntimeError("Never overwrite a frozen protocol")
base=root/"experiments/value-protocol.json"
protocol=json.loads(base.read_text())
protocol.update(version=2,declaredAt=datetime.now(timezone.utc).isoformat(),previousProtocolSha256=hashlib.sha256(base.read_bytes()).hexdigest())
protocol["amendment"]={"reason":"v1 operational CPU failure; five completed worlds, two interrupted worlds and all27unstarted trials retained. See docs/value-development-interruption.json. The affected worlds were archived before administrative closure without further dispatch actions.","policyChange":"No price, payment, learning, routing, offer-feasibility or risk parameters changed. Skip provably ineligible/stale drivers before constructing offers, compute immutable open-gig features once per call, and refresh shared quotas before each driver. Behavioral equivalence test checks actions and quota state against frozenv1.","logging":"Journal decision telemetry after every tick and event batch, in addition to terminal artifacts. A fatal process exit can lose at most the current unfinished batch's telemetry; public server events remain recoverable.","newFreeze":"Repeat the complete34-world development panel under a new source/prior/protocol/launcher manifest. Repeats remain the same six underlying seed blocks. No claim from the interrupted panel is promoted.","audit":"docs/value-offer-performance.json"}
protocol["stopping"]="Complete all34frozen worlds regardless of profit. Each world has a600second wall-time budget checked before each tick. Runtime/budget failures stop new creation, retain partial events/decisions/worlds, and let already-running worlds finish. A failed study cannot promote. Five-minute occupancy wait budget. No tuning or positive interim stopping."
path.write_text(json.dumps(protocol,indent=2)+"\n")
