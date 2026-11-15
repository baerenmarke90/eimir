import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CalendarSyncApi } from '../api/generated/apis/CalendarSyncApi';
import type { CalendarSyncView } from '../api/generated/models/CalendarSyncView';
import type { SpaceCalendarTargetView } from '../api/generated/models/SpaceCalendarTargetView';
import { Configuration } from './apiConfiguration';
import { openPhotoBrowser } from './photoSources';
import { normalizeClientError } from './problemDetails';

export function calendarSyncApi(apiBaseUrl: string, accessToken: string) {
  return new CalendarSyncApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

export interface CalendarSyncOwner {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}

export function calendarSyncQueryKey(owner: CalendarSyncOwner) {
  return [
    'calendar-sync',
    owner.apiBaseUrl,
    owner.accountId,
    owner.spaceId,
  ] as const;
}

/** One read of the shared calendar state; writes replace it with their response. */
export function useCalendarSync(owner: CalendarSyncOwner) {
  const api = useMemo(
    () => calendarSyncApi(owner.apiBaseUrl, owner.accessToken),
    [owner.apiBaseUrl, owner.accessToken],
  );
  const client = useQueryClient();
  const queryKey = calendarSyncQueryKey(owner);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.getCalendarSync({ spaceId: owner.spaceId }, { signal }),
    retry: false,
  });
  return {
    api,
    view: query.data,
    error: query.error,
    loading: query.isPending,
    replace: (view: CalendarSyncView) => client.setQueryData(queryKey, view),
    refresh: () =>
      client.invalidateQueries(
        { queryKey, exact: true },
        { throwOnError: true },
      ),
  };
}

export type CalendarSyncStatus =
  | 'synced'
  | 'running'
  | 'broken'
  | 'attention'
  | 'paused'
  | 'proPaused';

/** The single calm status the couple sees, derived from the server's facts. */
export function calendarSyncStatus(
  target: SpaceCalendarTargetView,
): CalendarSyncStatus {
  if (target.status === 'PAUSED') return 'paused';
  if (target.status === 'SUSPENDED') {
    if (target.statusReason === 'PRO_REQUIRED') return 'proPaused';
    if (target.statusReason === 'CONNECTION_BROKEN') return 'broken';
    return 'attention';
  }
  if (target.conflicts.length > 0 || target.failedCount > 0) return 'attention';
  if (target.pendingCount > 0) return 'running';
  return 'synced';
}

function googleConsentUrl(url: string): string {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'accounts.google.com' ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    throw new Error('Calendar authorization origin is invalid.');
  return parsed.href;
}

/** Web: Google's consent in this tab; the server returns to the settings. */
export function openGoogleConsentHere(url: string): void {
  window.location.assign(googleConsentUrl(url));
}

/** Android app: the system browser through the shared, host-allowlisted opener. */
export async function openGoogleConsent(url: string, popup: Window | null) {
  await openPhotoBrowser(googleConsentUrl(url), popup);
}

const KNOWN_ERRORS = new Set([
  'CALENDAR_AUTH_FAILED',
  'CALENDAR_NOT_FOUND',
  'CALENDAR_NOT_WRITABLE',
  'CALENDAR_ADDRESS_INVALID',
  'CALENDAR_TARGET_BLOCKED',
  'CALENDAR_TLS_INVALID',
  'CALENDAR_UNREACHABLE',
  'CALENDAR_TIMEOUT',
  'CALENDAR_RATE_LIMITED',
  'CALENDAR_TARGET_CHANGED',
  'CALENDAR_CONNECTION_LIMIT',
  'CALENDAR_GOOGLE_UNAVAILABLE',
  'CALENDAR_GOOGLE_EXPIRED',
]);

/** Map any failure to one localized key; provider text is never shown. */
export async function calendarSyncErrorKey(error: unknown): Promise<string> {
  const problem = await normalizeClientError(error);
  if (problem.code && KNOWN_ERRORS.has(problem.code))
    return `calendarSync.errors.${problem.code}`;
  if (problem.status === 403) return 'calendarSync.proRequired';
  return 'calendarSync.errors.fallback';
}
