/**
 * Short plan links (`/p/<id>`) that the calendar sync writes into calendar
 * events. The id is the plan UUID's 16 bytes in unpadded base64url, as the
 * backend's `urlsafe_b64encode(plan.id.bytes)` produces it.
 */

export const PLAN_SHORT_LINK_ROUTE_PATTERN = '/p/:shortId';

const SHORT_ID = /^[A-Za-z0-9_-]{22}$/;
const BASE64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** The plan UUID for a short id, or null when it is not one. */
export function planIdFromShortId(shortId: string): string | null {
  if (!SHORT_ID.test(shortId)) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of shortId) {
    value = (value << 6) | BASE64URL.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  // 22 characters carry 132 bits: 16 bytes plus 4 padding bits, which a
  // canonical encoding leaves at zero.
  if (bytes.length !== 16 || (value & ((1 << bits) - 1)) !== 0) return null;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The plan UUID when an opened URL is a short plan link of this instance.
 * Only the expected origin counts; other hosts, credentials and extra path
 * segments are ignored.
 */
export function readPlanShortLinkUrl(
  rawUrl: string,
  expectedOrigin: string,
): string | null {
  if (rawUrl.length > 2048) return null;
  try {
    const url = new URL(rawUrl);
    const expected = new URL(expectedOrigin);
    if (
      url.protocol !== 'https:' ||
      url.origin !== expected.origin ||
      url.username ||
      url.password
    )
      return null;
    const match = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
    return match ? planIdFromShortId(match[1]) : null;
  } catch {
    return null;
  }
}
