import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminEntitlementGrantView } from '../api/generated/models/ServerAdminEntitlementGrantView';
import { resolvedLocale, useTranslation } from '../i18n';
import { ServerAdminSheet } from './ServerAdminSheet';

export const GIFT_MONTHS = [1, 3, 6, 12] as const;

export function giftEnd(months: number, from = new Date()): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + months);
  return end;
}

/** An active Premium gift from ServerAdmin, if the Space has one. */
export function activeGift(
  grants: ServerAdminEntitlementGrantView[],
  at = new Date(),
): ServerAdminEntitlementGrantView | null {
  return (
    grants.find(
      (grant) =>
        grant.sourceType === 'ADMIN_GRANT' &&
        grant.status === 'ACTIVE' &&
        (grant.effectiveUntil === null || grant.effectiveUntil > at),
    ) ?? null
  );
}

export function ServerAdminPremiumGiftSheet({
  api,
  spaceId,
  grants,
  onSaved,
  onClose,
}: {
  api: ServerAdminApi;
  spaceId: string;
  grants: ServerAdminEntitlementGrantView[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [months, setMonths] = useState<number>(3);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const current = activeGift(grants);
  const dateFormat = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  });

  const grant = useMutation({
    mutationFn: () =>
      api.grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost(
        {
          spaceId,
          serverAdminEntitlementGrantRequest: {
            reason: reason.trim(),
            effectiveUntil: giftEnd(months),
          },
        },
      ),
    onSuccess: onSaved,
    onError: () => setError(t('serverAdmin.giftSheet.failed')),
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) =>
      api.revokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePost(
        {
          spaceId,
          grantId,
          serverAdminEntitlementRevokeRequest: {
            reason: reason.trim() || 'ended by operator',
          },
        },
      ),
    onSuccess: onSaved,
    onError: () => setError(t('serverAdmin.giftSheet.failed')),
  });
  const busy = grant.isPending || revoke.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || busy) return;
    setError(null);
    grant.mutate();
  }

  return (
    <ServerAdminSheet
      titleId="server-admin-gift-sheet-title"
      title={t('serverAdmin.giftSheet.title')}
      busy={busy}
      onClose={onClose}
      initialFocusRef={selectRef}
    >
      {current ? (
        <div className="server-admin-gift-current">
          <p>
            {current.effectiveUntil
              ? t('serverAdmin.giftSheet.currentUntil', {
                  date: dateFormat.format(current.effectiveUntil),
                })
              : t('serverAdmin.giftSheet.currentOpen')}
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setError(null);
              revoke.mutate(current.id);
            }}
          >
            {t('serverAdmin.giftSheet.end')}
          </button>
        </div>
      ) : null}
      <form onSubmit={submit}>
        <div className="server-admin-sheet-field">
          <label htmlFor="server-admin-gift-duration">
            {t('serverAdmin.giftSheet.duration')}
          </label>
          <select
            id="server-admin-gift-duration"
            ref={selectRef}
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
          >
            {GIFT_MONTHS.map((value) => (
              <option key={value} value={value}>
                {t('serverAdmin.giftSheet.months', { count: value })}
              </option>
            ))}
          </select>
          <span className="server-admin-muted">
            {t('serverAdmin.giftSheet.endsOn', {
              date: dateFormat.format(giftEnd(months)),
            })}
          </span>
        </div>
        <div className="server-admin-sheet-field">
          <label htmlFor="server-admin-gift-reason">
            {t('serverAdmin.giftSheet.reason')}
          </label>
          <input
            id="server-admin-gift-reason"
            type="text"
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <span className="server-admin-muted">
            {t('serverAdmin.giftSheet.reasonHint')}
          </span>
        </div>
        {error ? (
          <p className="status status-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="server-admin-sheet-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={!reason.trim() || busy}
          >
            {t('serverAdmin.giftSheet.give')}
          </button>
        </div>
      </form>
    </ServerAdminSheet>
  );
}
