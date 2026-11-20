// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readThemePreference,
  storeThemePreference,
  THEME_STORAGE_KEY,
} from '../theme';
import {
  gardenFeedbackKey,
  readGardenFeedback,
  saveGardenFeedback,
} from './gardenFeedback';
import {
  occasionHolidayPreferenceKey,
  saveOccasionHolidayPreference,
} from './occasionHolidayPreferences';
import {
  announcePersonalSettingChange,
  clearPersonalSettingsSyncState,
} from './personalSettingsBus';
import {
  PERSONAL_SETTING_BINDINGS,
  PersonalSettingsConflictError,
  PersonalSettingsRejectedError,
  type PersonalSettingsScope,
  type PersonalSettingsSnapshot,
  PersonalSettingsSync,
  type PersonalSettingsTransport,
  type PersonalSettingsValues,
} from './personalSettingsSync';
import { DIARY_LAYOUT_STORAGE_KEY } from './useDiaryLayout';

const context = {
  instance: 'https://eimir.test',
  accountId: 'account-anna',
  spaceId: 'space-one',
};

const EMPTY: Record<PersonalSettingsScope, PersonalSettingsValues> = {
  account: {
    theme: null,
    diaryLayout: null,
    gardenSound: null,
    gardenVibration: null,
  },
  space: { occasionHolidays: null, wirStatistics: null },
};

/** An in-memory server document per scope with ETag versioning. */
class FakeServer implements PersonalSettingsTransport {
  documents: Record<PersonalSettingsScope, PersonalSettingsValues> = {
    account: { ...EMPTY.account },
    space: { ...EMPTY.space },
  };
  versions: Record<PersonalSettingsScope, number> = { account: 0, space: 0 };
  writes: Array<{
    scope: PersonalSettingsScope;
    changes: PersonalSettingsValues;
  }> = [];
  offline = false;
  failNextWrite: Error | null = null;

  snapshot(scope: PersonalSettingsScope): PersonalSettingsSnapshot {
    return {
      values: { ...this.documents[scope] },
      etag: `"${scope}:${this.versions[scope]}"`,
    };
  }

  /** Another device saves a value. */
  saveElsewhere(scope: PersonalSettingsScope, values: PersonalSettingsValues) {
    this.documents[scope] = { ...this.documents[scope], ...values };
    this.versions[scope] += 1;
  }

  read = vi.fn(async (scope: PersonalSettingsScope) => {
    if (this.offline) throw new TypeError('Failed to fetch');
    return this.snapshot(scope);
  });

  write = vi.fn(
    async (
      scope: PersonalSettingsScope,
      changes: PersonalSettingsValues,
      etag: string,
    ) => {
      if (this.offline) throw new TypeError('Failed to fetch');
      if (this.failNextWrite) {
        const error = this.failNextWrite;
        this.failNextWrite = null;
        throw error;
      }
      if (etag !== this.snapshot(scope).etag)
        throw new PersonalSettingsConflictError();
      this.writes.push({ scope, changes });
      this.saveElsewhere(scope, changes);
      return this.snapshot(scope);
    },
  );
}

function setup(server: FakeServer, online = () => !server.offline) {
  return new PersonalSettingsSync({
    context,
    transport: server,
    isOnline: online,
    debounceMs: 10,
    retryMs: 1_000,
  });
}

const holidaysKey = occasionHolidayPreferenceKey(
  context.instance,
  context.accountId,
  context.spaceId,
);

