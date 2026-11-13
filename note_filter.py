"""Interim safe-note filter: accept a note only when it contains no risky phrase.

Conservative blocklist for times, days, weekdays, plates, manual gearbox, summer
tyres, deadlines, site hours, payment and ready times, in Finnish/Swedish/English.
Measured on one level-8 starter reveal: passes 154/290 harmless notes, 0/104 harmful
after the "smumer" typo fix. To be replaced by the full parser of task #3 (notes.py).
"""
import re
RISKY = re.compile(r"""(?<![\d#])\d{1,2}([.:]\d{2})?(?!\d)|
 tänään|idag|today|huom|morgon|tomorrow|tmrw|ylihuom|övermorgon|day\ after|
 \b(ma|ti|ke|to|pe|la|su|mån|tis|ons|tors?|fre|lör|sön|mon|tues?|wed|thur?s?|fri|sat|sun)\b\.?|
 maanant|tiistai|keskiviik|torstai|perjanta|lauanta|sunnunta|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|
 monday|tuesday|wednesday|thursday|friday|saturday|sunday|
 kilv|plate|skylt|manu|automaat|kesären|kesaren|summ?m?er|smumer|sumer|sommard|
 ennen|before|innan|före|until|asti|\btill\b|\bby\b|mennessä|viimeist|latest|senast|
 kiinni|closed|stäng|close|auki|öppe|\bopen|aukiolo|vastaanot|receiv|
 maksu|payment|betal|paid|
 valmi|ready|klar|aikaisintaan|earliest|tidigast|\bfrom\b|alkaen|från|
 \b(yksi|kaksi|kolme|neljä|viisi|kuusi|seitsemän|kahdeksan|yhdeksän|kymmenen|yksitoista|kaksitoista)\b|
 \b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b|
 \b(två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv)\b|half|halv|puoli""", re.X | re.I)
def is_safe_note(note):
    """True when the request has no note, or one with no phrase that could change the work."""
    return not note or not RISKY.search(note.get('text', ''))
