import type { QueryClient } from '@tanstack/react-query';

/**
 * The query roots of every personal appearance choice. They share one version
 * token on the server (`app_icon_preferences`), so after a save the others
 * need their fresh token before their next save (#2283, #2345).
 */
export const APPEARANCE_QUERY_ROOTS = [
  'app-icon',
  'wir-design',
  'person-colours',
  'memory-world',
  'wir-reel-style',
] as const;

export type AppearanceQueryRoot = (typeof APPEARANCE_QUERY_ROOTS)[number];

/** Read every other appearance choice again after `own` was saved. */
export function refreshAppearanceSiblings(
  client: QueryClient,
  own: AppearanceQueryRoot,
): void {
  for (const root of APPEARANCE_QUERY_ROOTS)
    if (root !== own) void client.invalidateQueries({ queryKey: [root] });
}
