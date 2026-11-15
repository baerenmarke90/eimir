export const COUPLE_EXPERIENCE_PROMPT_IDS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
] as const;

export function isCoupleExperiencePromptId(
  value: string | null,
): value is (typeof COUPLE_EXPERIENCE_PROMPT_IDS)[number] {
  return COUPLE_EXPERIENCE_PROMPT_IDS.some((id) => id === value);
}
