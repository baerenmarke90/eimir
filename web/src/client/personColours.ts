/**
 * Who is "you" and who is "your partner" in a colour (Product Owner decision
 * 2026-11-16, replaces the creator rule of #1808).
 *
 * Each person picks one fixed pair of colours for their own view: their own
 * colour first, then the colour of their partner. The pair is personal and is
 * never shared, so the two phones can show the same person in different
 * colours. Without a choice a person sees themself blue and their partner
 * rose. The colour values live in `design/tokens.json` (`personColors`); this
 * module only knows which token names a pair uses.
 */

export type PersonRole = 'own' | 'partner';

/** Resolves a person to the role they have for the signed-in account. */
export type PersonRoleOf = (personId: string | null | undefined) => PersonRole;

export function personRoleResolver(
  ownAccountId: string | null | undefined,
): PersonRoleOf {
  return (personId) =>
    personId && personId === ownAccountId ? 'own' : 'partner';
}

/** You first, then your partner, so every list reads the same way. */
export function roleOrder(role: PersonRole): number {
  return role === 'own' ? 0 : 1;
}

export type PersonToneId = 'rose' | 'deeprose' | 'blue' | 'deepblue' | 'moss';

export type PersonColourPairId =
  | 'rose_blue'
  | 'blue_rose'
  | 'rose_deeprose'
  | 'deeprose_rose'
  | 'blue_deepblue'
  | 'deepblue_blue'
  | 'moss_rose'
  | 'moss_blue';

export interface PersonColourPair {
  own: PersonToneId;
  partner: PersonToneId;
}

/** The pair a person sees until they choose one. Mirrors `defaultPair` in the tokens. */
export const DEFAULT_PERSON_COLOUR_PAIR: PersonColourPair = {
  own: 'blue',
  partner: 'rose',
};

/** Offered in the profile, in this order. The id is what the API stores. */
export const PERSON_COLOUR_PAIRS: readonly PersonColourPairId[] = [
  'rose_blue',
  'blue_rose',
  'rose_deeprose',
  'deeprose_rose',
  'blue_deepblue',
  'deepblue_blue',
  'moss_rose',
  'moss_blue',
];

export function personColourPair(
  id: PersonColourPairId | null | undefined,
): PersonColourPair {
  if (!id) return DEFAULT_PERSON_COLOUR_PAIR;
  const [own, partner] = id.split('_') as [PersonToneId, PersonToneId];
  return { own, partner };
}

/** CSS custom properties that carry a pair to every `person-role-*` consumer. */
export function personColourVariables(
  pair: PersonColourPair,
): Record<string, string> {
  return {
    '--person-own-accent': `var(--color-person-${pair.own})`,
    '--person-own-surface': `var(--color-person-${pair.own}-surface)`,
    '--person-partner-accent': `var(--color-person-${pair.partner})`,
    '--person-partner-surface': `var(--color-person-${pair.partner}-surface)`,
  };
}
