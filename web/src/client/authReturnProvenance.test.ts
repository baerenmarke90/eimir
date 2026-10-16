import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  consumeAuthReturnTarget,
  rememberCurrentAuthReturnTarget,
  restoreAuthReturnTarget,
} from './deepLinks';

const AUTH_RETURN_STORAGE_KEY = 'eimir-auth-return-v1';
const LEGACY_AUTH_RETURN_STORAGE_KEY = 'sidebyside-auth-return-v1';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => storageMap.clear(),
};

function setLocation(pathname: string): void {
  (
    globalThis as unknown as { window: { location: { pathname: string } } }
  ).window.location.pathname = pathname;
}

describe('Auth-return Account/Space provenance (#689)', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: mockLocalStorage,
      location: { pathname: '/today' },
      history: { state: null, replaceState: () => {} },
      dispatchEvent: () => true,
    };
    storageMap.clear();
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('1. Session expiry -> same Account reauthentication restores the remembered route', () => {
    setLocation('/story/memories/memory-a');
    rememberCurrentAuthReturnTarget('account-a', 'space-shared');

    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBe(
      '/story/memories/memory-a',
    );
  });

  it('consumes an auth return target stored by the legacy client', () => {
    mockLocalStorage.setItem(
      LEGACY_AUTH_RETURN_STORAGE_KEY,
      JSON.stringify({
        path: '/today',
        createdAt: Date.now(),
        accountId: 'account-a',
        spaceId: null,
      }),
    );

    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBe('/today');
    expect(mockLocalStorage.getItem(LEGACY_AUTH_RETURN_STORAGE_KEY)).toBeNull();
  });

  it('2. Session expiry -> different Account login discards the target instead of navigating', () => {
    setLocation('/more/private/notes/note-a-owner-only');
    rememberCurrentAuthReturnTarget('account-a', 'space-shared');

    expect(consumeAuthReturnTarget('account-b', 'space-shared')).toBeNull();
  });

  it('3. An OWNER_ONLY id from Account A never reaches Account B post-login', () => {
    setLocation('/more/private/gift-ideas/owner-only-gift-a');
    rememberCurrentAuthReturnTarget('account-a', 'space-shared');

    // Account B is now signed in and currently viewing its own landing page.
    setLocation('/today');
    const restoredForB = restoreAuthReturnTarget('account-b', 'space-shared');
    expect(restoredForB).toBeNull();
    expect(
      (globalThis as unknown as { window: { location: { pathname: string } } })
        .window.location.pathname,
    ).toBe('/today');

    // The record is also gone for a later, correct Account A request: it was
    // consumed (and discarded) by B's mismatched attempt, not left dangling.
    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBeNull();
  });

  it('4. A Space-bound route is not blindly restored into a different active Space', () => {
    setLocation('/story/memories/memory-a');
    rememberCurrentAuthReturnTarget('account-a', 'space-1');

    // Same Account, but the currently active Space differs (e.g. the Account
    // is a member of multiple Spaces and a different one is now active).
    expect(consumeAuthReturnTarget('account-a', 'space-2')).toBeNull();
  });

  it('4b. An account-global (non-resource-specific) route restores regardless of active Space', () => {
    setLocation('/today');
    rememberCurrentAuthReturnTarget('account-a', 'space-1');

    expect(consumeAuthReturnTarget('account-a', 'space-2')).toBe('/today');
  });

  it('4c. A Space-bound route does not restore when the caller does not yet know the active Space', () => {
    setLocation('/story/memories/memory-a');
    rememberCurrentAuthReturnTarget('account-a', 'space-1');

    // spaceId omitted entirely: the caller has not resolved Space membership
    // yet and cannot prove the target is safe, so it must not be restored.
    expect(consumeAuthReturnTarget('account-a')).toBeNull();
  });

  it('5. An expired stored target is discarded even for the same Account and Space', () => {
    setLocation('/story/memories/memory-a');
    const stored = {
      path: '/story/memories/memory-a',
      createdAt: Date.now() - 31 * 60 * 1000,
      accountId: 'account-a',
      spaceId: 'space-shared',
    };
    mockLocalStorage.setItem(AUTH_RETURN_STORAGE_KEY, JSON.stringify(stored));

    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBeNull();
  });

  it('6. A malformed stored record is discarded', () => {
    mockLocalStorage.setItem(
      AUTH_RETURN_STORAGE_KEY,
      JSON.stringify({ path: '/story/memories/memory-a' }), // missing createdAt/accountId
    );
    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBeNull();

    mockLocalStorage.setItem(AUTH_RETURN_STORAGE_KEY, 'not json at all');
    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBeNull();

    mockLocalStorage.setItem(
      AUTH_RETURN_STORAGE_KEY,
      JSON.stringify({
        path: '/story/memories/memory-a',
        createdAt: Date.now(),
        accountId: 42, // wrong type
        spaceId: 'space-shared',
      }),
    );
    expect(consumeAuthReturnTarget('account-a', 'space-shared')).toBeNull();
  });

  it('7. External URLs, query strings, fragments, traversal and auth-callback routes are still rejected', () => {
    for (const path of [
      'https://evil.example/steal',
      '//evil.example/steal',
      '/search?q=private',
      '/today#token',
      '/story/../more/private/notes/x',
      '/auth/magic-link',
    ]) {
      setLocation(path);
      expect(
        rememberCurrentAuthReturnTarget('account-a', 'space-1'),
      ).toBeNull();
      expect(consumeAuthReturnTarget('account-a', 'space-1')).toBeNull();
    }
  });

  it('8. The stored record carries no ProtectedPayload, title, preview text, or credentials -- only path/timestamp/provenance ids', () => {
    setLocation('/more/private/notes/owner-only-note-id');
    rememberCurrentAuthReturnTarget('account-a', 'space-shared');

    const raw = mockLocalStorage.getItem(AUTH_RETURN_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(Object.keys(parsed).sort()).toEqual([
      'accountId',
      'createdAt',
      'path',
      'spaceId',
    ]);
    expect(typeof parsed.path).toBe('string');
    expect(typeof parsed.createdAt).toBe('number');
    expect(typeof parsed.accountId).toBe('string');
  });

  it('a non-resource-specific route never stores a Space id even when one is provided', () => {
    setLocation('/more/private/notes');
    rememberCurrentAuthReturnTarget('account-a', 'space-shared');

    const raw = mockLocalStorage.getItem(AUTH_RETURN_STORAGE_KEY);
    const parsed = JSON.parse(raw as string);
    expect(parsed.spaceId).toBeNull();
  });

  it('restoreAuthReturnTarget navigates via history.replaceState and a popstate event on success', () => {
    const originalPopStateEvent = (
      globalThis as unknown as { PopStateEvent?: unknown }
    ).PopStateEvent;
    class FakePopStateEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    }
    (globalThis as unknown as { PopStateEvent: unknown }).PopStateEvent =
      FakePopStateEvent;

    let replaceStateArgs: unknown[] | null = null;
    let dispatchedEvent: unknown = null;
    (
      globalThis as unknown as {
        window: {
          location: { pathname: string };
          history: {
            state: unknown;
            replaceState: (...args: unknown[]) => void;
          };
          dispatchEvent: (event: { type: string }) => boolean;
          localStorage: typeof mockLocalStorage;
        };
      }
    ).window = {
      location: { pathname: '/today' },
      history: {
        state: null,
        replaceState: (...args: unknown[]) => {
          replaceStateArgs = args;
        },
      },
      dispatchEvent: (event: { type: string }) => {
        dispatchedEvent = event;
        return true;
      },
      localStorage: mockLocalStorage,
    };

    try {
      setLocation('/story/memories/memory-a');
      rememberCurrentAuthReturnTarget('account-a', 'space-shared');
      setLocation('/today');

      const restored = restoreAuthReturnTarget('account-a', 'space-shared');

      expect(restored).toBe('/story/memories/memory-a');
      expect(replaceStateArgs).toEqual([null, '', '/story/memories/memory-a']);
      expect((dispatchedEvent as { type: string } | null)?.type).toBe(
        'popstate',
      );
    } finally {
      (globalThis as unknown as { PopStateEvent: unknown }).PopStateEvent =
        originalPopStateEvent;
    }
  });
});
