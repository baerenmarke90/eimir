import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import { assertOnlineWrite } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PlanCollectionLinks.css';

/** Choose or independently create shared lists without leaving the parent draft. */
export function CollectionChoicePicker({
  apis,
  spaceId,
  value = [],
  excludedIds = [],
  disabled,
  onChoose,
  onPendingChange,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  value?: CollectionDetail[];
  excludedIds?: string[];
  disabled: boolean;
  onChoose: (items: CollectionDetail[]) => void | Promise<void>;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<CollectionDetail[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const inputId = useId();
  const capture = useTaskActivation(open, spaceId);
  const choices = useInfiniteQuery({
    queryKey: ['m5-s3', 'collections', spaceId, 'plan-choice'],
    enabled: open,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apis.collections.listCollections(
          { spaceId, scope: 'ALL', cursor: pageParam, limit: 100 },
          { signal },
        );
      } catch (failure) {
        throw await normalizeClientError(failure);
      }
    },
    getNextPageParam: (page, _pages, last, cursors) =>
      page.nextCursor &&
      page.nextCursor !== last &&
      !cursors.includes(page.nextCursor)
        ? page.nextCursor
        : undefined,
  });
  useEffect(() => {
    if (open && choices.hasNextPage && !choices.isFetching && !choices.error)
      void choices.fetchNextPage();
  }, [
    open,
    choices.hasNextPage,
    choices.isFetching,
    choices.error,
    choices.fetchNextPage,
  ]);
  const items = sortByProductLabel(
    [
      ...new Map(
        [
          ...value,
          ...created,
          ...(choices.data?.pages.flatMap((page) => page.items) ?? []),
        ].map((item) => [item.id, item]),
      ).values(),
    ].filter((item) => !excludedIds.includes(item.id)),
    (item) => item.title,
    resolvedLocale(),
  );
  const create = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (intent: { title: string; owns: () => boolean }) => {
      assertOnlineWrite();
      try {
        return await apis.collections.createCollection({
          spaceId,
          collectionCreate: { title: intent.title },
        });
      } catch (failure) {
        throw await normalizeClientError(failure);
      }
    },
    onSuccess: (list, intent) => {
      if (!intent.owns()) return;
      setCreated((previous) => [
        ...previous.filter((item) => item.id !== list.id),
        list,
      ]);
      setSelected((previous) => [...new Set([...previous, list.id])]);
      setTitle('');
      setCreating(false);
      void client.invalidateQueries({
        queryKey: ['m5-s3', 'collections', spaceId],
      });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const busy = create.isPending || linking;
  useEffect(() => {
    // The parent write guard must release the trigger before focus restoration.
    if (confirmed && !disabled && !busy) setOpen(false);
  }, [confirmed, disabled, busy]);
  useEffect(() => {
    onPendingChange?.(busy);
    return () => onPendingChange?.(false);
  }, [busy, onPendingChange]);
  const assembling =
    choices.isPending || choices.isFetching || choices.hasNextPage;
  async function confirm() {
    if (disabled || busy || inFlight.current) return;
    const owns = capture();
    inFlight.current = true;
    setLinking(true);
    setError(null);
    try {
      await onChoose(items.filter((item) => selected.includes(item.id)));
      if (owns()) setConfirmed(true);
    } catch (failure) {
      if (owns()) setError(failure);
    } finally {
      inFlight.current = false;
      if (owns()) setLinking(false);
    }
  }
  return (
    <>
      <AddActionButton
        ref={trigger}
        label={t('m5s3.collection.create')}
        icon="listen"
        disabled={disabled}
        onClick={() => {
          setSelected(value.map((item) => item.id));
          setConfirmed(false);
          setTitle('');
          setCreating(false);
          setError(null);
          create.reset();
          setOpen(true);
        }}
      />
      <ShortTaskSheet
        open={open}
        title={t('m5s3.collection.choose')}
        restoreFocusRef={trigger}
        isDirty={
          Boolean(title.trim()) ||
          selected.join() !== value.map((item) => item.id).join()
        }
        isCloseBlocked={busy}
        onClose={() => setOpen(false)}
      >
        <div className="plan-collection-picker">
          {assembling ? <p role="status">{t('states.loading.title')}</p> : null}
          {choices.error ? (
            <ProblemState
              error={choices.error}
              onRetry={() => void choices.refetch()}
            />
          ) : null}
          {!assembling && !choices.error && !items.length ? (
            <p>{t('m5s3.collection.noChoices')}</p>
          ) : null}
          {!assembling && !choices.error ? (
            <ul className="plan-collection-choices">
              {items.map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      disabled={busy}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, item.id]
                            : previous.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <span className="muted">
                        {t('m5s3.collection.progress', {
                          count: item.items.length,
                          completed: item.items.filter((row) => row.completed)
                            .length,
                        })}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <ProblemState error={error} /> : null}
          <button
            type="button"
            disabled={
              busy || disabled || Boolean(assembling) || Boolean(choices.error)
            }
            onClick={() => void confirm()}
          >
            {busy ? t('m5s3.common.saving') : t('m5s3.collection.link')}
          </button>
          {creating ? (
            <div className="field-group">
              <label htmlFor={inputId}>{t('m5s3.common.title')}</label>
              <input
                id={inputId}
                value={title}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
              />
              <AddActionButton
                label={t('m5s3.collection.createNew')}
                icon="listen"
                pending={create.isPending}
                disabled={busy || !title.trim()}
                onClick={() => {
                  if (inFlight.current || busy || !title.trim()) return;
                  inFlight.current = true;
                  create.mutate({ title: title.trim(), owns: capture() });
                }}
              />
              {create.error ? <ProblemState error={create.error} /> : null}
            </div>
          ) : (
            <AddActionButton
              label={t('m5s3.collection.createNew')}
              icon="listen"
              disabled={busy}
              onClick={() => setCreating(true)}
            />
          )}
        </div>
      </ShortTaskSheet>
    </>
  );
}
