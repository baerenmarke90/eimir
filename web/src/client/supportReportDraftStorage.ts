import { newIdempotencyKey } from './createRequestIdentity';
import type { FailureReference } from './failureReference';
import type { SupportReportKind } from './supportReport';
import { SUPPORT_REPORT_DRAFT_PREFIX } from './supportReportDraftCleanup';

/**
 * Local storage of the support report draft (#2189). It holds the person's
 * free text, so it is owner-local state: `clearStoredSession` removes every
 * draft on sign-out through `supportReportDraftCleanup`, so the session layer
 * wipes drafts without loading this codec or the support client.
 */
export interface SupportReportDraft {
  kind: SupportReportKind;
  note: string;
  clientRequestId: string;
  /** True once a send was tried, so an edit needs a new request identity. */
  attempted: boolean;
  /**
   * The failure attached at the first attempt. A retry of the same request
   * identity sends it again, wherever the sheet was reopened.
   */
  failure?: FailureReference;
}

export { clearSupportReportDrafts } from './supportReportDraftCleanup';

export function supportReportDraftStorageKey(accountId: string): string {
  return `${SUPPORT_REPORT_DRAFT_PREFIX}${accountId}`;
}

export function freshSupportReportDraft(): SupportReportDraft {
  return {
    kind: 'PROBLEM',
    note: '',
    clientRequestId: newIdempotencyKey(),
    attempted: false,
  };
}

function storedFailure(value: unknown): FailureReference | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { reference, requestId } = value as Partial<FailureReference>;
  if (typeof reference !== 'string' || !reference) return undefined;
  return typeof requestId === 'string' && requestId
    ? { reference, requestId }
    : { reference };
}

export function loadSupportReportDraft(accountId: string): SupportReportDraft {
  try {
    const raw = window.localStorage.getItem(
      supportReportDraftStorageKey(accountId),
    );
    const value = raw ? (JSON.parse(raw) as Partial<SupportReportDraft>) : null;
    if (
      value &&
      (value.kind === 'PROBLEM' || value.kind === 'FEEDBACK') &&
      typeof value.note === 'string' &&
      typeof value.clientRequestId === 'string' &&
      value.clientRequestId
    ) {
      const attempted = value.attempted === true;
      const failure = attempted ? storedFailure(value.failure) : undefined;
      return {
        kind: value.kind,
        note: value.note,
        clientRequestId: value.clientRequestId,
        attempted,
        ...(failure ? { failure } : {}),
      };
    }
  } catch {
    // Storage may be missing, blocked or hold something unreadable.
  }
  return freshSupportReportDraft();
}

export function saveSupportReportDraft(
  accountId: string,
  draft: SupportReportDraft | null,
): void {
  try {
    if (draft)
      window.localStorage.setItem(
        supportReportDraftStorageKey(accountId),
        JSON.stringify(draft),
      );
    else
      window.localStorage.removeItem(supportReportDraftStorageKey(accountId));
  } catch {
    // The draft then lives in memory only; sending still works.
  }
}
