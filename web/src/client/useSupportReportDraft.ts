import { onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SupportApi } from '../api/generated/apis/SupportApi';
import type { SupportReportCreate } from '../api/generated/models/SupportReportCreate';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import { isClientOnline } from './connectivity';
import { newIdempotencyKey } from './createRequestIdentity';
import type { FailureReference } from './failureReference';
import { normalizeClientError } from './problemDetails';
import {
  buildSupportReport,
  checkSupportNote,
  collectClientContext,
  type SupportReportInputProblem,
  type SupportReportKind,
} from './supportReport';
import {
  freshSupportReportDraft as freshDraft,
  loadSupportReportDraft as loadDraft,
  type SupportReportDraft,
  saveSupportReportDraft as saveDraft,
} from './supportReportDraftStorage';

export type SupportReportStatus =
  | 'idle'
  | 'sending'
  | 'queued'
  | 'sent'
  | 'failed'
  | 'rateLimited';

/** What the hook needs from the generated client; replaceable in tests. */
export interface SupportReportSender {
  createSupportReport(request: {
    supportReportCreate: SupportReportCreate;
  }): Promise<unknown>;
}

export interface SendOptions {
  /** The failure shown where the sheet was opened; used for a problem only. */
  failure?: FailureReference;
}

type Draft = SupportReportDraft;

export { supportReportDraftStorageKey } from './supportReportDraftStorage';

/**
 * The offline-safe draft of one support report (#2189). Note, kind and the
 * `clientRequestId` live in local storage per account, so a send retried after
 * a reconnect is the same request and the server stores the report once. The
 * failure attached at the first attempt is stored with the draft and sent again
 * with that identity, wherever the sheet is reopened. A failed send keeps the
 * draft and is never retried automatically.
 */
export function useSupportReportDraft(
  accountId: string,
  options: { api?: SupportReportSender } = {},
) {
  const runtime = useApiRuntime();
  const injected = options.api;
  const api = useMemo<SupportReportSender | undefined>(
    () =>
      injected ??
      (runtime
        ? new SupportApi(
            new Configuration({
              basePath: runtime.apiBaseUrl,
              headers: { Authorization: `Bearer ${runtime.accessToken}` },
            }),
          )
        : undefined),
    [injected, runtime],
  );

  const [state, setState] = useState(() => ({
    accountId,
    draft: loadDraft(accountId),
  }));
  let { draft } = state;
  if (state.accountId !== accountId) {
    // Another account: read its own draft instead of showing the previous one.
    draft = loadDraft(accountId);
    setState({ accountId, draft });
  }
  const [status, setStatus] = useState<SupportReportStatus>('idle');

  const draftRef = useRef(draft);
  const accountRef = useRef(accountId);
  const apiRef = useRef(api);
  const failureRef = useRef<FailureReference | undefined>(undefined);
  const sendingRef = useRef(false);
  const generation = useRef(0);
  draftRef.current = draft;
  accountRef.current = accountId;
  apiRef.current = api;

  const commit = useCallback((next: Draft | null) => {
    const stored = next ?? freshDraft();
    draftRef.current = stored;
    saveDraft(accountRef.current, next);
    setState({ accountId: accountRef.current, draft: stored });
  }, []);

  const edit = useCallback(
    (change: Partial<Pick<Draft, 'kind' | 'note'>>) => {
      const current = draftRef.current;
      const { failure: _attached, ...rest } = current;
      const changed: Draft = {
        ...rest,
        ...change,
        // The server answers a repeated request identity with the first report,
        // so changed content after an attempt needs its own identity and takes
        // the failure of the next send instead of the stored one.
        ...(current.attempted
          ? { clientRequestId: newIdempotencyKey(), attempted: false }
          : {}),
      };
      commit(changed);
      generation.current += 1;
      setStatus((previous) => (previous === 'sending' ? previous : 'idle'));
    },
    [commit],
  );

  const attempt = useCallback(
    async (automatic: boolean): Promise<void> => {
      if (sendingRef.current) return;
      const account = accountRef.current;
      const current = draftRef.current;
      const { problem } = checkSupportNote(current.kind, current.note);
      if (problem) return;
      // A retry of the same request identity repeats the first attempt's
      // failure; the server would refuse the identity with another one.
      const failure = current.attempted ? current.failure : failureRef.current;
      const { failure: _previous, ...base } = current;
      const attempted: Draft = failure
        ? { ...base, attempted: true, failure }
        : { ...base, attempted: true };
      if (!isClientOnline()) {
        commit(attempted);
        setStatus('queued');
        return;
      }
      const sender = apiRef.current;
      sendingRef.current = true;
      const mine = generation.current;
      setStatus('sending');
      try {
        if (!sender) throw new Error('No API session for the support report');
        const payload = buildSupportReport({
          kind: current.kind,
          note: current.note,
          failure,
          clientContext: collectClientContext(),
          clientRequestId: current.clientRequestId,
        });
        commit(attempted);
        // 201 (stored) and 200 (the same request, already stored) both succeed.
        await sender.createSupportReport({ supportReportCreate: payload });
        if (accountRef.current === account) {
          commit(null);
          failureRef.current = undefined;
        }
        if (generation.current === mine) setStatus('sent');
      } catch (error) {
        if (generation.current !== mine || accountRef.current !== account)
          return;
        const problem = await normalizeClientError(error).catch(() => null);
        if (problem?.kind === 'rateLimit') setStatus('rateLimited');
        // A network error before any answer: wait for connectivity once. A
        // retry that fails this way again is reported instead of looping.
        else if (
          (problem?.kind === 'offline' || error instanceof TypeError) &&
          !automatic
        )
          setStatus('queued');
        else setStatus('failed');
      } finally {
        sendingRef.current = false;
      }
    },
    [commit],
  );

  // One retry when connectivity returns for a queued draft: the effect only
  // lives while the status is `queued` and removes itself on the first signal.
  useEffect(() => {
    if (status !== 'queued') return;
    let done = false;
    const retry = () => {
      if (done || !isClientOnline()) return;
      done = true;
      void attempt(true);
    };
    const unsubscribe = onlineManager.subscribe(retry);
    window.addEventListener('online', retry);
    return () => {
      done = true;
      unsubscribe();
      window.removeEventListener('online', retry);
    };
  }, [status, attempt]);

  const send = useCallback(
    (sendOptions?: SendOptions): Promise<void> => {
      if (sendOptions) failureRef.current = sendOptions.failure;
      return attempt(false);
    },
    [attempt],
  );
  const retryNow = useCallback(() => attempt(false), [attempt]);
  const discard = useCallback(() => {
    generation.current += 1;
    failureRef.current = undefined;
    commit(null);
    setStatus('idle');
  }, [commit]);

  const setKind = useCallback(
    (kind: SupportReportKind) => edit({ kind }),
    [edit],
  );
  const setNote = useCallback((note: string) => edit({ note }), [edit]);

  const invalid: SupportReportInputProblem | undefined = checkSupportNote(
    draft.kind,
    draft.note,
  ).problem;

  return {
    kind: draft.kind,
    setKind,
    note: draft.note,
    setNote,
    status,
    send,
    retryNow,
    discard,
    /** Why the current note cannot be sent yet, if it cannot. */
    invalid,
    /**
     * True once a send was tried; the draft then sends `attemptedFailure`
     * again instead of the failure of the screen it was reopened from.
     */
    attempted: draft.attempted,
    attemptedFailure: draft.attempted ? draft.failure : undefined,
  };
}
