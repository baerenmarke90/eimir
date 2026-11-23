/**
 * The storage prefix of support report drafts (#2189) and their removal on
 * sign-out. Apart from `supportReportDraftStorage` so the session layer can
 * wipe drafts at startup cost of a few lines, without the draft codec that
 * only the lazily loaded support sheet needs.
 */
export const SUPPORT_REPORT_DRAFT_PREFIX = 'eimir.supportReportDraft.v1.';

/** Remove the drafts of every account, for sign-out and account changes. */
export function clearSupportReportDrafts(): void {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(SUPPORT_REPORT_DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage may be missing or blocked; nothing was kept there then.
  }
}
