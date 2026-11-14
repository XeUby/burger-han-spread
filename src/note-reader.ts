import type { Note } from "../vendor/typescript/types.ts"

/** What a dealer's note means. A missing side of the hours keeps the stated hour. */
export type NoteFacts = {
  manual: boolean
  plates: boolean
  summerTyres: boolean
  /** The car cannot be collected before this minute: it is not ready, or the buyer has not paid. */
  readyAt?: number
  /** The car must arrive by this minute, whatever the delivery option says. */
  deadline?: number
  /** The real hours of the pickup site and of the delivery site on working days, in minutes of the day. */
  pickup?: { opens: number; closes: number }
  delivery?: { opens: number; closes: number }
}

type Kind = "harmless" | "manual" | "plates" | "tyres" | "deadline" | "ready" | "pickupHours" | "pickupCloses" | "pickupOpens" | "deliveryHours" | "deliveryCloses"

/** Reads a whole note, or returns null: a word that the reader does not know can hide a restriction. */
export function readFacts(note: Note | null, arrivedAt: number): NoteFacts | null {
  const facts: NoteFacts = { manual: false, plates: false, summerTyres: false }
  if (!note) return facts
  let text = spell(plain(note.text))
  let understood = true
  const set = <K extends "readyAt" | "deadline">(key: K, value: number | null) => {
    if (value === null || (facts[key] !== undefined && facts[key] !== value)) understood = false
    else facts[key] = value
  }
  const hours = (key: "pickup" | "delivery", opens: number | null, closes: number | null) => {
    if (opens === null || closes === null) { understood = false; return }
    const before = facts[key] ?? { opens: 0, closes: 1440 }
    // Two statements about one site must agree on each side that both give.
    if ((opens > 0 && before.opens > 0 && opens !== before.opens) || (closes < 1440 && before.closes < 1440 && closes !== before.closes)) understood = false
    facts[key] = { opens: Math.max(before.opens, opens), closes: Math.min(before.closes, closes) }
  }
  for (const rule of rules) {
    text = text.replace(rule.pattern, (...match) => {
      const groups = match.at(-1) as Record<string, string | undefined>
      // A correction can follow the words that close the phrase.
      const when = `${groups.w ?? ""} ${groups.c ?? ""}`
      if (rule.kind === "manual") facts.manual = true
      else if (rule.kind === "plates") facts.plates = true
      else if (rule.kind === "tyres") facts.summerTyres = true
      else if (rule.kind === "deadline") set("deadline", moment(when, arrivedAt))
      else if (rule.kind === "ready") set("readyAt", moment(when, arrivedAt))
      else if (rule.kind === "pickupHours" || rule.kind === "deliveryHours") {
        const [opens, closes] = range(groups.r!)
        hours(rule.kind === "pickupHours" ? "pickup" : "delivery", opens, closes)
      } else if (rule.kind === "pickupCloses" || rule.kind === "deliveryCloses") hours(rule.kind === "pickupCloses" ? "pickup" : "delivery", 0, timeOfDay(when))
      else if (rule.kind === "pickupOpens") hours("pickup", timeOfDay(when), 1440)
      return " "
    })
  }
  if (!understood || /[a-z0-9]/.test(text)) return null
  for (const site of [facts.pickup, facts.delivery]) if (site && site.opens >= site.closes) return null
  return facts
}

/** What is left of a note after every phrase that the reader knows: empty when the note is understood. */
export function unread(note: Note): string {
  let text = spell(plain(note.text))
  for (const rule of rules) text = text.replace(rule.pattern, " ")
  return text.replace(/[\s.,!;:/()?-]+/g, " ").trim()
}

function plain(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[–—−]/g, "-").replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim()
}

// ---- Days and times ----

