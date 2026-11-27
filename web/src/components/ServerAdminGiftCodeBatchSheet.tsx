import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServerAdminProApi } from '../api/generated/apis/ServerAdminProApi';
import type { GiftCodeBatchView } from '../api/generated/models/GiftCodeBatchView';
import type { GiftCodeView } from '../api/generated/models/GiftCodeView';
import {
  openGiftCodes,
  useGiftCodeBatch,
  useRevokeGiftCodeBatch,
  useSetGiftCodeHandedOut,
} from '../client/serverAdminPro';
import { postSnackbar } from '../client/snackbar';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ServerAdminSheet } from './ServerAdminSheet';
import { shortSpaceId } from './ServerAdminSpaceFile';
import { sectionHref } from './serverAdminAreas';
import { UiState } from './UiState';
import './ServerAdminProPanel.css';

/** Writes `text` to the clipboard and confirms it with the shared snackbar. */
async function copyToClipboard(
  text: string,
  messageKey: string,
  messageOptions?: Record<string, unknown>,
) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('No clipboard');
    await navigator.clipboard.writeText(text);
    postSnackbar(messageKey, messageOptions);
  } catch {
    postSnackbar('serverAdmin.pro.batch.copyFailed');
  }
}

export function batchIsExpired(
  batch: Pick<GiftCodeBatchView, 'revokedAt' | 'redeemableUntil'>,
  at = new Date(),
): boolean {
  return batch.revokedAt === null && batch.redeemableUntil < at;
}

function CodeRow({
  code,
  pending,
  onCopy,
  onHandedOut,
}: {
  code: GiftCodeView;
  pending: boolean;
  onCopy: () => void;
  onHandedOut: (handedOut: boolean) => void;
}) {
  const { t } = useTranslation();
  const codeId = `server-admin-gift-code-${code.id}`;
  const day = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  });

  if (code.state === 'open' || code.state === 'handed_out') {
    const handedOut = code.state === 'handed_out';
    return (
      <li className="server-admin-pro-code">
        <code id={codeId}>{code.code}</code>
        <div className="server-admin-pro-code-actions">
          <button
            type="button"
            className="server-admin-pro-quiet"
            aria-describedby={codeId}
            onClick={onCopy}
          >
            {t('serverAdmin.pro.batch.copy')}
          </button>
          <button
            type="button"
            className="server-admin-pro-toggle"
            aria-pressed={handedOut}
            aria-describedby={codeId}
            disabled={pending}
            onClick={() => onHandedOut(!handedOut)}
          >
            {handedOut ? <EimirIcon name="check" /> : null}
            {t('serverAdmin.pro.batch.handedOut')}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className={`server-admin-pro-code is-${code.state}`}>
      <code id={codeId}>{code.code}</code>
      <span className="server-admin-pro-code-state">
        {code.state === 'redeemed' ? (
          <>
            {code.redeemedAt
              ? t('serverAdmin.pro.batch.redeemedOn', {
                  date: day.format(code.redeemedAt),
                })
              : t('serverAdmin.pro.batch.redeemed')}
            {code.redeemedSpaceId ? (
              <>
                {' · '}
                <Link
                  to={sectionHref('spaces', { space: code.redeemedSpaceId })}
                  aria-label={t('serverAdmin.pro.gifts.openSpace', {
                    id: shortSpaceId(code.redeemedSpaceId),
                  })}
                >
                  {shortSpaceId(code.redeemedSpaceId)}
                </Link>
              </>
            ) : null}
          </>
        ) : code.state === 'revoked' ? (
          t('serverAdmin.pro.batch.revoked')
        ) : (
          t('serverAdmin.pro.batch.expired')
        )}
      </span>
    </li>
  );
}

/**
 * One gift code batch in the shared ServerAdmin sheet: copy codes, mark them
 * as handed out, and revoke the unredeemed ones after a confirmation.
 */
