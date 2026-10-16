// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalDeepLink,
  consumeAuthReturnTarget,
  rememberCurrentAuthReturnTarget,
  restoreAuthReturnTarget,
  SETTINGS_AUTH_RETURN_HASHES,
  validateAppRelativeReturnTarget,
} from './deepLinks';

const storage = new Map<string, string>();
const localStorage = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
  storage.clear();
  window.history.replaceState(null, '', '/today');
});

describe('M5 Web S6 canonical Deep Links', () => {
  it('builds opaque canonical targets for shared and owner-only resources', () => {
    expect(canonicalDeepLink('memory', 'a/b')).toBe('/story/memories/a%2Fb');
    expect(canonicalDeepLink('wish', 'wish id')).toBe('/plan/wishes/wish%20id');
    expect(canonicalDeepLink('privateNote', 'note/1')).toBe(
      '/more/private/notes/note%2F1',
    );
  });

  it('accepts canonical app-relative return targets only', () => {
    expect(validateAppRelativeReturnTarget('/today')).toBe('/today');
    expect(validateAppRelativeReturnTarget('/story/memories/abc')).toBe(
      '/story/memories/abc',
    );
    expect(
      validateAppRelativeReturnTarget('/more/private/gift-ideas/abc'),
    ).toBe('/more/private/gift-ideas/abc');
    expect(validateAppRelativeReturnTarget('/more/settings')).toBe(
      '/more/settings',
    );
  });

  it.each(SETTINGS_AUTH_RETURN_HASHES)(
    'allows the known Settings return fragment %s',
    (hash) => {
      expect(validateAppRelativeReturnTarget(`/more/settings${hash}`)).toBe(
        `/more/settings${hash}`,
      );
    },
  );

  it('rejects hashes outside the explicit Settings allowlist', () => {
    expect(
      validateAppRelativeReturnTarget('/more/settings#settings-unknown'),
    ).toBeNull();
    expect(validateAppRelativeReturnTarget('/today#settings-data')).toBeNull();
  });

  it('rejects external, legacy, normalized and content-bearing return targets', () => {
    expect(
      validateAppRelativeReturnTarget('https://example.test/today'),
    ).toBeNull();
    expect(validateAppRelativeReturnTarget('//example.test/today')).toBeNull();
    expect(validateAppRelativeReturnTarget('/dashboard')).toBeNull();
    expect(validateAppRelativeReturnTarget('/story/../today')).toBeNull();
    expect(validateAppRelativeReturnTarget('/search?q=private')).toBeNull();
    expect(validateAppRelativeReturnTarget('/today#token')).toBeNull();
    expect(validateAppRelativeReturnTarget('/auth/magic-link')).toBeNull();
    expect(validateAppRelativeReturnTarget('/more/settings\\evil')).toBeNull();
    expect(
      validateAppRelativeReturnTarget('/more/settings\u0000#settings-data'),
    ).toBeNull();
  });

  it('restores a Settings section only for the Account that remembered it', () => {
    window.history.replaceState(null, '', '/more/settings#settings-data');
    expect(rememberCurrentAuthReturnTarget('account-1', 'space-1')).toBe(
      '/more/settings#settings-data',
    );
    expect(consumeAuthReturnTarget('account-2', 'space-1')).toBeNull();

    expect(rememberCurrentAuthReturnTarget('account-1', 'space-1')).toBe(
      '/more/settings#settings-data',
    );
    window.history.replaceState(null, '', '/today');
    expect(restoreAuthReturnTarget('account-1', 'space-2')).toBe(
      '/more/settings#settings-data',
    );
    expect(window.location.pathname).toBe('/more/settings');
    expect(window.location.hash).toBe('#settings-data');
  });

  it('does not remember Settings URLs with a query string', () => {
    window.history.replaceState(
      null,
      '',
      '/more/settings?unsafe=1#settings-data',
    );
    expect(rememberCurrentAuthReturnTarget('account-1')).toBeNull();
    expect(consumeAuthReturnTarget('account-1')).toBeNull();
  });
});
