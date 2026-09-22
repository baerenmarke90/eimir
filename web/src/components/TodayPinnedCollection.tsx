import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { normalizeClientError } from '../client/problemDetails';
import { collectionDetailPath } from '../client/routes';
import { planningIfMatch } from '../client/sharedPlanning';
import { sharedAchievementKind } from '../client/sharedAchievements';
import { postSnackbar } from '../client/snackbar';
import { useTranslation } from '../i18n';
import { ChecklistToggle } from './ChecklistToggle';
import { SharedAchievementCelebration } from './SharedAchievementCelebration';

const CELEBRATION_DISMISS_MS = 3_600;

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function TodayPinnedCollection({
  api,
  accountId,
  spaceId,
  collection,
  sharedAchievementsEnabled = false,
  onRefresh,
}: {
  api: CollectionsApi;
  accountId: string;
  spaceId: string;
  collection: CollectionDetail;
  sharedAchievementsEnabled?: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const celebrationScope = `${accountId}:${spaceId}:${collection.id}`;
  const [celebratedScope, setCelebratedScope] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const showSharedAchievement =
    sharedAchievementsEnabled && celebratedScope === celebrationScope;

  const sortedItems = [...collection.items].sort(
    (left, right) => left.position - right.position,
  );
  const todayItems = [
    ...sortedItems.filter((item) => !item.completed),
    ...sortedItems.filter((item) => item.completed),
  ];
  const items = expanded ? todayItems : todayItems.slice(0, 4);
  const remaining = Math.max(0, todayItems.length - items.length);
  const canExpand = todayItems.length > 4;

  useEffect(() => {
    setExpanded(false);
    setCelebratedScope(null);
  }, [celebrationScope]);

  useEffect(() => {
    if (!showSharedAchievement) return;
    const timer = setTimeout(
      () => setCelebratedScope((scope) => (scope === celebrationScope ? null : scope)),
      CELEBRATION_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [celebrationScope, showSharedAchievement]);

  const toggleItem = useMutation({
    mutationFn: (item: CollectionItemDetail) =>
      apiCall(async () => {
        const response = await api.updateCollectionItemRaw({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: planningIfMatch(item),
          collectionItemUpdate: { completed: !item.completed },
        });
        await response.value();
        return sharedAchievementKind(response.raw);
      }),
    onSuccess: async (achievement) => {
      await onRefresh();
      if (sharedAchievementsEnabled && achievement === 'collection-completed') {
        setCelebratedScope(celebrationScope);
        postSnackbar('m5s5.today.pinnedCollection.sharedAchievementConfirmed', {
          title: collection.title,
        });
      } else {
        setCelebratedScope(null);
      }
    },
    onError: () => postSnackbar('m5s5.common.error'),
  });

  const createItem = useMutation({
    mutationFn: (title: string) =>
      apiCall(() =>
        api.createCollectionItem({
          spaceId,
          collectionId: collection.id,
          collectionItemCreate: { title },
        }),
      ),
    onSuccess: async () => {
      await onRefresh();
    },
    onError: () => postSnackbar('m5s5.common.error'),
  });

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get('title') ?? '').trim();
    if (!title) return;
    createItem.mutate(title, {
      onSuccess: () => form.reset(),
    });
  }

  return (
    <div className="today-pinned-list">
      {showSharedAchievement ? (
        <SharedAchievementCelebration
          centered
          headingLevel={3}
          title={t('m5s5.today.pinnedCollection.sharedAchievementTitle')}
          body={t('m5s5.today.pinnedCollection.sharedAchievementBody', {
            title: collection.title,
          })}
          action={
            <Link
              className="shared-achievement-cta"
              to={collectionDetailPath(collection.id)}
            >
              {t('m5s5.today.pinnedCollection.sharedAchievementAction')}
              <span className="shared-achievement-cta-arrow" aria-hidden="true">
                ›
              </span>
            </Link>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="today-pinned-list-items">
          {items.map((item) => (
            <li
              key={item.id}
              className={item.completed ? 'is-completed' : undefined}
            >
              <ChecklistToggle
                completed={item.completed}
                label={
                  item.completed
                    ? t('m5s3.collection.markOpen', { title: item.title })
                    : t('m5s3.collection.markDone', { title: item.title })
                }
                disabled={!item.capabilities.canEdit || toggleItem.isPending}
                onToggle={() => toggleItem.mutate(item)}
              />
              <span className="today-pinned-list-title">{item.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="today-pinned-list-empty">
          {t('m5s5.today.pinnedCollection.empty')}
        </p>
      )}

      {canExpand ? (
        <button
          type="button"
          className="today-pinned-list-disclosure"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t('m5s5.today.pinnedCollection.showLess')
            : t('m5s5.today.pinnedCollection.showMore', { count: remaining })}
        </button>
      ) : null}

      {collection.capabilities.canEdit ? (
        <form className="today-pinned-list-add" onSubmit={submitItem}>
          <label className="sr-only" htmlFor="today-pinned-list-new-item">
            {t('m5s5.today.pinnedCollection.addPlaceholder')}
          </label>
          <input
            id="today-pinned-list-new-item"
            name="title"
            maxLength={200}
            required
            placeholder={t('m5s5.today.pinnedCollection.addPlaceholder')}
          />
          <button
            type="submit"
            className="today-pinned-list-add-button"
            disabled={createItem.isPending}
            aria-label={t('m5s5.today.pinnedCollection.addAction')}
          >
            +
          </button>
        </form>
      ) : null}
    </div>
  );
}