const relativeDays: [string, number][] = [
  ["the day after tomorrow", 2], ["day after tomorrow", 2], ["ylihuomenna", 2], ["i overmorgon", 2], ["iovermorgon", 2], ["overmorgon", 2],
  ["tomorrow", 1], ["tmrw", 1], ["huomenna", 1], ["i morgon", 1], ["imorgon", 1],
  ["today", 0], ["tanaan", 0], ["i dag", 0], ["idag", 0],
]
const weekdays: string[][] = [
  ["maanantaina", "maanantai", "ma", "monday", "mon", "mandag", "man"],
  ["tiistaina", "tiistai", "ti", "tuesday", "tues", "tue", "tisdag", "tis"],
  ["keskiviikkona", "keskiviikko", "ke", "wednesday", "wed", "onsdag", "ons"],
  ["torstaina", "torstai", "to", "thursday", "thurs", "thur", "thu", "torsdag", "tors"],
  ["perjantaina", "perjantai", "pe", "friday", "fri", "fredag", "fre"],
  ["lauantaina", "lauantai", "la", "saturday", "sat", "lordag", "lor"],
  ["sunnuntaina", "sunnuntai", "su", "sunday", "sun", "sondag", "son"],
]
const longestFirst = (words: string[]) => [...words].sort((a, b) => b.length - a.length).join("|")
const DAY = `(?:(?:pa|on) )?(?:${longestFirst([...relativeDays.map(([word]) => word), ...weekdays.flat()])})`

// An hour in words is a working hour, from 9 to 17: "kahdelta" is 14:00.
const hourStems: [string, number][] = [
  ["yhde(?:n|lta|sta|lla)toista|yhteentoista|yhtatoista|yksitoista|elva", 11], ["kahde(?:n|lta|sta|lla)toista|kahteentoista|kahtatoista|kaksitoista|tolv", 12],
  ["yhdeksa(?:n|a|lta|sta|an|lla)|nio", 9], ["kymmene(?:n|lta|sta|en|lla)|kymmenta|tio", 10],
  ["yhde(?:n|lta|sta|lla)|yhteen|yhta|yksi|ett", 13], ["kahde(?:n|lta|sta|lla)|kahteen|kahta|kaksi|tva", 14], ["kolme(?:n|a|lta|sta|en|lla)?|tre", 15],
  ["nelja(?:n|a|lta|sta|an|lla)?|fyra", 16], ["viide(?:n|lta|sta|lla)|viiteen|viitta|viisi|fem", 17], ["noon", 12],
]
const HOUR_WORD = `(?:${hourStems.map(([stem]) => stem).join("|")})`
const CLOCK = `(?:\\d{1,2}:(?:sta|een|aan|lta|ksi|n)|\\d{1,2}[.:]\\d{2}(?: ?[ap]m)?|\\d{4}|\\d{1,2}(?: ?[ap]m)?)(?![a-z0-9])`
const TIME = `(?:(?:klo|kello|kl|klockan|at) )?(?:(?:(?:puoli|halv|half|puolta) )?${HOUR_WORD}(?![a-z0-9])|${CLOCK})`
// A dot after a day ends the sentence unless a clear time follows: "to. klo 10.30", but "torstaina. 2 sarjaa renkaita".
const CLEAR_TIME = `(?:(?:klo|kello|kl|klockan|at) ${TIME}|(?:(?:puoli|halv|half|puolta) )?${HOUR_WORD}(?![a-z0-9])|\\d{1,2}[.:]\\d{2}(?: ?[ap]m)?(?![a-z0-9])|\\d{1,2} ?[ap]m(?![a-z0-9]))`
const MOMENT = `(?:${DAY},? ${TIME}|${DAY}\\. ${CLEAR_TIME}|${TIME}|${DAY})`
// "ei kun 13" replaces what was said; "ei 13" and "(not 3pm)" deny a value that then does not count.
const FIX = `(?:ei kun|eikun|korjaus:?|sorry,? i mean|i mean|correction:?|rattelse:?|nej,? forlat,?)`
const DENY = `(?:ei|not|inte)`
const CHANGE = `(?:[,.!]? ?\\(?(?:${FIX}|${DENY}),? ${MOMENT}\\)?)`
/** A day and a time, with what the dealer then corrects or denies. */
const W = `(?<w>${MOMENT}${CHANGE}*)`
/** The same after the words that close the phrase: "klo 14 alkaen. korjaus: klo 15". */
const C = `(?<c>${CHANGE}*)`
const WORKDAYS = `(?:arkisin|arkipaivisin|ma-pe|mon-fri|on weekdays|weekdays|vardagar|man-fre)`
const R = `(?<r>(?:${WORKDAYS},? )?${TIME} ?(?:-|to|till|until|ja)? ?${TIME}(?: ${WORKDAYS})?)`

