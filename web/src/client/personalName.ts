export function firstNameFromDisplayName(
  displayName: string | null | undefined,
  fallback: string,
): string {
  const normalized = displayName?.trim();
  if (!normalized) {
    return fallback;
  }

  const [firstName] = normalized.split(/\s+/u, 1);
  return firstName || fallback;
}
