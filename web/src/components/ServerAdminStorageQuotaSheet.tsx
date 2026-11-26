import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminSpaceStorage } from '../api/generated/models/ServerAdminSpaceStorage';
import { formatBytes } from '../client/formatBytes';
import { useTranslation } from '../i18n';
import { ServerAdminSheet } from './ServerAdminSheet';

const GIGABYTE = 1024 ** 3;
export const MIN_QUOTA_GB = 1;
export const MAX_QUOTA_GB = 1024;

function dateInputValue(value: Date | null | undefined): string {
  if (!value) return '';
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** The end of the chosen local day, so "until 31 Dec" includes that day. */
function endOfLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59);
}

export function ServerAdminStorageQuotaSheet({
  api,
  spaceId,
  storage,
  onSaved,
  onClose,
}: {
  api: ServerAdminApi;
  spaceId: string;
  storage: ServerAdminSpaceStorage;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialGb = Math.round(
    (storage.override?.quotaBytes ?? storage.quotaBytes ?? GIGABYTE) / GIGABYTE,
  );
  const [quotaGb, setQuotaGb] = useState(String(initialGb));
  const [until, setUntil] = useState(
    dateInputValue(storage.override?.effectiveUntil),
  );
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(quotaGb);
  const valid =
    Number.isInteger(parsed) &&
    parsed >= MIN_QUOTA_GB &&
    parsed <= MAX_QUOTA_GB;
  const belowUsage = valid && parsed * GIGABYTE < storage.usedBytes;

  const save = useMutation({
    mutationFn: () =>
      api.setServerAdminSpaceStorageQuota({
        spaceId,
        serverAdminStorageQuotaRequest: {
          quotaGb: parsed,
          effectiveUntil: until ? endOfLocalDay(until) : null,
        },
      }),
    onSuccess: onSaved,
    onError: () => setError(t('serverAdmin.quotaSheet.saveFailed')),
  });
  const clear = useMutation({
    mutationFn: () => api.clearServerAdminSpaceStorageQuota({ spaceId }),
    onSuccess: onSaved,
    onError: () => setError(t('serverAdmin.quotaSheet.saveFailed')),
  });
  const busy = save.isPending || clear.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setError(null);
    save.mutate();
  }

  return (
    <ServerAdminSheet
      titleId="server-admin-quota-sheet-title"
      title={t('serverAdmin.quotaSheet.title')}
      busy={busy}
      onClose={onClose}
      initialFocusRef={inputRef}
    >
      <p className="server-admin-muted">
        {storage.tierQuotaBytes !== null
          ? t('serverAdmin.quotaSheet.intro', {
              tier: formatBytes(storage.tierQuotaBytes),
              used: formatBytes(storage.usedBytes),
            })
          : null}
      </p>
      <form onSubmit={submit} noValidate>
        <div className="server-admin-sheet-field">
          <label htmlFor="server-admin-quota-amount">
            {t('serverAdmin.quotaSheet.amount')}
          </label>
          <input
            id="server-admin-quota-amount"
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={MIN_QUOTA_GB}
            max={MAX_QUOTA_GB}
            step={1}
            value={quotaGb}
            aria-invalid={!valid}
            aria-describedby="server-admin-quota-hint"
            onChange={(event) => setQuotaGb(event.target.value)}
          />
          <span id="server-admin-quota-hint" className="server-admin-muted">
            {t('serverAdmin.quotaSheet.range')}
          </span>
        </div>
        <div className="server-admin-sheet-field">
          <label htmlFor="server-admin-quota-until">
            {t('serverAdmin.quotaSheet.until')}
          </label>
          <input
            id="server-admin-quota-until"
            type="date"
            value={until}
            min={dateInputValue(new Date())}
            onChange={(event) => setUntil(event.target.value)}
          />
          <span className="server-admin-muted">
            {t('serverAdmin.quotaSheet.untilHint')}
          </span>
        </div>
        {belowUsage ? (
          <p className="server-admin-warning-panel" role="status">
            {t('serverAdmin.quotaSheet.belowUsage', {
              used: formatBytes(storage.usedBytes),
            })}
          </p>
        ) : null}
        {error ? (
          <p className="status status-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="server-admin-sheet-actions">
          {storage.override ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setError(null);
                clear.mutate();
              }}
            >
              {t('serverAdmin.quotaSheet.remove')}
            </button>
          ) : null}
          <button
            type="submit"
            className="primary-button"
            disabled={!valid || busy}
          >
            {t('serverAdmin.quotaSheet.save')}
          </button>
        </div>
      </form>
    </ServerAdminSheet>
  );
}
