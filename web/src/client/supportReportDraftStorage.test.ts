// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSupportReportDrafts,
  loadSupportReportDraft,
  saveSupportReportDraft,
  supportReportDraftStorageKey,
} from './supportReportDraftStorage';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('supportReportDraftStorage', () => {
  it('clears_the_drafts_of_every_account_and_nothing_else', () => {
    for (const account of ['account-a', 'account-b'])
      saveSupportReportDraft(account, {
        kind: 'PROBLEM',
        note: `Private note of ${account}`,
        clientRequestId: `id-${account}`,
        attempted: false,
      });
    window.localStorage.setItem('eimir.other', 'kept');

    clearSupportReportDrafts();

    expect(
      window.localStorage.getItem(supportReportDraftStorageKey('account-a')),
    ).toBeNull();
    expect(
      window.localStorage.getItem(supportReportDraftStorageKey('account-b')),
    ).toBeNull();
    expect(window.localStorage.getItem('eimir.other')).toBe('kept');
  });

  it('clearing_tolerates_blocked_storage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => clearSupportReportDrafts()).not.toThrow();
  });

  it('keeps_the_failure_only_for_a_tried_draft', () => {
    const failure = { reference: 'GET:/api/v1/plans:500:web' };
    saveSupportReportDraft('account-a', {
      kind: 'PROBLEM',
      note: 'Tried',
      clientRequestId: 'id-1',
      attempted: true,
      failure,
    });
    expect(loadSupportReportDraft('account-a').failure).toEqual(failure);
    saveSupportReportDraft('account-a', {
      kind: 'PROBLEM',
      note: 'Untried',
      clientRequestId: 'id-2',
      attempted: false,
      failure,
    });
    expect(loadSupportReportDraft('account-a').failure).toBeUndefined();
  });
});
