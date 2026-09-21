export const SHARED_ACHIEVEMENT_HEADER = 'X-Eimir-Shared-Achievement';

export type SharedAchievementKind = 'plan-completed' | 'collection-completed';

export function sharedAchievementKind(
  response: Response,
): SharedAchievementKind | null {
  const value = response.headers.get(SHARED_ACHIEVEMENT_HEADER);
  if (value === 'plan-completed' || value === 'collection-completed') {
    return value;
  }
  return null;
}
