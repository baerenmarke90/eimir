import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { WishesApi } from '../api/generated/apis/WishesApi';
import type { WishDateProposalState } from '../api/generated/models/WishDateProposalState';
import type { WishDateProposalWrite } from '../api/generated/models/WishDateProposalWrite';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { invalidateDashboard } from '../client/dashboardQueries';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { applyRouteEntryHandoff } from '../client/routeEntryHandoff';
import {
  dateTimeFromInput,
  localDateTimeInput,
} from '../client/sharedPlanning';
import { useDocumentLeaveGuard } from '../client/useDocumentLeaveGuard';
import { wishDateProposalQueryKey } from '../client/wishDateProposal';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';

type Command =
  | { action: 'send'; input: WishDateProposalWrite; proposalId?: string }
  | { action: 'accept' | 'decline' | 'withdraw'; proposalId: string };

export function WishDateProposalAction({
  accountId,
  apiBaseUrl,
  api,
  spaceId,
  wishId,
  online,
  writesPending,
  onAccept,
}: {
  accountId: string;
  apiBaseUrl: string;
  api: WishesApi;
  spaceId: string;
  wishId: string;
  online: boolean;
  writesPending: boolean;
  onAccept: (planId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const client = useQueryClient();
  const location = useLocation();
  const fieldId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef<WishDateProposalWrite | null>(null);
  const inFlight = useRef(false);
  const [editor, setEditor] = useState<{
    proposalId?: string;
    original: string;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<
    'sent' | 'declined' | 'withdrawn' | null
  >(null);
  const [invalid, setInvalid] = useState<'invalid' | 'sameTime' | null>(null);
  const args = { spaceId, wishId };
  const queryKey = wishDateProposalQueryKey(
    apiBaseUrl,
    accountId,
    spaceId,
    wishId,
  );
  const data = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api
        .getWishDateProposal(args, { signal, cache: 'no-store' })
        .catch(async (error) => {
          throw await normalizeClientError(error);
        }),
    enabled: online,
    retry: false,
    gcTime: 0,
    refetchInterval: (query) => (query.state.data?.proposal ? 30_000 : false),
    refetchOnWindowFocus: 'always',
  });
  const proposal = data.data?.proposal ?? null;
  const incoming = proposal?.recipientId === accountId;
  const canPropose = data.data?.canPropose ?? false;
  const canShow = Boolean(proposal || canPropose || data.isError || status);
  const notificationEntry =
    location.hash === '#terminvorschlag' ? location.key : null;
  const refreshProposal = data.refetch;
  useEffect(() => {
    if (online && notificationEntry !== null) {
      void refreshProposal({ cancelRefetch: false });
    }
  }, [notificationEntry, online, refreshProposal]);
  useEffect(() => {
    if (canShow && notificationEntry !== null)
      applyRouteEntryHandoff('#terminvorschlag');
  }, [canShow, notificationEntry]);

  const write = useMutation({
    mutationKey: ['wish-write', spaceId, wishId],
    networkMode: 'always',
    mutationFn: async (command: Command) => {
      const current = captureAuthorizedQuery(client, queryKey);
      try {
        await client.cancelQueries({ queryKey, exact: true });
        if (!current()) throw new Error('The Wish proposal scope changed.');
        assertOnlineWrite();
        let next: WishDateProposalState | undefined;
        if (command.action === 'send') {
          const payload = { ...args, wishDateProposalWrite: command.input };
          next = command.proposalId
            ? await api.counterWishDateProposal({
                ...payload,
                proposalId: command.proposalId,
              })
            : await api.createWishDateProposal(payload);
        } else {
          const target = { ...args, proposalId: command.proposalId };
          if (command.action === 'accept') {
            const { planId } = await api.acceptWishDateProposal(target);
            if (!current()) return;
            onAccept(planId);
            void Promise.all([
              client.invalidateQueries({
                queryKey: authorSummaryQueryKeys.wishDetail(spaceId, wishId),
              }),
              client.invalidateQueries({
                queryKey: ['m5-s3', 'wishes', spaceId],
              }),
              client.invalidateQueries({
                queryKey: ['m5-s3', 'plans', spaceId],
              }),
              invalidateDashboard(client, spaceId),
            ]);
            return;
          }
          if (command.action === 'decline')
            await api.declineWishDateProposal(target);
          else await api.withdrawWishDateProposal(target);
          next = { canPropose, proposal: null };
        }
        if (!current()) return;
        client.setQueryData(queryKey, next);
        setEditorOpen(false);
        setEditor(null);
        setStatus(
          command.action === 'send'
            ? 'sent'
            : command.action === 'decline'
              ? 'declined'
              : 'withdrawn',
        );
      } catch (error) {
        const problem = await normalizeClientError(error);
        if (current() && clientProblemKind(problem) === 'conflict') {
          setEditorOpen(false);
          setEditor(null);
          void client.invalidateQueries({ queryKey, exact: true });
          void client.invalidateQueries({
            queryKey: authorSummaryQueryKeys.wishDetail(spaceId, wishId),
          });
        }
        throw problem;
      } finally {
        inFlight.current = false;
      }
    },
  });

  useDocumentLeaveGuard(
    canShow &&
      editorOpen &&
      (write.isPending || Boolean(editor && draft !== editor.original)),
  );

  function run(command: Command) {
    if (!online || writesPending || inFlight.current) return;
    inFlight.current = true;
    setStatus(null);
    write.mutate(command);
  }

  function openEditor() {
    const proposalId = incoming ? proposal?.id : undefined;
    const original = proposalId
      ? localDateTimeInput(proposal?.plannedStart)
      : '';
    if (!editor || editor.proposalId !== proposalId) {
      setDraft(original);
      request.current = null;
    }
    write.reset();
    setInvalid(null);
    setEditor({ original, proposalId });
    // Each opening gets its own sheet history entry; keep the draft in the Wish.
    setEditorSession((session) => session + 1);
    setEditorOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const plannedStart = dateTimeFromInput(draft);
    if (
      !plannedStart ||
      !Number.isFinite(plannedStart.getTime()) ||
      plannedStart.getTime() <= Date.now() ||
      localDateTimeInput(plannedStart) !== draft
    ) {
      setInvalid('invalid');
      return;
    }
    if (editor.proposalId && draft === editor.original) {
      setInvalid('sameTime');
      return;
    }
    if (request.current?.plannedStart.getTime() !== plannedStart.getTime()) {
      request.current = { plannedStart, clientRequestId: crypto.randomUUID() };
    }
    run({
      action: 'send',
      input: request.current,
      proposalId: editor.proposalId,
    });
  }

  if (!online && !data.data)
    return <p role="status">{t('wishDateProposal.offline')}</p>;
  if (online && data.isPending)
    return <p role="status">{t('wishDateProposal.loading')}</p>;
  if (!canShow) return null;

  const sender = proposal && nicknameFor(proposal.proposedBy);
  const proposalHeading = proposal?.counter
    ? sender
      ? t('wishDateProposal.counterFrom', { name: sender })
      : t('wishDateProposal.counterAnonymous')
    : sender
      ? t('wishDateProposal.incoming', { name: sender })
      : t('wishDateProposal.incomingAnonymous');
  const disabled = !online || writesPending || write.isPending || data.isError;
  const writeError =
    write.error &&
    (clientProblemKind(write.error) === 'conflict' ? (
      <p role="alert">{t('wishDateProposal.changed')}</p>
    ) : (
      <ProblemState error={write.error} />
    ));

  return (
    <section
      id="terminvorschlag"
      aria-label={t('wishDateProposal.action')}
      // A bare "propose a date" action stands without a box; only a running
      // proposal, which has its own text and answers, sits in one.
      className={`wish-date-proposal page-reading${proposal ? ' planning-subsection' : ''}`}
    >
      {data.isError ? (
        <ProblemState error={data.error} onRetry={() => void data.refetch()} />
      ) : proposal ? (
        <>
          <h3>{incoming ? proposalHeading : t('wishDateProposal.waiting')}</h3>
          <p className="wish-date-proposal-date">
            <time dateTime={proposal.plannedStart.toISOString()}>
              {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(proposal.plannedStart)}
            </time>
          </p>
          {incoming ? (
            <div className="form-actions wish-date-proposal-actions">
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  run({ action: 'accept', proposalId: proposal.id })
                }
              >
                {t('wishDateProposal.accept')}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={openEditor}
                ref={trigger}
              >
                {t('wishDateProposal.counter')}
              </button>
              <button
                type="button"
                className="tertiary"
                disabled={disabled}
                onClick={() =>
                  run({ action: 'decline', proposalId: proposal.id })
                }
              >
                {t('wishDateProposal.decline')}
              </button>
            </div>
          ) : (
            <>
              <p>{t('wishDateProposal.waitingForReply')}</p>
              <button
                type="button"
                className="tertiary"
                disabled={disabled}
                onClick={() =>
                  run({ action: 'withdraw', proposalId: proposal.id })
                }
              >
                {t('wishDateProposal.withdraw')}
              </button>
            </>
          )}
        </>
      ) : canPropose ? (
        <AddActionButton
          ref={trigger}
          label={t('wishDateProposal.action')}
          icon="kalender"
          disabled={disabled}
          onClick={openEditor}
        />
      ) : null}
      {!online ? <p role="status">{t('wishDateProposal.offline')}</p> : null}
      {write.isPending ? <p role="status">{t('common.saving')}</p> : null}
      {status ? <p role="status">{t(`wishDateProposal.${status}`)}</p> : null}
      {!editorOpen ? writeError : null}
      <ShortTaskSheet
        key={editorSession}
        open={editorOpen}
        title={t(
          editor?.proposalId
            ? 'wishDateProposal.counter'
            : 'wishDateProposal.action',
        )}
        onClose={() => setEditorOpen(false)}
        isCloseBlocked={write.isPending}
        restoreFocusRef={trigger}
      >
        <form onSubmit={submit} className="form-grid">
          <label htmlFor={fieldId}>{t('wishDateProposal.when')}</label>
          <input
            id={fieldId}
            type="datetime-local"
            value={draft}
            required
            disabled={write.isPending}
            aria-invalid={invalid !== null || undefined}
            aria-describedby={invalid ? `${fieldId}-error` : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(null);
            }}
          />
          {invalid ? (
            <p id={`${fieldId}-error`} role="alert">
              {t(`wishDateProposal.${invalid}`)}
            </p>
          ) : null}
          {writeError}
          <div className="form-actions">
            <button type="submit" disabled={disabled}>
              {t(
                editor?.proposalId
                  ? 'wishDateProposal.sendCounter'
                  : 'wishDateProposal.send',
              )}
            </button>
          </div>
        </form>
      </ShortTaskSheet>
    </section>
  );
}