function clock(text: string): number | null {
  text = text.replace(/^(?:klo|kello|kl|klockan|at) /, "")
  const half = /^(?:puoli|halv|half|puolta) /.test(text)
  text = text.replace(/^(?:puoli|halv|half|puolta) /, "")
  for (const [stem, hour] of hourStems) if (new RegExp(`^(?:${stem})$`).test(text)) return hour * 60 - (half ? 30 : 0)
  if (half) return null
  const match = /^(\d{1,2})(?:[.:](\d{2})|:[a-z]+)?(?: ?([ap]m))?$/.exec(text) ?? /^(\d{2})(\d{2})()$/.exec(text)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (match[3]) {
    if (hour < 1 || hour > 12) return null
    hour = hour % 12 + (match[3] === "pm" ? 12 : 0)
  }
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

const piece = new RegExp(`(?<fix>${FIX})|(?<deny>(?<![a-z])${DENY}(?![a-z]))|(?<day>(?<![a-z])${DAY}(?![a-z]))|(?<time>${TIME})`, "g")

/** The day offset and the minute of the day that a phrase names, after its corrections. */
function dayAndTime(text: string, arrivalWeekday: number): { day: number | null; minute: number | null } | null {
  let day: number | null = null
  let minute: number | null = null
  let denied = false
  for (const match of text.matchAll(piece)) {
    const groups = match.groups!
    if (groups.fix) denied = false
    else if (groups.deny) denied = true
    else if (denied) continue
    else if (groups.day) {
      const word = groups.day.replace(/^(?:pa|on) /, "")
      const relative = relativeDays.find(([name]) => name === word)
      if (relative) day = relative[1]
      else {
        // A weekday name is that weekday 2 to 6 days after the request arrives.
        const ahead = (weekdays.findIndex(names => names.includes(word)) - arrivalWeekday + 7) % 7
        if (ahead < 2) return null
        day = ahead
      }
    } else {
      minute = clock(groups.time!)
      if (minute === null) return null
    }
  }
  return { day, minute }
}

function moment(text: string, arrivedAt: number): number | null {
  const arrivalDay = Math.floor(arrivedAt / 1440)
  const read = dayAndTime(text, arrivalDay % 7)
  return read && read.minute !== null ? (arrivalDay + (read.day ?? 0)) * 1440 + read.minute : null
}

function timeOfDay(text: string): number | null {
  const read = dayAndTime(text, 0)
  return read && read.day === null ? read.minute : null
}

function range(text: string): [number | null, number | null] {
  const times = [...text.replace(new RegExp(WORKDAYS, "g"), " ").matchAll(new RegExp(TIME, "g"))].map(match => clock(match[0]))
  return times.length === 2 ? [times[0]!, times[1]!] : [null, null]
}

// ---- Phrases ----

const REF = `\\d{3,}`
const phrases: [Kind, string[]][] = [
  ["deadline", [
    `(?:asiakas tulee hakemaan,? )?(?:toimitus )?(?:perille|perilla) viim\\.? ${W}`,
    `(?:kiire,? asiakas odottaa[.,!]? )?(?:pitaa olla |oltava )?perilla ${W} mennessa${C}`,
    `oltava perilla viimeistaan ${W}`,
    `viimeistaan ${W} perilla${C}`,
    `toimitus viimeistaan ${W}`,
    `asiakas noutaa ${W},? auton? oltava silloin perilla${C}`,
    `(?:must be )?at destination (?:by )?${W}(?: latest| at the latest)?${C}`,
    `must (?:arrive|be there) by ${W}`,
    `latest arrival ${W}`,
    `deliver no later than ${W}`,
    `customer picks it up ${W},? must be there by then${C}`,
    `(?:maste vara )?framme senast ${W}`,
    `kunden hamtar ${W},? bilen maste vara (?:framme|dar) da${C}`,
    `ska vara pa plats senast ${W}`,
  ]],
  ["ready", [
    `(?:auto )?valmis vasta ${W}`,
    `(?:auto )?valmistuu ${W}`,
    `noudettavissa aikaisintaan ${W}`,
    `(?:huolto kesken|odottaa osia|pesu kesken),? (?:valmis|haettavissa) ${W}(?: jalkeen)?${C}`,
    `valmis noudettavaksi ${W} jalkeen${C}`,
    `(?:auton? )?(?:voi noutaa|saa hakea vasta) ${W} (?:alkaen|jalkeen)${C}`,
    `valmiina ${W} alkaen${C}`,
    `${W} valmis${C}`,
    `bilen ar klar ${W}`,
    `(?:ready for pickup from|not ready before|earliest pickup|car won't be ready until|in the workshop,? ready) ${W}`,
    `ready ${W} at the earliest${C}`,
    `(?:bilen )?klar forst ${W}`,
    `inte klar forran ${W}`,
    `kan hamtas tidigast ${W}`,
    `kan hamtas ${W} och framat${C}`,
    // The dealer hands the car over only after payment.
    `(?:released after payment|maksun jalkeen),? (?:not before|ei ennen) ${W}`,
    `luovutus vasta kun maksettu,? aikaisintaan ${W}`,
    `luovutetaan kun maksu nakyy,? aikaisintaan ${W}`,
    `kauppa kesken:? luovutus vasta maksun jalkeen,? ${W} alkaen${C}`,
    `ostaja maksaa ensin,? auton saa ${W} alkaen${C}`,
    `asiakas maksaa ${W},? luovutus sen jalkeen${C}`,
    `buyer pays first,? pickup from ${W}`,
    `handover once paid,? ${W} at the earliest${C}`,
    `lamnas ut efter betalning,? tidigast ${W}`,
    `utlamning efter betalning,? fran ${W}`,
    `rahoitus vahvistuu ${W},? vasta sitten saa hakea${C}`,
    `pickup only after payment,? from ${W}`,
    `payment clears ${W},? no pickup before that${C}`,
  ]],
  ["deliveryHours", [
    `(?:vastaanottava liike auki|toimitusosoite auki|kohde auki|kohteen aukioloajat:?|perilla auki|vastaanotto(?: onnistuu)?) ${R}`,
    `(?:receiving shop open|receiving|destination open) ${R}(?: only)?`,
    `(?:mottagaren har oppet|mottagning) ${R}`,
  ]],
  ["deliveryCloses", [
    `(?:kohde sulkee|vastaanotto paattyy) ${W}`,
    `perilla liike kiinni ${W} jalkeen${C}`,
    `vastaanotto ${W} (?:asti|saakka)${C}`,
    `(?:destination closes|receiving shop closes)(?: at)? ${W}`,
    `receiving until ${W}(?: only)?${C}`,
    `mottagaren stanger ${W}`,
    `mottagning till ${W}`,
    `perilla ei ketaan ${W} jalkeen${C}`,
    `vastaanottava liike sulkee ${W}`,
    `perilla auki vain ${W} (?:asti|saakka)${C}`,
    `nobody at the destination after ${W}`,
    `toimitukset vastaanotetaan ${W} (?:asti|saakka)${C}`,
    `vastaanottaja paikalla vain ${W} (?:asti|saakka)${C}`,
  ]],
  ["pickupHours", [
    `(?:nouto|noudettavissa|liike auki|meilla auki|avoinna|huom aukioloajat|aukioloajat:?|auton voi hakea) ${R}`,
    `(?:pickup|open|collect|opening hours) ${R}(?: only)?`,
    `(?:hamtning|avhamtning|oppet|oppettider:?) ${R}`,
    `${R} nouto onnistuu`,
  ]],
  ["pickupCloses", [
    `liike (?:kiinni|menee kiinni) ${W},? haettava ennen sita${C}`,
    `(?:haettava|nouto|pitaa hakea) ennen ${W}`,
    `liike (?:sulkee|menee kiinni) ${W}`,
    `haku viimeistaan ${W}`,
    `ollaan taalla ${W} (?:saakka|asti)${C}`,
    `auki vain ${W} asti${C}`,
    `${W} jalkeen ei enaa luovutuksia${C}`,
    `(?:collect before|we close at) ${W}`,
    `pickup by ${W} at the latest${C}`,
    `nobody here after ${W}`,
    `(?:hamtas fore|vi stanger) ${W}`,
    `taalla ei ketaan ${W} jalkeen${C}`,
    `shop closes(?: at)? ${W}`,
    `pick up no later than ${W}`,
    `open until ${W}(?: only)?${C}`,
    `oppet till ${W}`,
    `hamtning senast ${W}`,
    `ingen utlamning efter ${W}`,
  ]],
  ["manual", [
    `manuaalivaihteet,? kuski tarvii manuaalikortin`, `kuljettajalla oltava oikeus ajaa manuaalia`, `ei automaatti vaan manuaali`, `manuaali,? ei automaatti`, `manuaalivaihteisto`, `manuaalivaihteinen`, `huom manuaali`, `kasivaihteinen`, `kasivaihteet`,
    `manual,? driver needs a manual licence`, `manual transmission,? no automatic`, `manual transmission`, `manual gearbox`, `stick shift`, `it's a manual`,
    `manuell,? inte automat`, `manuell vaxellada`, `manuellt vaxlad`, `obs manuell`,
  ]],
  ["plates", [
    `car has no plates,? bring trade plates`, `plates removed,? bring trade plates`, `unregistered,? needs trade plates`, `no plates,? bring transfer plates`, `car has no plates`, `no plates`,
    `kilvet puuttuu,? tuo siirtokilvet`, `kilvet poistettu,? ota koekilvet`, `poistettu rekisterista,? tarvitaan siirtokilvet`, `ei rekkareita,? koekilvet tarvitaan`, `ei kilpia,? siirtokilvet mukaan`, `rekisterikilvet irrotettu`, `auto ilman kilpia`,
    `skyltarna borttagna,? ta med provskyltar`, `saknar skyltar,? ta med provskyltar`, `saknar skyltar`, `inga skyltar pa bilen`,
  ]],
  ["tyres", [
    `auto viela kesarenkailla`, `huom viela kesarenkaat alla`, `kesarenkaat alla,? ei talvirenkaita`, `viela kesarenkaat,? talvet puuttuu`, `kesakumit alla`,
    `still on summer tyres`, `summer tyres on,? no winters`, `winter tyres not fitted yet`,
    `har fortfarande sommardack pa`, `obs sommardack pa`, `sommardacken sitter kvar`, `inga vinterdack an`, `summers still on`, `sommardack pa,? inga vinterdack`, `talvirenkaita ei viela vaihdettu`,
  ]],
  ["harmless", [
    `(?:booking ref|our ref|reference|ref|order no|varaus|viitenro|viite|meidan viite|tilausnumero|tilausnro|referens|var ref|ordernr)\\.?:? ?${REF}`,
    `nothing special`, `standard transfer`, `pickup from our yard`, `ei erityista`, `normaali siirto`, `tavallinen toimitus`, `nouto liikkeen pihasta`, `vanlig transport`, `hamtas pa garden`,
    `second set of wheels in the back`, `spare wheels in the boot`, `extra set of tyres in the boot,? take along`, `summer tyres in the trunk,? go with the car`,
    `renkaat kyydissa`, `renkaat takakontissa,? menee mukana`, `kesarenkaat vanteineen takakontissa`, `rengassarja takapenkilla,? kulkee mukana`, `2 sarjaa renkaita,? toinen sarja kontissa`, `4 rengasta vanteilla tavaratilassa`, `lisaksi 4 kesarengasta tavaratilassa`, `ylimaarainen rengassarja takakontissa,? mukaan`, `lisarenkaat mukaan`, `rengassarja mukaan`,
    `sommardacken i bakluckan,? foljer med`, `extra dacksats i bagaget,? ska med`, `dacken ligger i bilen,? ska med`,
    `avaimet (?:myyjalta|huollon tiskilta|huollosta|toimistosta)`, `avain autossa`, `avain avainboksissa,? koodi \\d+`, `auto pihalla ruudussa \\d+,? avain tiskilta`, `auto liikkeen edessa`,
    `keys at service desk`, `keys from reception`, `key in the car`, `key box code \\d+`, `car in bay \\d+,? keys at the desk`,
    `nyckeln i bilen`, `nycklar i receptionen`, `nyckelbox,? kod \\d+`, `bilen star pa plats \\d+,? nyckeln i kassan`,
    `kauppakirja mukana,? anna vastaanottajalle`, `paperit kuljettajalle tiskilta`, `paperit hanskalokerossa`, `huoltokirja ja rekisteriote autossa`, `servicebok och registreringsbevis i bilen`, `pappren i handskfacket`, `service book and reg papers in the car`, `(?:papers|docs) in the glovebox`,
    `soita asap jos tulee ongelmia`, `ilmoita kun lahdet`, `soita kun olet lahella`, `soita n\\.? tuntia ennen saapumista`, `soita asiakkaalle tuntia ennen perilla oloa`, `soita \\d+ min ennen`, `soita ennen noutoa`, `soita liikkeeseen ennen kuin tulet`,
    `call asap if any issues`, `call the customer an hour before arrival`, `call \\d+ min before you arrive`, `call before pickup`, `ring kunden en timme innan`, `ring innan hamtning`, `ring \\d+ min innan`,
    `valmis,? voi hakea heti`, `auto valmis,? nouto heti kun sopii`, `auto valmiina,? haettavissa heti`, `auto on valmis noudettavaksi`, `valmiina pihalla`, `car is ready and waiting`, `ready,? collect right away`, `ready now`, `klar,? kan hamtas direkt`, `bilen star klar`,
    `auto pesematta`, `pieni kolhu oik\\.? ovessa,? kuvaa noutaessa`, `naarmu takapuskurissa,? vanha`, `ajettu n\\.? \\d+ ?tkm`, `scratch on rear bumper,? old`, `small dent right door,? take photos at pickup`, `liten buckla hoger dorr,? fota vid hamtning`,
    `akku heikko,? voi tarvita apukaynnistyksen`, `tankissa vahan`, `takaluukku jumittaa`, `weak battery,? may need a jump start`, `low on fuel`, `svagt batteri`,
    `automatic,? not a manual`, `automaatti,? ei manuaali`, `automat,? inte manuell`, `automaattivaihteinen,? ei manuaali`, `automaattivaihteinen`,
    `kiire,? asiakas odottaa`,
    `vie uusi asiakkaalle ja tuo vaihtari takaisin`, `vaihtoauto takaisin liikkeelle`, `vaihtari tulee takaisin meille`, `asiakkaan vanha auto takaisin meille`, `trade-in comes back to us`, `bring the trade-in back here`, `bring the customer's old car back to us`, `inbytesbilen tillbaka till oss`, `kundens gamla bil tillbaka till oss`,
    `(?:myyja (?:paikalla|kotona|tavattavissa)|omistaja kotona|seller home|owner at home|saljaren hemma) (?:${DAY},? )?${TIME} ?(?:-|to|till)? ?${TIME}(?: valilla)?`,
    `hei,? tassa taas yksi siirto`, `kiitos etukateen`, `kiitos paljon`, `kiitos taas`, `kiitos,? thx`, `hyvaa paivanjatkoa`, `terveisin myynti`, `t\\.? myynti`, `thanks in advance`, `thank you`, `br,? sales`, `mvh forsaljningen`, `halsningar`, `tack pa forhand`,
    `hei vaan`, `hi there`, `moikka`, `moi`, `hei`, `terve`, `hello`, `hi`, `hejsan`, `hej`, `kiitti`, `kiitos`, `thanks`, `thx`, `cheers`, `tack`,
  ]],
]

const rules = phrases.flatMap(([kind, sources]) => sources.map(source => ({ kind, pattern: new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, "g") })))

