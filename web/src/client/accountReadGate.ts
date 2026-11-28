import type { AccountView } from '../api/generated/models/AccountView';
import type { TokenView } from '../api/generated/models/TokenView';
import { isAccessTokenValid } from './sessionPersistence';

/**
 * Whether the account reads that follow sign-in may start. While a stored
 * session is restored, the stored account already names the owner, so these
 * reads start as soon as a usable access token exists. They do not wait for
 * the token refresh to finish and `/me` to confirm the account: a token that
 * is about to expire is not usable, and nothing starts until the refresh has
 * produced a new one.
 */
export function accountReadsMayStart(
  tokens: TokenView | null,
  account: AccountView | null,
  isRestoring: boolean,
): boolean {
  if (tokens === null || account === null) return false;
  return !isRestoring || isAccessTokenValid(tokens);
}
