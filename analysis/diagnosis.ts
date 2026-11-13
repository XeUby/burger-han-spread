import fs from "node:fs"
import { readNote } from "../experiments/baseline/src/notes.ts"

const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const map = read("docs/map.json")
const roads = new Map(map.roads.map((r: any) => [`${r.from}:${r.to}`, r]))
const baseline = read("experiments/baseline/validation.json")
const included = new Set(baseline.developmentRuns.map((r: any) => r.worldId))
const files = fs.readdirSync("runs").filter(p => /^w.*\.reveal\.json$/.test(p) && included.has(p.replace(/\.reveal\.json$/, "")))
const finalRevision = "c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6"
const all: any[] = []
const perRun: any[] = []
for (const file of files) {
  const stem = `runs/${file.replace(/\.reveal\.json$/, "")}`
  const meta = read(`${stem}.meta.json`)
  const reveal = read(`${stem}.reveal.json`)
  const events = read(`${stem}.events.json`)
  const snapshot = read(`${stem}.snapshot.json`)
  const orders = new Map(snapshot.orders.map((o: any) => [o.id, o]))
  const ledger = events.filter((e: any) => e.kind === "ledger").map((e: any) => e.line)
  const trust: Record<string, number> = {}
  const trustAt: Record<string, number> = {}
  for (const e of events) {
    if (e.kind === "price_request") trustAt[e.request.id] = trust[e.request.dealerId] || 0
    if (e.kind === "ledger" && e.line.orderId) {
      const order: any = orders.get(e.line.orderId)
      if (!order) continue
      const count = trust[order.dealerId] || 0
      if (e.line.kind === "revenue") trust[order.dealerId] = Math.min(25, count + 1)
      if (e.line.kind === "late_refund") trust[order.dealerId] = Math.floor(Math.max(0, count - 1) / 2)
    }
  }
  const rows = reveal.requests.map((r: any) => {
    const req = r.request
    const leg = req.legs[0]
    const road: any = roads.get(`${leg.pickup.placeId}:${leg.delivery.placeId}`)
    const order: any = orders.get(req.id)
    const lines = ledger.filter((l: any) => l.orderId === req.id)
    const sum = (kind: string) => lines.filter((l: any) => l.kind === kind).reduce((n: number, l: any) => n+l.cents, 0)
    const quoteValues: number[] = r.quote ? Object.values(r.quote) : []
    const quoted = quoteValues.length > 0 && Math.min(...quoteValues) < 1e7
    const note = readNote(req.note)
    const category = req.legs.length > 1 ? "tradein" : leg.pickup.privateAddress ? "privatePickup" : leg.delivery.privateAddress ? "privateDelivery" : !note.safe ? "unknownNote" : road.km > 400 ? "longRoute" : "structurallyEligible"
    const floor = Math.max(2000, Math.round(req.referenceFeeCents * meta.settings.fee)) / (1-meta.settings.margin)+1000
    return {
      seed: meta.seed, worldId: meta.worldId, revision: meta.revision,
      id: req.id, dealer: req.dealerId, day: Math.floor(req.arrivedAt/1440), pickupDay: Math.floor(leg.pickup.window.from/1440),
      from: leg.pickup.placeId, to: leg.delivery.placeId, km: road.km, category,
      premium: leg.car.premium, notes: Boolean(req.note), text: req.note?.text,
      quoted, quoteEqual: quoted && quoteValues.length>1 && new Set(quoteValues).size===1,
      priceRatio: quoted ? Math.min(...req.options.filter((o: any) => r.quote[o.kind] != null).map((o: any) => r.quote[o.kind]/o.listPriceCents)) : null,
      floorBinds: quoted && floor >= Math.min(...req.options.filter((o: any) => r.quote[o.kind] != null).map((o: any) => o.listPriceCents*meta.settings.price*(1+.007*(trustAt[req.id] || 0)))),
      won: r.outcome==="won", cancelled: order?.status==="cancelled", option: r.option,
      late: order && order.status!=="cancelled" ? order.deliveredAt.some((v: number|null) => v==null || v>order.deadline) : false,
      revenue: sum("revenue"), cost: -sum("driver_fee"), lateRefund: -sum("late_refund"),
      margin: lines.reduce((n: number, l: any) => n+l.cents,0), reference: req.referenceFeeCents,
      booked: events.filter((e: any) => e.kind==="gig_booked" && snapshot.gigs.some((g: any) => g.id===e.gigId && g.stops.some((s: any) => s.orderId===req.id))).length,
      drops: events.filter((e: any) => e.kind==="gig_dropped" && snapshot.gigs.some((g: any) => g.id===e.gigId && g.stops.some((s: any) => s.orderId===req.id))).length,
    }
  })
  all.push(...rows)
  perRun.push({ ...meta, ...summarize(rows), score: snapshot.score })
}
function summarize(rows: any[]) {
  const q = rows.filter(r=>r.quoted), w = rows.filter(r=>r.won && !r.cancelled)
  return {
    requests: rows.length, quoted: q.length, won: w.length,
    winRate: q.length ? w.length/q.length : null,
    late: w.filter(r=>r.late).length,
    onTime: w.length ? 1-w.filter(r=>r.late).length/w.length : null,
    marginEuros: rows.reduce((n,r)=>n+r.margin,0)/100,
    costRatio: w.length ? w.reduce((n,r)=>n+r.cost,0)/w.reduce((n,r)=>n+r.reference,0) : null,
    equalOptionPrices: q.filter(r=>r.quoteEqual).length,
    floorBinds: q.filter(r=>r.floorBinds).length,
    bookings: w.reduce((n,r)=>n+r.booked,0), drops: w.reduce((n,r)=>n+r.drops,0),
  }
}
function group(rows: any[], key: (r: any) => string) {
  return Object.fromEntries([...new Set(rows.map(key))].sort().map(k => [k, summarize(rows.filter(r=>key(r)===k))]))
}
const finalIds = new Set(baseline.validationRuns.map((r: any) => r.worldId))
const final = all.filter(r=>finalIds.has(r.worldId))
const selectedSeeds = [...new Set(all.map(r=>r.seed))]
const unique = selectedSeeds.flatMap(seed=>{
  const candidates = perRun.filter(r=>r.seed===seed)
  const run = candidates.find(r=>r.revision===finalRevision) || candidates.at(-1)
  return all.filter(r=>r.worldId===run.worldId)
})
const report = {
  limitations: ["Historical policies and selection confound aggregate associations; these are hypotheses, not causal treatment effects.", "Repeated seeds are not independent observations. The uniqueSeedCorpus selects one run per seed.", "Quote floor binding uses minimum base fee (without sparse-supply surcharge), so it is a conservative lower bound.", "No reveals expose competitor price or driver reservation cost; no reliable global profit ceiling can be identified."],
  perRun, final: summarize(final), finalByCategory: group(final,r=>r.category),
  finalByDay: group(final,r=>String(r.day)), finalByPickup: group(final,r=>r.from),
  finalByDistance: group(final,r=>r.km<70?"0-70":r.km<150?"70-150":r.km<250?"150-250":r.km<400?"250-400":"400+"),
  finalByFloor: group(final.filter(r=>r.quoted),r=>r.floorBinds?"floor":"price"),
  finalByOption: group(final.filter(r=>r.won),r=>r.option),
  finalByBookDelay: group(final.filter(r=>r.won),r=>r.drops>0?"dropped":"noDrop"),
  uniqueSeedCorpus: summarize(unique), uniqueByCategory: group(unique,r=>r.category),
  uniqueUnknownNotes: Object.entries(unique.filter(r=>r.category==="unknownNote").reduce((m: any,r)=>{m[r.text]=(m[r.text]||0)+1; return m},{})).sort((a: any,b: any)=>b[1]-a[1]).slice(0,80),
  matchedPolicyComparisons: [
    ["w815d24fedae64f9f5cf4", "w1937eaf885387948933b"],
    ["w23dc3ed7976dc481981f", "w7ae145e3ea74526ee4bf"],
  ].map(([older,newer])=>{
    const oldRows = all.filter(r=>r.worldId===older)
    const newRows = all.filter(r=>r.worldId===newer)
    const newMap = new Map(newRows.map(r=>[r.id,r]))
    const groups = new Map<string, any[]>()
    for (const a of oldRows.filter(r=>r.won && !r.cancelled)) {
      const b = newMap.get(a.id)
      const why = !b ? "missing" : b.won ? "retained" : b.quoted ? "competedAndLost" : b.category==="structurallyEligible" ? "capacitySupplyTime" : b.category
      if (!groups.has(why)) groups.set(why,[])
      groups.get(why)!.push(a)
    }
    return {older,newer, old:summarize(oldRows),new:summarize(newRows), oldWinsByNewOutcome:Object.fromEntries([...groups.entries()].map(([k,v])=>[k,summarize(v)]))}
  }),
}
fs.writeFileSync("docs/diagnosis.json",JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify({final:report.final,finalByCategory:report.finalByCategory,finalByFloor:report.finalByFloor,finalByDistance:report.finalByDistance,finalByOption:report.finalByOption,finalByBookDelay:report.finalByBookDelay},null,2))
