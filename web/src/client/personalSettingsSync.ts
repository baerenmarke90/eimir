/**
 * Personal settings follow the Account (Product Owner request 2026-11-18).
 *
 * Every synced setting keeps its existing local store: the UI reads and writes
 * that store immediately and never waits for the network. This module only
 * reconciles those stores with the owner's server documents:
 *
 * - On start (sign-in, app start, Space switch) the server documents are read
 *   and a saved server value replaces the local one ("server wins").
 * - When the server has no value but this device has an explicit local choice,
 *   that choice is uploaded once, so existing users keep what they chose.
 * - A local change is uploaded after a short debounce. Until the server
 *   confirms it, the key stays pending in a device-local list, so a restart
 *   or a period offline cannot lose it; it is retried when the device is back
 *   online or the app returns to the foreground.
 * - Writes carry the document's ETag. On a conflict the document is read
 *   again, other keys take the server value, and the pending local change is
 *   written again (last writer wins per key).
 *
 * The key set is a closed allowlist. Device-bound state (push registration,
 * location permission, once-message keys, caches, drafts, read and dismissal
 * markers, quiet hints) has no binding here and therefore never leaves the
 * device.
 */

import type { PersonalSettingsApi } from '../api/generated/apis/PersonalSettingsApi';
import type { AccountPersonalSettingsPatch } from '../api/generated/models/AccountPersonalSettingsPatch';
import type { AccountPersonalSettingsView } from '../api/generated/models/AccountPersonalSettingsView';
import type { SpacePersonalSettingsPatch } from '../api/generated/models/SpacePersonalSettingsPatch';
import type { SpacePersonalSettingsView } from '../api/generated/models/SpacePersonalSettingsView';
import { type ApiResponse, ResponseError } from '../api/generated/runtime';
import {
  applySyncedThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../theme';
import { applySyncedGardenFeedback, gardenFeedbackKey } from './gardenFeedback';
import {
  applySyncedOccasionHolidayPreference,
  occasionHolidayPreferenceKey,
} from './occasionHolidayPreferences';
import {
  onPersonalSettingChange,
  PERSONAL_SETTINGS_SYNC_STATE_PREFIX,
} from './personalSettingsBus';
import {
  applySyncedDiaryLayout,
  DIARY_LAYOUT_STORAGE_KEY,
  type DiaryLayout,
  isDiaryLayout,
} from './useDiaryLayout';
import { applySyncedWirStatistics, wirStatisticsKey } from './useWirStatistics';

export type PersonalSettingsScope = 'account' | 'space';
export type PersonalSettingValue = string | boolean;
export type PersonalSettingsValues = Record<
  string,
  PersonalSettingValue | null
>;

export interface PersonalSettingsContext {
  instance: string;
  accountId: string;
  spaceId: string;
}

export interface PersonalSettingsSnapshot {
  values: PersonalSettingsValues;
  etag: string;
}

/** The server side; adapters translate HTTP failures into the errors below. */
export interface PersonalSettingsTransport {
  read(scope: PersonalSettingsScope): Promise<PersonalSettingsSnapshot>;
  write(
    scope: PersonalSettingsScope,
    changes: PersonalSettingsValues,
    etag: string,
  ): Promise<PersonalSettingsSnapshot>;
}

/** The document changed since it was read (HTTP 409). */
export class PersonalSettingsConflictError extends Error {}

/** The server refused the values themselves (HTTP 400/422); retrying cannot help. */
export class PersonalSettingsRejectedError extends Error {}

export interface PersonalSettingBinding {
  /** The server key in the owner's document. */
  key: string;
  scope: PersonalSettingsScope;
  storageKey(context: PersonalSettingsContext): string;
  /** A valid value, or `undefined` for anything else. */
  parse(value: unknown): PersonalSettingValue | undefined;
  /** Writes the local store and notifies its views without announcing a change. */
  apply(context: PersonalSettingsContext, value: PersonalSettingValue): void;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

function parseTheme(value: unknown): ThemePreference | undefined {
  return value === 'system' || value === 'light' || value === 'dark'
    ? value
    : undefined;
}

function parseLayout(value: unknown): DiaryLayout | undefined {
  return isDiaryLayout(value) ? value : undefined;
}

/** The closed allowlist of synced settings. Nothing else is ever sent. */
export const PERSONAL_SETTING_BINDINGS: readonly PersonalSettingBinding[] = [
  {
    key: 'theme',
    scope: 'account',
    storageKey: () => THEME_STORAGE_KEY,
    parse: parseTheme,
    apply: (_context, value) =>
      applySyncedThemePreference(value as ThemePreference),
  },
  {
    key: 'diaryLayout',
    scope: 'account',
    storageKey: () => DIARY_LAYOUT_STORAGE_KEY,
    parse: parseLayout,
    apply: (_context, value) => applySyncedDiaryLayout(value as DiaryLayout),
  },
  {
    key: 'gardenSound',
    scope: 'account',
    storageKey: ({ accountId }) => gardenFeedbackKey(accountId, 'sound'),
    parse: parseBoolean,
    apply: ({ accountId }, value) =>
      applySyncedGardenFeedback(
        gardenFeedbackKey(accountId, 'sound'),
        value === true,
      ),
  },
  {
    key: 'gardenVibration',
    scope: 'account',
    storageKey: ({ accountId }) => gardenFeedbackKey(accountId, 'vibration'),
    parse: parseBoolean,
    apply: ({ accountId }, value) =>
      applySyncedGardenFeedback(
        gardenFeedbackKey(accountId, 'vibration'),
        value === true,
      ),
  },
  {
    key: 'occasionHolidays',
    scope: 'space',
    storageKey: ({ instance, accountId, spaceId }) =>
      occasionHolidayPreferenceKey(instance, accountId, spaceId),
    parse: parseBoolean,
    apply: ({ instance, accountId, spaceId }, value) =>
      applySyncedOccasionHolidayPreference(
        occasionHolidayPreferenceKey(instance, accountId, spaceId),
        value === true,
      ),
  },
  {
    key: 'wirStatistics',
    scope: 'space',
    storageKey: ({ instance, accountId, spaceId }) =>
      wirStatisticsKey(instance, accountId, spaceId),
    parse: parseBoolean,
    apply: ({ instance, accountId, spaceId }, value) =>
      applySyncedWirStatistics(
        wirStatisticsKey(instance, accountId, spaceId),
        value === true,
      ),
  },
];

const SCOPES: readonly PersonalSettingsScope[] = ['account', 'space'];
const MAX_CONFLICT_ATTEMPTS = 3;

function syncStateKey(
  scope: PersonalSettingsScope,
  { instance, accountId, spaceId }: PersonalSettingsContext,
): string {
  const owner = [scope, instance.replace(/\/+$/, ''), accountId];
  if (scope === 'space') owner.push(spaceId);
  return PERSONAL_SETTINGS_SYNC_STATE_PREFIX + JSON.stringify(owner);
}

export interface PersonalSettingsSyncOptions {
  context: PersonalSettingsContext;
  transport: PersonalSettingsTransport;
  bindings?: readonly PersonalSettingBinding[];
  isOnline?: () => boolean;
  debounceMs?: number;
  retryMs?: number;
  maxRetryMs?: number;
}

export class PersonalSettingsSync {
  private readonly context: PersonalSettingsContext;
  private readonly transport: PersonalSettingsTransport;
  private readonly bindings: readonly PersonalSettingBinding[];
  private readonly isOnline: () => boolean;
  private readonly debounceMs: number;
  private readonly retryMs: number;
  private readonly maxRetryMs: number;
  private readonly etags = new Map<PersonalSettingsScope, string>();
  private readonly memoryPending = new Map<
    PersonalSettingsScope,
    Set<string>
  >();
  private readonly running = new Map<PersonalSettingsScope, Promise<void>>();
  /** A scope to run once more after the current run; `true` re-reads first. */
  private readonly again = new Map<PersonalSettingsScope, boolean>();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay: number;
  private unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(options: PersonalSettingsSyncOptions) {
    this.context = options.context;
    this.transport = options.transport;
    this.bindings = options.bindings ?? PERSONAL_SETTING_BINDINGS;
    this.isOnline =
      options.isOnline ??
      (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    this.debounceMs = options.debounceMs ?? 800;
    this.retryMs = options.retryMs ?? 5_000;
    this.maxRetryMs = options.maxRetryMs ?? 5 * 60_000;
    this.retryDelay = this.retryMs;
  }

  /** Listens for local changes and reconciles both documents once. */
  start(): Promise<void> {
    this.unsubscribe ??= onPersonalSettingChange((storageKey) =>
      this.localChanged(storageKey),
    );
    return this.reconcileAll();
  }

  /** Re-reads the server documents, e.g. when the app returns to the foreground. */
  reconcileAll(): Promise<void> {
    return Promise.all(SCOPES.map((scope) => this.run(scope, true))).then(
      () => undefined,
    );
  }

  /** Uploads pending local choices now, e.g. when the device is back online. */
  flushAll(): Promise<void> {
    return Promise.all(SCOPES.map((scope) => this.run(scope, false))).then(
      () => undefined,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.retryTimer);
  }

  pendingKeys(scope: PersonalSettingsScope): string[] {
    return [...this.readPending(scope)].sort();
  }

  private localChanged(storageKey: string): void {
    if (this.disposed) return;
    const binding = this.bindings.find(
      (candidate) => candidate.storageKey(this.context) === storageKey,
    );
    // Keys outside the allowlist are device-only and never leave the device.
    if (!binding) return;
    const pending = this.readPending(binding.scope);
    pending.add(binding.key);
    this.writePending(binding.scope, pending);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.flushAll();
    }, this.debounceMs);
  }

  /** One reconcile or flush per scope at a time; a request during a run repeats it. */
  private run(scope: PersonalSettingsScope, read: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const current = this.running.get(scope);
    if (current) {
      this.requestAgain(scope, read);
      return current;
    }
    const task = (async () => {
      try {
        let nextRead = read;
        for (;;) {
          await this.sync(scope, nextRead || !this.etags.has(scope));
          const again = this.again.get(scope);
          if (again === undefined || this.disposed) break;
          this.again.delete(scope);
          nextRead = again;
        }
      } finally {
        this.running.delete(scope);
      }
    })();
    this.running.set(scope, task);
    return task;
  }

  private requestAgain(scope: PersonalSettingsScope, read: boolean): void {
    this.again.set(scope, (this.again.get(scope) ?? false) || read);
  }

  private async sync(
    scope: PersonalSettingsScope,
    read: boolean,
  ): Promise<void> {
    if (!this.isOnline()) {
      if (this.readPending(scope).size || read) this.scheduleRetry();
      return;
    }
    try {
      if (read) this.adopt(scope, await this.transport.read(scope));
      for (let attempt = 1; ; attempt++) {
        try {
          await this.upload(scope);
          break;
        } catch (error) {
          if (
            !(error instanceof PersonalSettingsConflictError) ||
            attempt >= MAX_CONFLICT_ATTEMPTS
          )
            throw error;
          if (this.disposed) return;
          this.adopt(scope, await this.transport.read(scope));
        }
      }
      this.retryDelay = this.retryMs;
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof PersonalSettingsRejectedError) {
        // A value the server refuses would fail forever; keep it local only.
        this.writePending(scope, new Set());
        return;
      }
      this.scheduleRetry();
    }
  }

  /** Applies server values to keys without a pending local change; adopts local-only choices. */
  private adopt(
    scope: PersonalSettingsScope,
    snapshot: PersonalSettingsSnapshot,
  ): void {
    if (this.disposed) return;
    this.etags.set(scope, snapshot.etag);
    const pending = this.readPending(scope);
    for (const binding of this.scoped(scope)) {
      if (pending.has(binding.key)) continue;
      const server = binding.parse(snapshot.values[binding.key]);
      const local = this.readLocal(binding);
      if (server !== undefined) {
        if (local !== server) binding.apply(this.context, server);
      } else if (local !== undefined) {
        // One-time adoption: the server has no value, this device has a choice.
        pending.add(binding.key);
      }
    }
    this.writePending(scope, pending);
  }

  private async upload(scope: PersonalSettingsScope): Promise<void> {
    const pending = this.readPending(scope);
    if (!pending.size) return;
    const changes: PersonalSettingsValues = {};
    for (const binding of this.scoped(scope)) {
      if (!pending.has(binding.key)) continue;
      const local = this.readLocal(binding);
      if (local === undefined) pending.delete(binding.key);
      else changes[binding.key] = local;
    }
    if (!Object.keys(changes).length) {
      this.writePending(scope, pending);
      return;
    }
    const etag = this.etags.get(scope);
    if (etag === undefined) throw new PersonalSettingsConflictError();
    const saved = await this.transport.write(scope, changes, etag);
    if (this.disposed) return;
    this.etags.set(scope, saved.etag);
    // A key changed again during the write stays pending for the next round.
    const after = this.readPending(scope);
    for (const [key, sent] of Object.entries(changes)) {
      const binding = this.scoped(scope).find(
        (candidate) => candidate.key === key,
      );
      if (binding && this.readLocal(binding) === sent) after.delete(key);
    }
    this.writePending(scope, after);
    if (after.size) this.requestAgain(scope, false);
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer !== undefined) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void Promise.all(
        SCOPES.map((scope) => this.run(scope, !this.etags.has(scope))),
      );
    }, delay);
  }

  private scoped(scope: PersonalSettingsScope): PersonalSettingBinding[] {
    return this.bindings.filter((binding) => binding.scope === scope);
  }

  private readLocal(
    binding: PersonalSettingBinding,
  ): PersonalSettingValue | undefined {
    try {
      return binding.parse(
        window.localStorage.getItem(binding.storageKey(this.context)),
      );
    } catch {
      return undefined;
    }
  }

  private readPending(scope: PersonalSettingsScope): Set<string> {
    const memory = this.memoryPending.get(scope);
    if (memory) return new Set(memory);
    try {
      const value: unknown = JSON.parse(
        window.localStorage.getItem(syncStateKey(scope, this.context)) ?? '[]',
      );
      const known = new Set(this.scoped(scope).map((binding) => binding.key));
      return new Set(
        Array.isArray(value)
          ? value.filter(
              (key): key is string => typeof key === 'string' && known.has(key),
            )
          : [],
      );
    } catch {
      return new Set();
    }
  }

  private writePending(scope: PersonalSettingsScope, keys: Set<string>): void {
    try {
      const storageKey = syncStateKey(scope, this.context);
      if (keys.size)
        window.localStorage.setItem(
          storageKey,
          JSON.stringify([...keys].sort()),
        );
      else window.localStorage.removeItem(storageKey);
      this.memoryPending.delete(scope);
    } catch {
      // Without storage the pending list lasts until the app is closed.
      this.memoryPending.set(scope, new Set(keys));
    }
  }
}

