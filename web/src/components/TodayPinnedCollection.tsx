import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { normalizeClientError } from '../client/problemDetails';
import { planningIfMatch } from '../client/sharedPlanning';
import { sharedAchievementKind } from '../client/sharedAchievements';
import { postSnackbar } from '../client/snackbar';
import { useTranslation } from '../i18n';
import { SharedAchievementCelebration } from './SharedAchievementCelebration';

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
  const showSharedAchievement =
    sharedAchievementsEnabled && celebratedScope === celebrationScope;
  const items = [...collection.items]
    .sort((left, right) => left.position - right.position)
    .slice(0, 4);
  const remaining = Math.max(0, collection.items.length - items.length);

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
      if (
        sharedAchievementsEnabled &&
        achievement === 'collection-completed'
      ) {
        setCelebratedScope(celebrationScope);
        postSnackbar('m5s5.today.pinnedCollection.sharedAchievementConfirmed', {
          title: collection.title,
        });
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

  if (showSharedAchievement) {
    return (
      <div className="today-pinned-list">
        <SharedAchievementCelebration
          centered
          headingLevel={3}
          title={t('m5s5.today.pinnedCollection.sharedAchievementTitle')}
          body={t('m5s5.today.pinnedCollection.sharedAchievementBody', {
            title: collection.title,
          })}
        />
      </div>
    );
  }

  return (
    <div className="today-pinned-list">
      {items.length > 0 ? (
        <ul className="today-pinned-list-items">
          {items.map((item) => (
            <li
              key={item.id}
              className={item.completed ? 'is-completed' : undefined}
            >
              <button
                type="button"
                className="today-pinned-list-check"
                aria-pressed={item.completed}
                aria-label={
                  item.completed
                    ? t('m5s3.collection.markOpen', { title: item.title })
                    : t('m5s3.collection.markDone', { title: item.title })
                }
                disabled={!item.capabilities.canEdit || toggleItem.isPending}
                onClick={() => toggleItem.mutate(item)}
              >
                {item.completed ? '✓' : ''}
              </button>
              <span className="today-pinned-list-title">{item.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="today-pinned-list-empty">
          {t('m5s5.today.pinnedCollection.empty')}
        </p>
      )}

      {remaining > 0 ? (
        <p className="today-pinned-list-more">
          {t('m5s5.today.pinnedCollection.more', { count: remaining })}
        </p>
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
