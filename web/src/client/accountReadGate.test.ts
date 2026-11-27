import { describe, expect, it } from 'vitest';
import type { AccountView } from '../api/generated/models/AccountView';
import type { TokenView } from '../api/generated/models/TokenView';
import { accountReadsMayStart } from './accountReadGate';

const account = { id: 'account-1' } as AccountView;

function tokens(expiresInMs: number): TokenView {
  return {
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: new Date(Date.now() + expiresInMs),
  } as unknown as TokenView;
}

describe('accountReadsMayStart', () => {
  it('waits for a session and a stored account', () => {
    expect(accountReadsMayStart(null, account, false)).toBe(false);
    expect(accountReadsMayStart(tokens(600_000), null, false)).toBe(false);
  });

  it('starts at once for a settled session', () => {
    expect(accountReadsMayStart(tokens(600_000), account, false)).toBe(true);
  });

  it('starts during restoration when the access token is still usable', () => {
    expect(accountReadsMayStart(tokens(600_000), account, true)).toBe(true);
  });

  it('holds during restoration while the access token is expired or about to expire', () => {
    expect(accountReadsMayStart(tokens(-1_000), account, true)).toBe(false);
    expect(accountReadsMayStart(tokens(30_000), account, true)).toBe(false);
  });
});