describe('personal settings sync', () => {
  let sync: PersonalSettingsSync | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    sync?.dispose();
    sync = undefined;
    vi.useRealTimers();
  });

  it('applies saved server values on start (server wins)', async () => {
    const server = new FakeServer();
    server.saveElsewhere('account', { theme: 'dark', gardenSound: true });
    server.saveElsewhere('space', { occasionHolidays: true });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

    sync = setup(server);
    await sync.start();

    expect(readThemePreference()).toBe('dark');
    expect(
      readGardenFeedback(gardenFeedbackKey(context.accountId, 'sound')),
    ).toBe(true);
    expect(window.localStorage.getItem(holidaysKey)).toBe('true');
    expect(server.writes).toEqual([]);
  });

  it('adopts an existing local choice once when the server has none', async () => {
    const server = new FakeServer();
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.localStorage.setItem(DIARY_LAYOUT_STORAGE_KEY, 'compact');
    window.localStorage.setItem(holidaysKey, 'false');

    sync = setup(server);
    await sync.start();

    expect(server.writes).toEqual([
      { scope: 'account', changes: { theme: 'dark', diaryLayout: 'compact' } },
      { scope: 'space', changes: { occasionHolidays: false } },
    ]);
    expect(sync.pendingKeys('account')).toEqual([]);

    // A second start finds the values on the server and uploads nothing.
    sync.dispose();
    sync = setup(server);
    await sync.start();
    expect(server.writes).toHaveLength(2);
  });

  it('writes a local change through after the debounce', async () => {
    const server = new FakeServer();
    sync = setup(server);
    await sync.start();

    storeThemePreference('dark');
    saveGardenFeedback(gardenFeedbackKey(context.accountId, 'vibration'), true);
    expect(server.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);

    expect(server.writes).toEqual([
      { scope: 'account', changes: { theme: 'dark', gardenVibration: true } },
    ]);
    expect(server.documents.account.theme).toBe('dark');
  });

  it('keeps a change made offline pending and uploads it when back online', async () => {
    const server = new FakeServer();
    sync = setup(server);
    await sync.start();
    server.offline = true;

    saveOccasionHolidayPreference(holidaysKey, true);
    await vi.advanceTimersByTimeAsync(20);
    expect(server.writes).toEqual([]);
    expect(sync.pendingKeys('space')).toEqual(['occasionHolidays']);

    // A restart while offline keeps the pending choice instead of losing it.
    sync.dispose();
    server.saveElsewhere('space', { occasionHolidays: false });
    server.offline = false;
    sync = setup(server);
    await sync.start();

    expect(window.localStorage.getItem(holidaysKey)).toBe('true');
    expect(server.documents.space.occasionHolidays).toBe(true);
    expect(sync.pendingKeys('space')).toEqual([]);
  });

  it('retries with a timer after a network failure', async () => {
    const server = new FakeServer();
    sync = setup(server, () => true);
    await sync.start();

    server.failNextWrite = new TypeError('Failed to fetch');
    storeThemePreference('light');
    await vi.advanceTimersByTimeAsync(20);
    expect(server.writes).toEqual([]);
    expect(sync.pendingKeys('account')).toEqual(['theme']);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.writes).toEqual([
      { scope: 'account', changes: { theme: 'light' } },
    ]);
    expect(sync.pendingKeys('account')).toEqual([]);
  });

  it('re-reads on a version conflict, keeps other keys and writes the local change last', async () => {
    const server = new FakeServer();
    sync = setup(server);
    await sync.start();

    // Another device saved while this one still held the older version.
    server.saveElsewhere('account', { diaryLayout: 'compact', theme: 'light' });
    storeThemePreference('dark');
    await vi.advanceTimersByTimeAsync(20);

    expect(server.write).toHaveBeenCalledTimes(2);
    expect(server.documents.account).toMatchObject({
      theme: 'dark',
      diaryLayout: 'compact',
    });
    expect(window.localStorage.getItem(DIARY_LAYOUT_STORAGE_KEY)).toBe(
      'compact',
    );
    expect(readThemePreference()).toBe('dark');
  });

  it('drops a change the server rejects instead of retrying forever', async () => {
    const server = new FakeServer();
    sync = setup(server);
    await sync.start();

    server.failNextWrite = new PersonalSettingsRejectedError();
    storeThemePreference('dark');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(server.write).toHaveBeenCalledTimes(1);
    expect(sync.pendingKeys('account')).toEqual([]);
    expect(readThemePreference()).toBe('dark');
  });

  it('never sends device-only keys or values outside the allowlist', async () => {
    const server = new FakeServer();
    sync = setup(server);
    await sync.start();

    for (const deviceOnly of [
      'eimir-quiet-hints-v1:account-anna:space-one',
      'eimir-connected-moment-v1:account-anna:space-one',
      'eimir.wir.partnerNoteSeen:account-anna:space-one',
      JSON.stringify([
        'eimir-garden-keepsakes-v1',
        'account-anna',
        'space-one',
      ]),
      'eimir:today-retrospective-dismissed:v1',
      'eimir-push-endpoint',
    ]) {
      window.localStorage.setItem(deviceOnly, 'true');
      announcePersonalSettingChange(deviceOnly);
    }
    // Another Account's garden choice on this device is not this owner's.
    saveGardenFeedback(gardenFeedbackKey('account-ben', 'sound'), true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(server.write).not.toHaveBeenCalled();

    // An unreadable local value is never uploaded.
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    announcePersonalSettingChange(THEME_STORAGE_KEY);
    await vi.advanceTimersByTimeAsync(20);
    expect(server.write).not.toHaveBeenCalled();

    const allowed = new Set(PERSONAL_SETTING_BINDINGS.map(({ key }) => key));
    expect(allowed).toEqual(
      new Set([
        'theme',
        'diaryLayout',
        'gardenSound',
        'gardenVibration',
        'occasionHolidays',
        'wirStatistics',
      ]),
    );
  });

  it('a server value applied locally is not echoed back as a change', async () => {
    const server = new FakeServer();
    server.saveElsewhere('account', { theme: 'dark' });
    sync = setup(server);
    await sync.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(server.write).not.toHaveBeenCalled();
    expect(sync.pendingKeys('account')).toEqual([]);
  });

  it('picks up another device’s change when it reconciles again', async () => {
    const server = new FakeServer();
    sync = setup(server);
    await sync.start();
    server.saveElsewhere('account', { theme: 'dark' });
    server.saveElsewhere('space', { wirStatistics: true });

    await sync.reconcileAll();

    expect(readThemePreference()).toBe('dark');
    expect(server.write).not.toHaveBeenCalled();
  });

  it('sign-out forgets pending names', async () => {
    const server = new FakeServer();
    server.offline = true;
    sync = setup(server);
    await sync.start();
    storeThemePreference('dark');
    await vi.advanceTimersByTimeAsync(20);
    expect(sync.pendingKeys('account')).toEqual(['theme']);

    clearPersonalSettingsSyncState();

    expect(sync.pendingKeys('account')).toEqual([]);
  });
});