// ---- Spelling ----

/** Every word of five letters or more that a phrase, a day or an hour can contain. */
export const vocabulary = new Set([
  ...phrases.flatMap(([, sources]) => sources).join(" ").replace(/\$\{[^}]*\}|\(\?<[a-z]>|\\[a-z]/g, " ").match(/[a-z]{5,}/g) ?? [],
  ...relativeDays.flatMap(([word]) => word.split(" ")), ...weekdays.flat(),
  ..."yhdelta yhdesta yhteen yhden kahdelta kahdesta kahteen kahden kahta kolmelta kolmesta kolmeen kolmen kolmea neljalta neljasta neljaan neljan neljaa viidelta viidesta viiteen viiden viitta yhdeksalta yhdeksasta yhdeksaan yhdeksan kymmenelta kymmenesta kymmeneen kymmenen yhdeltatoista yhdestatoista yhteentoista yhdentoista kahdeltatoista kahdestatoista kahteentoista kahdentoista puoli puolta kello klockan arkisin arkipaivisin weekdays vardagar korjaus sorry correction rattelse forlat eikun".split(" "),
].filter(word => word.length >= 5))
const corrections = new Map<string, string>()

/** Puts right a word with one slip of the keyboard, when only one known word is that near. */
function spell(text: string): string {
  return text.replace(/[a-z]{5,}/g, word => {
    if (vocabulary.has(word)) return word
    if (!corrections.has(word)) {
      const near = [...vocabulary].filter(known => oneSlip(word, known))
      corrections.set(word, near.length === 1 ? near[0]! : word)
    }
    return corrections.get(word)!
  })
}

/** One letter wrong, missing or extra, or two neighbours swapped. */
function oneSlip(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false
  if (a.length === b.length) {
    const different = [...a].flatMap((letter, i) => letter === b[i] ? [] : [i])
    return different.length === 1 || (different.length === 2 && different[1] === different[0]! + 1 && a[different[0]!] === b[different[1]!] && a[different[1]!] === b[different[0]!])
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < shorter.length && shorter[i] === longer[i]) i++
  return shorter.slice(i) === longer.slice(i + 1)
}
