/**
 * Personal, cosmetic Today retrospective suppression.
 *
 * A single versioned local marker is sufficient: it never contains the
 * selected Memory ID, text, media, or authorization data. The Dashboard stays
 * authoritative and unchanged; this is not a shared Space preference (#432).
 */
export const TODAY_RETROSPECTIVE_DISMISSAL_KEY =
  'eimir:today-retrospective-dismissed:v1';

/**
 * Dashboard dates are UTC-midnight carriers for the Account-local calendar
 * day, not instants to shift into the device's time zone.
 *
 * During rolling upgrades, only older servers without viewerLocalDate use
 * the previous device-local fallback. A malformed present date fails closed.
 */
export function retrospectiveDismissalToken(
  accountId: string,
  spaceId: string,
  viewerLocalDate?: Date | null,
  legacyDeviceNow: Date = new Date(),
): string | null {
  if (!accountId || !spaceId) return null;

  let localDay: string;
  if (viewerLocalDate != null) {
    if (
      !(viewerLocalDate instanceof Date) ||
      !Number.isFinite(viewerLocalDate.getTime())
    ) {
      return null;
    }
    localDay = viewerLocalDate.toISOString().slice(0, 10);
  } else {
    if (!Number.isFinite(legacyDeviceNow.getTime())) return null;
    localDay = [
      legacyDeviceNow.getFullYear(),
      String(legacyDeviceNow.getMonth() + 1).padStart(2, '0'),
      String(legacyDeviceNow.getDate()).padStart(2, '0'),
    ].join('-');
  }

  return JSON.stringify([accountId, spaceId, localDay]);
}

export function isRetrospectiveDismissed(token: string | null): boolean {
  if (!token || typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(TODAY_RETROSPECTIVE_DISMISSAL_KEY) === token
    );
  } catch {
    return false;
  }
}

export function rememberRetrospectiveDismissal(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TODAY_RETROSPECTIVE_DISMISSAL_KEY, token);
  } catch {
    // In-memory hiding still works for the mounted Today page.
  }
}

/** A new Account/Space/day cannot inherit the previous scope's marker. */
export function clearForeignRetrospectiveDismissal(token: string | null): void {
  if (!token || typeof window === 'undefined') return;
  try {
    const stored = window.localStorage.getItem(
      TODAY_RETROSPECTIVE_DISMISSAL_KEY,
    );
    if (stored && stored !== token) {
      window.localStorage.removeItem(TODAY_RETROSPECTIVE_DISMISSAL_KEY);
    }
  } catch {
    // Disabled storage is already treated as an absent marker.
  }
}

export function clearRetrospectiveDismissal(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TODAY_RETROSPECTIVE_DISMISSAL_KEY);
  } catch {
    // Session cleanup must not fail because optional presentation state did.
  }
}
