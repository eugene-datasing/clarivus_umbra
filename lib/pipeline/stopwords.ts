/**
 * Deny-list for bare-surname entity propagation (Phase 4).
 *
 * A seed like "Ms Young" should generate the variants "Mr Young",
 * "Dr Young", etc., but NOT propagate the bare "Young" across the
 * document — "Young" reads as a common adjective far more often than
 * as a surname, and an unanchored bare match will fire on every
 * "Young Dr ..." or "young person" phrase.
 *
 * The list is deliberately narrow: only words that genuinely collide
 * with common-English usage. We do NOT block real-but-common surnames
 * (Smith, Jones, Wilson, Williams, etc.) because their false-positive
 * rate on council documents is far lower than their recall value. The
 * guard is "is this word ambiguous in isolation?", not "is this word
 * frequent?"
 *
 * Used by `propagateNameDetections` in `entity-propagation.ts` to
 * suppress the bare-surname variant when the seed's surname matches
 * a word on this list. Honorific + surname variants (e.g. "Dr Young")
 * are still generated — a title prefix disambiguates.
 *
 * Case-insensitive matching; all entries stored lowercase.
 */

export const SURNAME_DENYLIST: ReadonlySet<string> = new Set([
  // The deny-list targets a specific failure mode: a seed surname that,
  // when bare, matches a common English word frequently capitalised at
  // sentence start. Case-sensitive first-letter matching already
  // handles lowercase collisions (e.g. "a young person" vs "Ms Young");
  // the residual risk is a surname-shaped word genuinely starting a
  // sentence in the body text ("Young people in the area..."). Entries
  // below all have the shape: (a) common enough as a word to sentence-
  // start regularly, (b) rarer than those common words as a surname.
  //
  // Occupation-style surnames (Taylor, Walker, Cook, Carter, Miller,
  // Mason, Baker, Fisher, Hunter) are deliberately NOT listed — they
  // sentence-start rarely enough and serve as genuine surnames often
  // enough that blocking them would cost more recall than it saves.
  //
  // Place nouns (Hill, Park, Lake, Bay) likewise kept out — they are
  // legitimate surnames at comparable or greater frequency than their
  // sentence-start usage in council documents.

  // Colours — frequent sentence-start adjectives in descriptive prose
  "brown",
  "green",
  "black",
  "white",
  "grey",
  "gray",

  // Age / size / quality adjectives
  "young",
  "old",
  "little",
  "best",
  "true",

  // Virtues and abstract nouns that commonly open sentences
  "hope",
  "faith",
  "mercy",
  "grace",
  "joy",
  "pride",

  // Verbs / direction words that commonly open sentences
  "grant",
  "march",
  "close",
  "bond",
]);

/**
 * Titles / honorifics recognised for propagation. Used both to parse
 * a seed like "Ms Ferguson" and to generate honorific+surname
 * variants from any seed ("Mr Ferguson", "Dr Ferguson", etc.).
 *
 * Stored in canonical written form (no trailing dot); matching is
 * case-insensitive with or without the dot.
 */
export const KNOWN_TITLES: readonly string[] = [
  "Mr",
  "Mrs",
  "Ms",
  "Miss",
  "Dr",
  "Prof",
  "Professor",
  "Sir",
  "Lady",
  "Lord",
  "Rev",
  "Hon",
];
