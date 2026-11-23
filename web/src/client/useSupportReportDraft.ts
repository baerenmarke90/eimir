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

interface Draft {
  kind: SupportReportKind;
  note: string;
  clientRequestId: string;
  /** True once a send was tried, so an edit needs a new request identity. */
  attempted: boolean;
}

const STORAGE_PREFIX = 'eimir.supportReportDraft.v1.';

export function supportReportDraftStorageKey(accountId: string): string {
  return `${STORAGE_PREFIX}${accountId}`;
}

function freshDraft(): Draft {
  return {
    kind: 'PROBLEM',
    note: '',
    clientRequestId: newIdempotencyKey(),
    attempted: false,
  };
}

function loadDraft(accountId: string): Draft {
  try {
    const raw = window.localStorage.getItem(
      supportReportDraftStorageKey(accountId),
    );
    const value = raw ? (JSON.parse(raw) as Partial<Draft>) : null;
    if (
      value &&
      (value.kind === 'PROBLEM' || value.kind === 'FEEDBACK') &&
      typeof value.note === 'string' &&
      typeof value.clientRequestId === 'string' &&
      value.clientRequestId
    )
      return {
        kind: value.kind,
        note: value.note,
        clientRequestId: value.clientRequestId,
        attempted: value.attempted === true,
      };
  } catch {
    // Storage may be missing, blocked or hold something unreadable.
  }
  return freshDraft();
}

function saveDraft(accountId: string, draft: Draft | null): void {
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

/**
 * The offline-safe draft of one support report (#2189). Note, kind and the
 * `clientRequestId` live in local storage per account, so a send retried after
 * a reconnect is the same request and the server stores the report once. A
 * failed send keeps the draft and is never retried automatically.
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
      const changed = {
        ...current,
        ...change,
        // The server answers a repeated request identity with the first report,
        // so changed content after an attempt needs its own identity.
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
      if (!isClientOnline()) {
        commit({ ...current, attempted: true });
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
          failure: failureRef.current,
          clientContext: collectClientContext(),
          clientRequestId: current.clientRequestId,
        });
        commit({ ...current, attempted: true });
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
  };
}
