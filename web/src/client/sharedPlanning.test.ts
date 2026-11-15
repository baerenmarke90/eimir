import { describe, expect, it, vi } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import {
  dateFromInput,
  dateOnlyInput,
  dateTimeFromInput,
  localDateTimeInput,
  loadAllPlaces,
  moveItemIds,
  planningIfMatch,
  planScheduleDateInput,
  planScheduleEndInput,
  planScheduleFromInputs,
  planScheduleTimeInput,
  storyRelationTarget,
} from './sharedPlanning';

describe('shared planning client helpers', () => {
  it('uses the server resource version as If-Match', () => {
    expect(planningIfMatch({ version: 7 })).toBe('7');
  });

  it('keeps date-only fields stable in UTC', () => {
    const value = dateFromInput('2026-08-31');
    expect(value?.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(dateOnlyInput(value)).toBe('2026-08-31');
  });

  it('round-trips an explicit local Plan schedule date and time', () => {
    const value = dateTimeFromInput('2026-12-20T18:30');
    expect(value).toBeDefined();
    expect(localDateTimeInput(value)).toBe('2026-12-20T18:30');
  });

  it('keeps a Plan unscheduled when no date was chosen', () => {
    expect(planScheduleFromInputs('', '')).toBeUndefined();
    expect(planScheduleFromInputs('', '10:00')).toBeUndefined();
  });

  it('keeps a multi-day date-only period and treats the same day as one day', () => {
    const period = planScheduleFromInputs('2026-11-20', '', '2026-11-22');
    expect(period?.plannedOn?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(period?.plannedUntil?.toISOString()).toBe(
      '2026-11-22T00:00:00.000Z',
    );
    expect(period?.plannedStart).toBeUndefined();
    expect(planScheduleFromInputs('2026-11-20', '', '2026-11-20')).toEqual({
      plannedOn: new Date('2026-11-20T00:00:00Z'),
    });
    // A timed end never turns into a last calendar day.
    expect(
      planScheduleFromInputs('2026-11-20', '', '2026-11-22T10:00'),
    ).toEqual({ plannedOn: new Date('2026-11-20T00:00:00Z') });
    expect(
      planScheduleEndInput({
        plannedOn: period?.plannedOn ?? null,
        plannedUntil: period?.plannedUntil ?? null,
        plannedEnd: null,
      }),
    ).toBe('2026-11-22');
  });

  it('builds a genuine date-only Plan schedule without a fabricated time', () => {
    const schedule = planScheduleFromInputs('2026-09-05', '');

    expect(schedule?.plannedOn?.toISOString()).toBe('2026-09-05T00:00:00.000Z');
    expect(schedule?.plannedStart).toBeUndefined();
    expect(schedule?.plannedEnd).toBeUndefined();
    expect(
      planScheduleDateInput({
        plannedOn: schedule?.plannedOn ?? null,
        plannedStart: null,
      }),
    ).toBe('2026-09-05');
    expect(planScheduleTimeInput({ plannedStart: null })).toBe('');
  });

  it('builds a real timed schedule only when a time was explicitly chosen', () => {
    const schedule = planScheduleFromInputs('2026-09-05', '10:00');

    expect(schedule?.plannedOn).toBeUndefined();
    expect(schedule?.plannedStart).toBeDefined();
    expect(schedule?.plannedEnd).toBeUndefined();
    expect(
      planScheduleDateInput({
        plannedOn: null,
        plannedStart: schedule?.plannedStart ?? null,
      }),
    ).toBe('2026-09-05');
    expect(
      planScheduleTimeInput({ plannedStart: schedule?.plannedStart ?? null }),
    ).toBe('10:00');
  });

  it('keeps a progressively composed end as the authoritative end instant', () => {
    const schedule = planScheduleFromInputs(
      '2026-09-05',
      '10:00',
      '2026-09-05T11:30',
    );

    expect(localDateTimeInput(schedule?.plannedStart)).toBe('2026-09-05T10:00');
    expect(localDateTimeInput(schedule?.plannedEnd)).toBe('2026-09-05T11:30');
  });

  it('loads every page of selectable places', async () => {
    const listPlaces = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 'place-1', name: 'First place' }],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'place-2', name: 'Second place' }],
        nextCursor: null,
      });
    const apis = { places: { listPlaces } } as unknown as Parameters<
      typeof loadAllPlaces
    >[0];

    const places = await loadAllPlaces(apis, 'space-1');

    expect(places.map((place) => place.id)).toEqual(['place-1', 'place-2']);
    expect(listPlaces).toHaveBeenNthCalledWith(1, {
      spaceId: 'space-1',
      cursor: null,
      limit: 50,
      order: 'NAME',
      scope: 'ACTIVE',
    });
    expect(listPlaces).toHaveBeenNthCalledWith(2, {
      spaceId: 'space-1',
      cursor: 'cursor-2',
      limit: 50,
      order: 'NAME',
      scope: 'ACTIVE',
    });
  });

  it('stops invalid repeated place pagination cursors', async () => {
    const listPlaces = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: 'cursor-loop',
    });
    const apis = { places: { listPlaces } } as unknown as Parameters<
      typeof loadAllPlaces
    >[0];

    await expect(loadAllPlaces(apis, 'space-1')).rejects.toThrow(
      'Place pagination returned a repeated cursor.',
    );
    expect(listPlaces).toHaveBeenCalledTimes(2);
  });

  it('moves collection ids without changing the item set', () => {
    expect(moveItemIds(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItemIds(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItemIds(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('derives relation choices only from the shared Story contract', () => {
    const item = {
      kind: 'MEMORY',
      effectiveDate: new Date('2026-08-31T00:00:00Z'),
      memory: {
        id: 'memory-1',
        title: 'Am See',
        happenedOn: new Date('2026-08-31T00:00:00Z'),
        createdAt: new Date('2026-08-31T12:00:00Z'),
        author: { id: 'account-1', displayName: 'Alex' },
        attachments: [],
        capabilities: { canComment: true, canDelete: true, canEdit: true },
      },
    } satisfies StoryItem;

    expect(storyRelationTarget(item)).toMatchObject({
      id: 'memory-1',
      kind: 'MEMORY',
      label: 'Am See',
    });
  });
});
