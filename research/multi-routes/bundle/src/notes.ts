import type { Note } from "../vendor/typescript/types.ts"

export type NoteRules = { safe: boolean; manual: boolean; plates: boolean }

export function readNote(note: Note | null): NoteRules {
  if (!note) return { safe: true, manual: false, plates: false }
  let text = note.text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim()
  for (const pattern of harmless) text = text.replace(pattern, " ")
  let manual = false
  let plates = false
  text = text.replace(manualPhrases, () => { manual = true; return " " })
  text = text.replace(platePhrases, () => { plates = true; return " " })
  // A remaining word or number can carry an unmodeled restriction; decline the whole note.
  return { safe: !text.replace(/[\s.,!;:/()-]/g, ""), manual, plates }
}

function phrase(pattern: RegExp): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${pattern.source})(?![a-z0-9])`, "g")
}

const harmless = [
  /(?:booking ref|our ref|reference|ref|order no|varaus|viite(?:nro)?|meidan viite|tilausnumero|tilausnro|referens|ordernr)\s*:?\s*\d+/,
  /(?:nothing special|standard transfer|pickup from our yard|ei erityista|normaali siirto|tavallinen toimitus|nouto liikkeen pihasta|vanlig transport|hamtas pa garden)/,
  /(?:second set of wheels in the back|spare wheels in the boot|extra set of tyres in the boot,? take along|summer tyres in the trunk,? go with the car)/,
  /(?:renkaat kyydissa|renkaat takakontissa,? menee mukana|kesarenkaat vanteineen takakontissa|rengassarja takapenkilla,? kulkee mukana|2 sarjaa renkaita,? toinen sarja kontissa|4 rengasta vanteilla tavaratilassa|lisaksi 4 kesarengasta tavaratilassa|ylimaarainen rengassarja takakontissa,? mukaan|(?:lisa)?renkaat mukaan|rengassarja mukaan)/,
  /(?:sommardacken i bakluckan,? foljer med|extra dacksats i bagaget,? ska med|dacken ligger i bilen,? ska med)/,
  /(?:avaimet (?:myyjalta|huollon tiskilta|huollosta|toimistosta)|avain autossa|avain avainboksissa,? koodi \d+|auto pihalla ruudussa \d+,? avain tiskilta|auto liikkeen edessa)/,
  /(?:keys at service desk|keys from reception|key in the car|key box code \d+|car in bay \d+,? keys at the desk)/,
  /(?:nyckeln i bilen|nycklar i receptionen|nyckelbox,? kod \d+|bilen star pa plats \d+,? nyckeln i kassan)/,
  /(?:kauppakirja mukana,? anna vastaanottajalle|paperit kuljettajalle tiskilta|paperit hanskalokerossa|huoltokirja ja rekisteriote autossa|servicebok och registreringsbevis i bilen|service book and reg papers in the car|(?:papers|docs) in the glovebox)/,
  /(?:soita asap jos tulee ongelmia|ilmoita kun lahdet|soita kun olet lahella|soita n\.? tuntia ennen saapumista|soita asiakkaalle tuntia ennen perilla oloa|soita \d+ min ennen|soita ennen noutoa|soita liikkeeseen ennen kuin tulet)/,
  /(?:call asap if any issues|call the customer an hour before arrival|call \d+ min before you arrive|call before pickup|ring kunden en timme innan|ring innan hamtning|ring \d+ min innan)/,
  /(?:valmis,? voi hakea heti|auto valmis,? nouto heti kun sopii|auto valmiina,? haettavissa heti|auto on valmis noudettavaksi|valmiina pihalla|car is ready and waiting|ready,? collect right away|ready now)/,
  /(?:auto pesematta|pieni kolhu oik\.? ovessa,? kuvaa noutaessa|naarmu takapuskurissa,? vanha|ajettu n\.? \d+ tkm|scratch on rear bumper,? old|liten buckla hoger dorr,? fota vid hamtning)/,
  /(?:automatic,? not a manual|automaatti,? ei manuaali|automat,? inte manuell)/,
  /(?:hei,? tassa taas yksi siirto|kiitos etukateen|kiitos paljon|kiitos taas|hyvaa paivanjatkoa|terveisin myynti|t\.? myynti|thanks in advance|thank you|br,? sales|mvh forsaljningen|halsningar)/,
  /(?:hei vaan|hi there|moikka|moi|hei|terve|hello|hi|hej|hejsan|kiitti|kiitos|thanks|thx|cheers|tack)/,
].map(phrase)

export const harmlessWords = [...new Set(harmless.flatMap(pattern => pattern.source.match(/[a-z]{5,}/g) ?? []))].sort()

const manualPhrases = phrase(/(?:kuljettajalla oltava oikeus ajaa manuaalia|ei automaatti vaan manuaali|manuaali,? ei automaatti|manual transmission,? no automatic|manual transmission|manual gearbox|stick shift|manuaalivaihteisto|manuaalivaihteinen|huom manuaali|manuaali|manuell vaxellada|manuellt vaxlad)/)
const platePhrases = phrase(/(?:car has no plates,? bring trade plates|plates removed,? bring trade plates|unregistered,? needs trade plates|kilvet puuttuu,? tuo siirtokilvet|kilvet poistettu,? ota koekilvet|poistettu rekisterista,? tarvitaan siirtokilvet|ei rekkareita,? koekilvet tarvitaan|ei kilpia,? siirtokilvet mukaan|rekisterikilvet irrotettu|auto ilman kilpia|car has no plates|no plates|saknar skyltar|inga skyltar pa bilen)/)

export const equipmentWords = [...new Set([manualPhrases, platePhrases].flatMap(pattern => pattern.source.match(/[a-z]{5,}/g) ?? []))]

