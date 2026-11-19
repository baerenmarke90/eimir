import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { WishesApi } from '../api/generated/apis/WishesApi';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import {
  dateTimeFromInput,
  localDateTimeInput,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';

function presetDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return localDateTimeInput(date);
}

/**
 * The personal reminder for a wish. The page's actions menu owns the entry
 * point: the menu opens this sheet through `open` and learns the saved time
 * through `onSavedChange`, so no button or status line sits on the page.
 */
export function WishReminderAction({
  accountId,
  apiBaseUrl,
  spaceId,
  wishId,
  api,
  open,
  onOpenChange,
  onSavedChange,
  restoreFocusRef,
}: {
  accountId: string;
  apiBaseUrl: string;
  spaceId: string;
  wishId: string;
  api: WishesApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSavedChange?: (saved: Date | null) => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const client = useQueryClient();
  const setOpen = onOpenChange;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const online = useSyncExternalStore(
    onlineManager.subscribe,
    isClientOnline,
    () => true,
  );
  const params = { spaceId, wishId };
  const key = [
    'personal-wish-reminder',
    apiBaseUrl,
    accountId,
    spaceId,
    wishId,
  ];
  const reminder = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api
        .getPersonalWishReminder(params, { signal, cache: 'no-store' })
        .catch(async (error) => {
          throw await normalizeClientError(error);
        }),
    retry: false,
    gcTime: 0,
  });
  const saved = reminder.data?.dueAt ?? null;
  const dateTime = draft ?? (saved ? localDateTimeInput(saved) : presetDate(1));
  const write = useMutation({
    networkMode: 'always',
    mutationFn: async (dueAt: Date | null) => {
      const current = captureAuthorizedQuery(client, key);
      await client.cancelQueries({ queryKey: key, exact: true });
      if (!current()) throw new Error('Wish reminder owner changed.');
      assertOnlineWrite();
      try {
        const result = dueAt
          ? await api.setPersonalWishReminder({
              ...params,
              personalWishReminderUpdate: { dueAt },
            })
          : await api
              .clearPersonalWishReminder(params)
              .then(() => ({ dueAt: null }));
        if (current()) {
          client.setQueryData(key, result);
          setOpen(false);
        }
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const prefix = 'm5s3.wish.reminder' as const;

  // Every opening starts from the saved time (or tomorrow) with a clean form.
  const opened = useRef(false);
  useEffect(() => {
    if (open && !opened.current) {
      write.reset();
      setInvalid(false);
      setDraft(null);
    }
    opened.current = open;
  }, [open, write]);

  const savedTime = saved?.getTime() ?? null;
  useEffect(() => {
    onSavedChange?.(savedTime === null ? null : new Date(savedTime));
  }, [savedTime, onSavedChange]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || write.isPending || !reminder.data) return;
    const date = dateTimeFromInput(dateTime);
    if (
      !date ||
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= Date.now() ||
      localDateTimeInput(date) !== dateTime
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    write.mutate(date);
  }

  return (
    <>
      <ShortTaskSheet
        open={open}
        title={t(`${prefix}.action`)}
        onClose={() => setOpen(false)}
        isCloseBlocked={write.isPending}
        restoreFocusRef={restoreFocusRef}
      >
        <p>{t(`${prefix}.privacy`)}</p>
        {!online ? <p role="status">{t(`${prefix}.offline`)}</p> : null}
        {reminder.isPending && online ? (
          <p role="status">{t('m5s5.reminderDetail.loading')}</p>
        ) : null}
        {reminder.isError && online ? (
          <ProblemState
            error={reminder.error}
            onRetry={() => void reminder.refetch()}
          />
        ) : null}
        {reminder.data ? (
          <form className="form-grid" onSubmit={submit}>
            <div className="form-actions">
              {[
                { days: 1, key: 'tomorrow' },
                { days: 7, key: 'nextWeek' },
              ].map(({ days, key }) => (
                <button
                  key={key}
                  type="button"
                  className="secondary"
                  disabled={write.isPending}
                  onClick={() => {
                    setDraft(presetDate(days));
                    setInvalid(false);
                  }}
                >
                  {t(`${prefix}.${key}`)}
                </button>
              ))}
            </div>
            <label htmlFor={id}>{t(`${prefix}.when`)}</label>
            <input
              id={id}
              type="datetime-local"
              required
              disabled={write.isPending}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
              value={dateTime}
              onChange={(event) => {
                setDraft(event.target.value);
                setInvalid(false);
              }}
            />
            {invalid ? (
              <p role="alert" id={`${id}-error`}>
                {t(`${prefix}.invalid`)}
              </p>
            ) : null}
            {write.error ? <ProblemState error={write.error} /> : null}
            <div className="form-actions">
              <button
                type="submit"
                className="primary"
                disabled={!online || write.isPending}
              >
                {t(write.isPending ? `${prefix}.saving` : `${prefix}.save`)}
              </button>
              {saved ? (
                <button
                  type="button"
                  className="tertiary"
                  disabled={!online || write.isPending}
                  onClick={() => write.mutate(null)}
                >
                  {t(`${prefix}.remove`)}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </ShortTaskSheet>
    </>
  );
}