function translateError(error: unknown): unknown {
  if (error instanceof ResponseError) {
    if (error.response.status === 409)
      return new PersonalSettingsConflictError('RESOURCE_VERSION_CONFLICT');
    if (error.response.status === 400 || error.response.status === 422)
      return new PersonalSettingsRejectedError('PERSONAL_SETTINGS_REJECTED');
  }
  return error;
}

async function snapshotOf(
  response: ApiResponse<
    AccountPersonalSettingsView | SpacePersonalSettingsView
  >,
): Promise<PersonalSettingsSnapshot> {
  const etag = response.raw.headers.get('ETag');
  if (!etag) throw new Error('PERSONAL_SETTINGS_ETAG_MISSING');
  const {
    schemaVersion: _schema,
    version: _version,
    ...values
  } = await response.value();
  return { values: values as PersonalSettingsValues, etag };
}

/** Adapts the generated client; `api` returns the client for the current token. */
export function personalSettingsTransport(
  api: () => PersonalSettingsApi,
  spaceId: string,
): PersonalSettingsTransport {
  return {
    async read(scope) {
      try {
        return await snapshotOf(
          scope === 'account'
            ? await api().getAccountPersonalSettingsRaw()
            : await api().getSpacePersonalSettingsRaw({ spaceId }),
        );
      } catch (error) {
        throw translateError(error);
      }
    },
    async write(scope, changes, etag) {
      try {
        return await snapshotOf(
          scope === 'account'
            ? await api().updateAccountPersonalSettingsRaw({
                ifMatch: etag,
                accountPersonalSettingsPatch:
                  changes as AccountPersonalSettingsPatch,
              })
            : await api().updateSpacePersonalSettingsRaw({
                spaceId,
                ifMatch: etag,
                spacePersonalSettingsPatch:
                  changes as SpacePersonalSettingsPatch,
              }),
        );
      } catch (error) {
        throw translateError(error);
      }
    },
  };
}
