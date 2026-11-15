import { describe, expect, it } from 'vitest';
import type { SpaceCalendarTargetView } from '../api/generated/models/SpaceCalendarTargetView';
import { ClientProblemError } from './problemDetails';
import { calendarSyncErrorKey, calendarSyncStatus } from './calendarSync';

const target: SpaceCalendarTargetView = {
  service: 'CALDAV',
  calendarName: 'Unser Kalender',
  sponsor: { id: 'a', displayName: 'Anna' },
  sponsoredByMe: true,
  status: 'ACTIVE',
  syncedCount: 3,
  pendingCount: 0,
  failedCount: 0,
  keptCount: 0,
  conflicts: [],
};

describe('calendar sync presentation', () => {
  it('derives one calm status from the server facts', () => {
    expect(calendarSyncStatus(target)).toBe('synced');
    expect(calendarSyncStatus({ ...target, pendingCount: 2 })).toBe('running');
    expect(calendarSyncStatus({ ...target, failedCount: 1 })).toBe('attention');
    expect(
      calendarSyncStatus({
        ...target,
        conflicts: [{ planId: 'p', reason: 'EVENT_CHANGED' }],
      }),
    ).toBe('attention');
    expect(calendarSyncStatus({ ...target, status: 'PAUSED' })).toBe('paused');
    expect(
      calendarSyncStatus({
        ...target,
        status: 'SUSPENDED',
        statusReason: 'PRO_REQUIRED',
      }),
    ).toBe('proPaused');
    expect(
      calendarSyncStatus({
        ...target,
        status: 'SUSPENDED',
        statusReason: 'CONNECTION_BROKEN',
      }),
    ).toBe('broken');
    expect(
      calendarSyncStatus({
        ...target,
        status: 'SUSPENDED',
        statusReason: 'CALENDAR_UNAVAILABLE',
      }),
    ).toBe('attention');
  });

  it('maps only known codes and never shows provider text', async () => {
    const known = new ClientProblemError(
      'validation',
      422,
      'CALENDAR_AUTH_FAILED',
    );
    expect(await calendarSyncErrorKey(known)).toBe(
      'calendarSync.errors.CALENDAR_AUTH_FAILED',
    );
    const unknown = new ClientProblemError('validation', 422, 'X');
    expect(await calendarSyncErrorKey(unknown)).toBe(
      'calendarSync.errors.fallback',
    );
    const pro = new ClientProblemError(
      'permission',
      403,
      'PREMIUM_ENTITLEMENT_REQUIRED',
    );
    expect(await calendarSyncErrorKey(pro)).toBe('calendarSync.proRequired');
  });
});
