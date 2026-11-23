/**
 * The display form of a failure reference (#2189). Only the support report
 * sheet shows it, so it lives apart from the recorder in `failureReference`,
 * which every API transport loads at startup.
 */

const DISPLAY_SEPARATOR = ' · ';
const DISPLAY_FALLBACK_LENGTH = 24;
const DISPLAY_METHOD = /^[A-Z]{1,8}$/;
const DISPLAY_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

/** A neutral short form of a reference that does not parse; no path segments. */
function displayFallback(reference: string): string {
  const withoutPaths = reference.replace(/\/[^:]*/g, '');
  return withoutPaths.slice(0, DISPLAY_FALLBACK_LENGTH) || '–';
}

/**
 * The short, non-technical form of a failure reference for the support sheet:
 * `<METHOD> · <status or transport outcome> · [<problem code> · ]<app|web>`,
 * for example `GET · 500 · web`. The route template is never shown, because
 * API routes do not belong on couple-facing surfaces; the full reference is
 * still what a report sends. A reference that does not parse falls back to its
 * first characters without any `/` segments.
 */
export function formatFailureForDisplay(reference: string): string {
  const parts = reference.split(':');
  const method = parts[0] ?? '';
  const surfaceName = parts[parts.length - 1];
  // Method, route, outcome and surface at least; the code is optional.
  if (
    parts.length < 4 ||
    parts.length > 5 ||
    !DISPLAY_METHOD.test(method) ||
    !parts[1]?.startsWith('/') ||
    (surfaceName !== 'app' && surfaceName !== 'web')
  )
    return displayFallback(reference);
  const details = parts.slice(2, -1);
  if (!details.every((part) => DISPLAY_TOKEN.test(part)))
    return displayFallback(reference);
  return [method, ...details, surfaceName].join(DISPLAY_SEPARATOR);
}
