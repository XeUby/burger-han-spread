import type { Note } from "../vendor/typescript/types.ts"

export type NoteRules = { safe: boolean; manual: boolean; plates: boolean }

export function readNote(note: Note | null): NoteRules {
  if (!note) return { safe: true, manual: false, plates: false }
  let text = note.text.toLowerCase().normalize("NFC").trim()
  let manual = false
  let plates = false
  const equipment: [RegExp, () => void][] = [
    [/\b(?:manual transmission|manual gearbox|manuaalivaihteisto|manuaali|manuell växellåda)\b/g, () => { manual = true }],
    [/(?:auto ilman kilpiä|car has no plates|no plates|saknar skyltar)/g, () => { plates = true }],
  ]
  for (const [pattern, found] of equipment) text = text.replace(pattern, () => { found(); return " " })
  // Accept only complete, understood phrases. An unparsed constraint must not win a car.
  const harmless = [
    /(?:booking ref|varaus|viite|meidän viite|meidan viite|reference)\s*\d+/g,
    /(?:nothing special|standard transfer|pickup from our yard|nouto liikkeen pihasta|valmis, voi hakea heti)/g,
    /(?:second set of wheels in the back|spare wheels in the boot|summer tyres in the trunk, go with the car)/g,
    /(?:renkaat kyydissä|renkaat takakontissa, menee mukana|kesärenkaat vanteineen takakontissa|rengassarja takapenkillä, kulkee mukana|2 sarjaa renkaita, toinen sarja kontissa|4 rengasta vanteilla tavaratilassa|lisäksi 4 kesärengasta tavaratilassa|rengassarja mukaan)/g,
    /(?:sommardäcken i bakluckan, följer med|nyckeln i bilen|servicebok och registreringsbevis i bilen)/g,
    /(?:avaimet myyjältä|avaimet huollosta|avain autossa|avain avainboksissa, koodi \d+)/g,
    /(?:soita asap jos tulee ongelmia|call asap if any issues|ilmoita kun lähdet|soita kun olet lähellä|soita n\. tuntia ennen saapumista|soita asiakkaalle tuntia ennen perillä oloa|soita 15 min ennen)/g,
    /(?:kiitos etukäteen|kiitos paljon|kiitos taas|kiitti|kiitos|thank you|thanks|thx|cheers|br, sales|t\. myynti|moikka|moi|hello)/g,
  ]
  for (const pattern of harmless) text = text.replace(pattern, " ")
  return { safe: !text.replace(/[\s.,!;:/()-]/g, ""), manual, plates }
}
