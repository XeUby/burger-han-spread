import fs from "node:fs"
import { createHash } from "node:crypto"

const bytes = fs.readFileSync("runs/offer-window-probe.json")
const probe = JSON.parse(bytes.toString())
if (!probe.baseDeleted || probe.cases.some((row: any) => row.arms.length !== 3 || row.arms.some((arm: any) => !arm.deleted || !arm.snapshot))) throw new Error("Probe incomplete or temporary worlds not deleted")
const cases = probe.cases.map((row: any) => ({
  requestId: row.request.id, pickup: row.request.legs[0].pickup.placeId, delivery: row.request.legs[0].delivery.placeId,
  openingFeeCents: row.openingFeeCents, offeredFeeCents: row.offeredFeeCents, recipients: row.recipients,
  arms: row.arms.map((arm: any) => {
    const events = arm.events.filter((event: any) => event.gigId === arm.snapshot.id)
    const bookings = events.filter((event: any) => event.kind === "gig_booked")
    const answers = events.filter((event: any) => event.kind === "offer_answered")
    return { arm: arm.arm, worldId: arm.worldId, deleted: arm.deleted, status: arm.snapshot.status,
      firstBookedAfterMinutes: bookings.length ? bookings[0].at - arm.snapshot.postedAt : null,
      firstBookedFeeCents: bookings[0]?.feeCents ?? null,
      finalFeeCents: ["booked", "working", "done"].includes(arm.snapshot.status) ? arm.snapshot.feeCents : null,
      acceptedOffers: answers.filter((event: any) => event.answer === "accepted").length,
      declinedOffers: answers.filter((event: any) => event.answer === "declined").length,
      expiredOffers: answers.filter((event: any) => event.answer === "expired").length,
      bookings, answers,
    }
  }),
}))
const summary = Object.fromEntries(["public", "public-with-offers", "offer-window"].map(name => {
  const arms = cases.map((row: any) => row.arms.find((arm: any) => arm.arm === name))
  const booked = arms.filter((arm: any) => arm.finalFeeCents !== null)
  return [name, { cases: arms.length, bookedAt30Minutes: booked.length, acceptedOffers: arms.reduce((sum: number, arm: any) => sum + arm.acceptedOffers, 0), declinedOffers: arms.reduce((sum: number, arm: any) => sum + arm.declinedOffers, 0), expiredOffers: arms.reduce((sum: number, arm: any) => sum + arm.expiredOffers, 0), meanFinalBookedFeeCents: booked.length ? booked.reduce((sum: number, arm: any) => sum + arm.finalFeeCents, 0) / booked.length : null }]
}))
const report = { scope: probe.scope.replace("Twelve isolated", "At most twelve isolated"), caseLimit: 12, actualCases: cases.length, stopAtWorldMinute: 900, seed: probe.seed, baseWorld: probe.baseWorld, baseDeleted: probe.baseDeleted, evidenceSha256: createHash("sha256").update(bytes).digest("hex"), summary,
  limitations: ["Only isolated early same-day jobs in one practice seed. No week-level throughput, quota consumption, drops, late costs or net profit estimate.", "Nearby driver profiles do not reveal active work schedules. Recipients are chosen before fork outcomes, identically across offer arms.", "The one-cent public fee isolates public competition, but may teach severe future raise expectations. No later-order learning effects are measured.", "Booked-only average fees compare potentially different booked subsets. Use the paired case table before interpreting savings.", "All temporary worlds were deleted after preserving observations; no ranking attempt was used."], cases }
fs.writeFileSync("docs/offer-window-probe.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