export function ServerAdminGiftCodeBatchSheet({
  api,
  batchId,
  onClose,
}: {
  api: ServerAdminProApi;
  batchId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = useGiftCodeBatch(api, batchId);
  const handedOut = useSetGiftCodeHandedOut(api);
  const revoke = useRevokeGiftCodeBatch(api, batchId);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const revokeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmOpened = useRef(false);
  const metaRef = useRef<HTMLDivElement>(null);
  const batch = query.data;
  const day = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  });

  // The confirmation takes the place of its trigger, so focus follows it in
  // both directions instead of falling back to the sheet.
  useEffect(() => {
    if (confirmingRevoke) {
      confirmOpened.current = true;
      cancelRef.current?.focus();
    } else if (confirmOpened.current) {
      confirmOpened.current = false;
      revokeRef.current?.focus();
    }
  }, [confirmingRevoke]);

  const title = batch
    ? t('serverAdmin.pro.codes.batchTitle', {
        count: batch.total,
        duration: t('serverAdmin.giftSheet.months', {
          count: batch.durationMonths,
        }),
      })
    : t('serverAdmin.pro.batch.fallbackTitle');

  const revoked = batch ? batch.revokedAt !== null : false;
  const expired = batch ? batchIsExpired(batch) : false;
  const unredeemed = batch ? batch.open + batch.handedOut : 0;
  const open = batch ? openGiftCodes(batch) : [];
  const failed = handedOut.isError || revoke.isError;

  return (
    <ServerAdminSheet
      titleId="server-admin-gift-code-batch-title"
      title={title}
      busy={revoke.isPending}
      onClose={onClose}
    >
      {query.isPending ? (
        <UiState
          kind="loading"
          title={t('serverAdmin.states.loadingTitle')}
          body={t('serverAdmin.states.loadingBody')}
        />
      ) : query.error || !batch ? (
        <UiState
          kind="error"
          title={t('serverAdmin.states.errorTitle')}
          body={t('serverAdmin.states.errorBody')}
          action={
            <button type="button" onClick={() => void query.refetch()}>
              {t('serverAdmin.refresh')}
            </button>
          }
        />
      ) : (
        <>
          <div
            ref={metaRef}
            className="server-admin-pro-batch-meta"
            tabIndex={-1}
          >
            {batch.note ? <p>{batch.note}</p> : null}
            <p className="server-admin-sheet-note">
              {t('serverAdmin.pro.batch.redeemableUntil', {
                date: day.format(batch.redeemableUntil),
              })}
            </p>
            <p className="server-admin-sheet-note">
              {t('serverAdmin.pro.codes.batchCounts', {
                open: batch.open,
                handedOut: batch.handedOut,
                redeemed: batch.redeemed,
              })}
              {revoked || expired ? (
                <>
                  {' · '}
                  <span className="server-admin-pro-state">
                    {t(
                      revoked
                        ? 'serverAdmin.pro.batch.revoked'
                        : 'serverAdmin.pro.batch.expired',
                    )}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          {open.length > 0 ? (
            <button
              type="button"
              className="server-admin-pro-quiet server-admin-pro-wide"
              onClick={() =>
                void copyToClipboard(
                  open.join('\n'),
                  'serverAdmin.pro.batch.copiedAll',
                  { count: open.length },
                )
              }
            >
              {t('serverAdmin.pro.batch.copyAll')}
            </button>
          ) : null}

          <ul
            className="server-admin-pro-codes-list"
            aria-label={t('serverAdmin.pro.batch.codesAria')}
          >
            {batch.codes.map((code) => (
              <CodeRow
                key={code.id}
                code={code}
                pending={
                  handedOut.isPending && handedOut.variables?.codeId === code.id
                }
                onCopy={() =>
                  void copyToClipboard(
                    code.code,
                    'serverAdmin.pro.batch.copied',
                  )
                }
                onHandedOut={(value) =>
                  handedOut.mutate({ codeId: code.id, handedOut: value })
                }
              />
            ))}
          </ul>

          {failed ? (
            <p className="status status-error" role="alert">
              {t('serverAdmin.pro.batch.failed')}
            </p>
          ) : null}

          {!revoked && unredeemed > 0 ? (
            confirmingRevoke ? (
              <div className="server-admin-pro-revoke-confirm">
                <p id="server-admin-gift-code-revoke-text">
                  {t('serverAdmin.pro.batch.revokeConfirm')}
                </p>
                <div className="server-admin-sheet-actions">
                  <button
                    ref={cancelRef}
                    type="button"
                    className="server-admin-pro-quiet"
                    disabled={revoke.isPending}
                    onClick={() => setConfirmingRevoke(false)}
                  >
                    {t('serverAdmin.pro.batch.revokeCancel')}
                  </button>
                  <button
                    type="button"
                    className="server-admin-pro-danger"
                    aria-describedby="server-admin-gift-code-revoke-text"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(undefined, {
                        onSuccess: () => {
                          // The action is gone now; the updated counts say
                          // what happened.
                          confirmOpened.current = false;
                          setConfirmingRevoke(false);
                          metaRef.current?.focus();
                        },
                      })
                    }
                  >
                    {t('serverAdmin.pro.batch.revokeConfirmAction')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={revokeRef}
                type="button"
                className="server-admin-pro-quiet-danger"
                onClick={() => setConfirmingRevoke(true)}
              >
                {t('serverAdmin.pro.batch.revokeOpen')}
              </button>
            )
          ) : null}
        </>
      )}
    </ServerAdminSheet>
  );
}
