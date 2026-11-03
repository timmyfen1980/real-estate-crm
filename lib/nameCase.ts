// lib/nameCase.ts — smart name casing, shared by every path that
// captures or sends a person's name.
//
// Why this exists (Tim, 2026-11-03): open-house sign-ins and older
// contacts were captured exactly as typed — sometimes all-lowercase —
// and a drip email went out greeting a client "Hi mohd khalid,".
// Names are now cased at capture time (forms, sign-ins, imports),
// again at send time (so even a badly-stored name renders correctly),
// and the stored data was backfilled once. This helper is the single
// implementation all three layers use.
//
// Design rules:
// - A word that arrives in a UNIFORM case (all-lowercase or
//   ALL-UPPERCASE) is re-cased: first letter up, rest down, with
//   Mc/Mac prefixes and apostrophe/hyphen segments handled
//   ("mcdonald" -> "McDonald", "o'brien" -> "O'Brien",
//   "MARY-JANE" -> "Mary-Jane").
// - A word that arrives in MIXED case is treated as a deliberate
//   spelling and left exactly as-is ("DiCaprio", "MacNeil",
//   "D'Altroy" pass through untouched). That is what makes the
//   function idempotent — properName(properName(x)) === properName(x)
//   — and safe to apply at send time to every stored name.
// - Words containing a period (initials like "A.J") are left alone,
//   and so are one/two-letter ALL-CAPS words ("JJ", "TJ").
// - Whitespace is trimmed and collapsed.
//
// Examples:
//   properName('mohd khalid')    === 'Mohd Khalid'
//   properName('JOHN SMITH')     === 'John Smith'
//   properName("o'brien")        === "O'Brien"
//   properName('mcdonald')       === 'McDonald'
//   properName('MARY-JANE watson') === 'Mary-Jane Watson'
//   properName('Aidan Comeau')   === 'Aidan Comeau'  (unchanged)

// Common names that merely START with "mac" but are single words —
// the Mac-prefix rule must not split them ("MacKenzie" is a valid
// spelling some people use, but "Mackenzie" is the far more common
// one, and re-casing only happens for uniform-case input anyway).
const MAC_EXCEPTIONS = new Set([
  'mackenzie',
  'mack',
  'macy',
  'macie',
  'macias',
  'maciel',
  'macedo',
  'macri',
  'macon',
]);

// Short roman numerals read as suffixes/ordinals, not names.
const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii']);

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Case one hyphen/apostrophe-free segment. Only uniform-case
// segments are transformed; mixed-case segments are deliberate
// spellings and pass through.
function caseSegment(segment: string): string {
  if (!segment) return segment;
  if (!/[A-Za-z]/.test(segment)) return segment;

  const lower = segment.toLowerCase();
  const isUniform = segment === lower || segment === segment.toUpperCase();
  if (!isUniform) return segment;

  if (ROMAN_NUMERALS.has(lower)) return lower.toUpperCase();
  if (lower.startsWith('mc') && lower.length > 2) {
    return 'Mc' + capitalizeFirst(lower.slice(2));
  }
  if (
    lower.startsWith('mac') &&
    lower.length > 3 &&
    !MAC_EXCEPTIONS.has(lower)
  ) {
    return 'Mac' + capitalizeFirst(lower.slice(3));
  }
  return capitalizeFirst(lower);
}

function caseWord(word: string): string {
  // Initials and abbreviations ("A.J", "J.R.") keep their periods —
  // re-casing them would mangle them ("A.j").
  if (word.includes('.')) return word;
  // A one/two-letter ALL-CAPS word is initials far more often than
  // a name ("JJ", "TJ") — leave it exactly as stored.
  if (word.length <= 2 && /[A-Za-z]/.test(word) && word === word.toUpperCase()) {
    return word;
  }
  return word
    .split('-')
    .map((part) =>
      part
        .split(/(['’])/)
        .map((piece) => (piece === "'" || piece === '’' ? piece : caseSegment(piece)))
        .join('')
    )
    .join('-');
}

export function properName(name: string | null | undefined): string {
  if (name === null || name === undefined) return '';
  const cleaned = String(name).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.split(' ').map(caseWord).join(' ');
}
