// @vitest-environment jsdom
import { onlineManager } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportReportCreate } from '../api/generated/models/SupportReportCreate';
import { FetchError, ResponseError } from '../api/generated/runtime';
import { NOTE_MAX_CHARACTERS } from './supportReport';
import {
  supportReportDraftStorageKey,
  useSupportReportDraft,
} from './useSupportReportDraft';

const CREATED = { id: 'r1', state: 'NEW', createdAt: new Date() };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Call = { supportReportCreate: SupportReportCreate };

function fixture(
  behaviour: (call: Call, attempt: number) => Promise<unknown> = async () =>
    CREATED,
) {
  const createSupportReport = vi.fn((call: Call) =>
    behaviour(call, createSupportReport.mock.calls.length),
  );
  const api = { createSupportReport };
  const hook = renderHook(
    ({ accountId }) => useSupportReportDraft(accountId, { api }),
    { initialProps: { accountId: 'account-a' } },
  );
  return { api, createSupportReport, ...hook };
}

function setConnectivity(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

const problem = (status: number) =>
  new ResponseError(new Response(null, { status }));

beforeEach(() => {
  window.localStorage.clear();
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useSupportReportDraft', () => {
  it('sends_once_and_clears_the_draft_on_success', async () => {
    const { result, createSupportReport } = fixture();
    act(() => {
      result.current.setKind('FEEDBACK');
      result.current.setNote('  An idea  ');
    });
    expect(
      window.localStorage.getItem(supportReportDraftStorageKey('account-a')),
    ).toContain('An idea');
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('sent');
    expect(createSupportReport).toHaveBeenCalledTimes(1);
    const body = createSupportReport.mock.calls[0][0].supportReportCreate;
    expect(body.kind).toBe('FEEDBACK');
    expect(body.note).toBe('An idea');
    expect(body.clientRequestId).toMatch(UUID);
    expect(
      window.localStorage.getItem(supportReportDraftStorageKey('account-a')),
    ).toBeNull();
    expect(result.current.note).toBe('');
  });

  it('attaches_the_given_failure_only_to_a_problem', async () => {
    const { result, createSupportReport } = fixture();
    const failure = { reference: 'GET:/api/v1/x:500:web' };
    await act(async () => {
      await result.current.send({ failure });
    });
    expect(
      createSupportReport.mock.calls[0][0].supportReportCreate.failure,
    ).toEqual(failure);
  });

  it('keeps_the_draft_per_account_and_restores_it', () => {
    const first = fixture();
    act(() => first.result.current.setNote('For account A'));
    first.unmount();
    const again = fixture();
    expect(again.result.current.note).toBe('For account A');
    again.rerender({ accountId: 'account-b' });
    expect(again.result.current.note).toBe('');
    again.rerender({ accountId: 'account-a' });
    expect(again.result.current.note).toBe('For account A');
  });

  it('works_without_usable_storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const { result, createSupportReport } = fixture();
    act(() => result.current.setNote('Without storage'));
    expect(result.current.note).toBe('Without storage');
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('sent');
    expect(createSupportReport).toHaveBeenCalledTimes(1);
  });

  it('offline_send_is_queued_and_retried_once_online_with_same_request_id', async () => {
    const { result, createSupportReport } = fixture();
    act(() => result.current.setNote('Offline Problem'));
    setConnectivity(false);
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('queued');
    expect(createSupportReport).not.toHaveBeenCalled();
    const queuedId = JSON.parse(
      window.localStorage.getItem(supportReportDraftStorageKey('account-a')) ??
        '{}',
    ).clientRequestId;
    expect(queuedId).toMatch(UUID);

    setConnectivity(true);
    await waitFor(() => expect(result.current.status).toBe('sent'));
    expect(createSupportReport).toHaveBeenCalledTimes(1);
    expect(
      createSupportReport.mock.calls[0][0].supportReportCreate.clientRequestId,
    ).toBe(queuedId);

    // Going offline and online again later sends nothing more.
    setConnectivity(false);
    setConnectivity(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);
  });

  it('a_network_error_queues_and_the_retry_reuses_the_request_id', async () => {
    let attempt = 0;
    const { result, createSupportReport } = fixture(async () => {
      attempt += 1;
      if (attempt === 1) throw new FetchError(new TypeError('Failed to fetch'));
      return CREATED;
    });
    act(() => result.current.setNote('Netzwerk'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('queued');
    setConnectivity(false);
    setConnectivity(true);
    await waitFor(() => expect(result.current.status).toBe('sent'));
    const ids = createSupportReport.mock.calls.map(
      ([call]) => call.supportReportCreate.clientRequestId,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('429_sets_rateLimited_and_keeps_draft', async () => {
    const { result, createSupportReport } = fixture(async () => {
      throw problem(429);
    });
    act(() => result.current.setNote('Zu oft'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('rateLimited');
    expect(result.current.note).toBe('Zu oft');
    expect(
      window.localStorage.getItem(supportReportDraftStorageKey('account-a')),
    ).toContain('Zu oft');
    // No automatic retry, even when connectivity flaps.
    setConnectivity(false);
    setConnectivity(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);
  });

  it('5xx_sets_failed_without_loop', async () => {
    vi.useFakeTimers();
    try {
      const { result, createSupportReport } = fixture(async () => {
        throw problem(503);
      });
      act(() => result.current.setNote('Server kaputt'));
      await act(async () => {
        await result.current.send();
      });
      expect(result.current.status).toBe('failed');
      expect(result.current.note).toBe('Server kaputt');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10 * 60_000);
      });
      expect(createSupportReport).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retryNow_resends_with_the_same_request_id_after_a_failure', async () => {
    const { result, createSupportReport } = fixture(async (_call, attempt) => {
      if (attempt === 1) throw problem(500);
      return CREATED;
    });
    act(() => result.current.setNote('Nochmal'));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('failed');
    await act(async () => {
      await result.current.retryNow();
    });
    expect(result.current.status).toBe('sent');
    const [first, second] = createSupportReport.mock.calls.map(
      ([call]) => call.supportReportCreate.clientRequestId,
    );
    expect(first).toBe(second);
  });

  it('a_changed_note_after_an_attempt_gets_a_new_request_id', async () => {
    const { result, createSupportReport } = fixture(async (_call, attempt) => {
      if (attempt === 1) throw problem(500);
      return CREATED;
    });
    act(() => result.current.setNote('Eins'));
    await act(async () => {
      await result.current.send();
    });
    act(() => result.current.setNote('Zwei'));
    expect(result.current.status).toBe('idle');
    await act(async () => {
      await result.current.send();
    });
    const [first, second] = createSupportReport.mock.calls.map(
      ([call]) => call.supportReportCreate.clientRequestId,
    );
    expect(first).not.toBe(second);
  });

  it('never_sends_twice_concurrently', async () => {
    let release: (value: unknown) => void = () => undefined;
    const { result, createSupportReport } = fixture(
      () => new Promise((resolve) => (release = resolve)),
    );
    act(() => result.current.setNote('Einmal'));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.send();
      second = result.current.send();
    });
    expect(result.current.status).toBe('sending');
    expect(createSupportReport).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(CREATED);
      await Promise.all([first, second]);
    });
    expect(result.current.status).toBe('sent');
    expect(createSupportReport).toHaveBeenCalledTimes(1);
  });

  it('blank_feedback_is_rejected_before_sending', async () => {
    const { result, createSupportReport } = fixture();
    act(() => {
      result.current.setKind('FEEDBACK');
      result.current.setNote('   ');
    });
    await act(async () => {
      await result.current.send();
    });
    expect(createSupportReport).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.invalid).toBe('noteRequired');
  });

  it('the_note_limit_counts_characters_before_sending', async () => {
    const emoji = '\u{1F496}'.repeat(NOTE_MAX_CHARACTERS);
    const { result, createSupportReport } = fixture();
    act(() => {
      result.current.setKind('FEEDBACK');
      result.current.setNote(emoji);
    });
    expect(result.current.invalid).toBeUndefined();
    await act(async () => {
      await result.current.send();
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setKind('FEEDBACK');
      result.current.setNote(`${emoji}\u{1F496}`);
    });
    expect(result.current.invalid).toBe('noteTooLong');
    await act(async () => {
      await result.current.send();
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);
  });

  it('discard_clears_the_draft_and_cancels_a_queued_retry', async () => {
    const { result, createSupportReport } = fixture();
    act(() => result.current.setNote('Discard this'));
    setConnectivity(false);
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.status).toBe('queued');
    act(() => result.current.discard());
    expect(result.current.status).toBe('idle');
    expect(result.current.note).toBe('');
    expect(
      window.localStorage.getItem(supportReportDraftStorageKey('account-a')),
    ).toBeNull();
    setConnectivity(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(createSupportReport).not.toHaveBeenCalled();
  });
});
