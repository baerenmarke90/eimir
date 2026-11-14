import { useQueries } from '@tanstack/react-query';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { normalizeClientError } from '../client/problemDetails';
import {
  collectionDetailPath,
  FOCUS_ADD_ITEM_STATE_KEY,
} from '../client/routes';
import { summarizeSharedList } from '../client/sharedListSummary';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { SharedListBar } from './SharedListSummary';
import './WirLists.css';

const PEEK_LIMIT = 3;

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

type LastAction = { name: string; title: string; kind: 'added' | 'done' };

/** The most recent thing either person did on the list, from what it holds. */
function lastActionOf(collection: CollectionDetail): LastAction | null {
  let best: { at: number; action: LastAction } | null = null;
  for (const item of collection.items) {
    const events: { at: Date | null | undefined; action: LastAction | null }[] =
      [
        {
          at: item.createdAt,
          action: item.creator
            ? {
                name: item.creator.displayName,
                title: item.title,
                kind: 'added',
              }
            : null,
        },
        {
          at: item.completedAt,
          action:
            item.completed && item.completer
              ? {
                  name: item.completer.displayName,
                  title: item.title,
                  kind: 'done',
                }
              : null,
        },
      ];
    for (const event of events) {
      if (!event.at || !event.action) continue;
      const at = new Date(event.at).getTime();
      if (!best || at > best.at) best = { at, action: event.action };
    }
  }
  return best?.action ?? null;
}

/**
 * The tiles of "Unsere Listen" on Wir (#1808): every shared list the person
 * chose to show is a tile. One list is one wide tile; several are tiles side
 * by side in a row that can be swiped. The section around it (title and the
 * link to all lists, the path that needs no swipe) belongs to the Wir page. A
 * tile opens its list; it carries no checkboxes.
 */
export function WirLists({
  api,
  spaceId,
  collectionIds,
  enabled,
}: {
  api: CollectionsApi;
  spaceId: string;
  collectionIds: string[];
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const results = useQueries({
    queries: collectionIds.map((collectionId) => ({
      queryKey: authorSummaryQueryKeys.collectionDetail(spaceId, collectionId),
      queryFn: () =>
        apiCall(() => api.getCollection({ spaceId, collectionId })),
      enabled,
      retry: false,
    })),
  });
  const loaded = results
    .map((result) => result.data)
    .filter((collection): collection is CollectionDetail =>
      Boolean(collection),
    );
  const failed = results.some((result) => result.error && !result.data);

  if (collectionIds.length === 0) return null;
  if (loaded.length === 0 && !failed)
    return (
      <div
        className="today-module-placeholder"
        data-kind="pinned-collection"
        aria-hidden="true"
      />
    );

  function open(
    event: MouseEvent<HTMLAnchorElement>,
    collectionId: string,
    focusAdd: boolean,
  ) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void navigate(collectionDetailPath(collectionId), {
      state: {
        taskOriginKey: captureOrigin({ selectedKey: collectionId }),
        ...(focusAdd ? { [FOCUS_ADD_ITEM_STATE_KEY]: true } : {}),
      },
    });
  }

  const wide = collectionIds.length === 1;
  return (
    <>
      {failed && loaded.length === 0 ? (
        <p className="wir-lists-error" role="status">
          {t('m5s5.today.wirLists.loadError')}
        </p>
      ) : null}
      <ul className={wide ? 'wir-lists-single' : 'wir-lists-row'}>
        {loaded.map((collection) => {
          const shopping = collection.kind === 'SHOPPING';
          const summary = summarizeSharedList(collection, collection.items);
          const prefix = shopping ? 'shopping' : 'generic';
          const peek = collection.items
            .filter((item) => !item.completed)
            .sort((left, right) => left.position - right.position)
            .slice(0, PEEK_LIMIT)
            .map((item) => item.title)
            .join(' · ');
          const last = lastActionOf(collection);
          return (
            <li key={collection.id} className="wir-list-tile">
              <Link
                to={collectionDetailPath(collection.id)}
                className="wir-list-tile-main"
                aria-label={t('m5s5.today.wirLists.openAria', {
                  title: collection.title,
                })}
                onClick={(event) => open(event, collection.id, false)}
              >
                <h3
                  id={`wir-list-${collection.id}`}
                  className="wir-list-tile-title"
                >
                  {collection.title}
                </h3>
                <p className="wir-list-tile-count">
                  {summary.total === 0 ? (
                    <span>{t('m5s5.today.wirLists.empty')}</span>
                  ) : summary.open === 0 ? (
                    <span>
                      {t(`m5s3.collection.summary.${prefix}Complete`)}
                    </span>
                  ) : (
                    <>
                      <strong className="wir-list-tile-number">
                        {summary.open}
                      </strong>{' '}
                      <span>
                        {t(`m5s3.collection.summary.${prefix}Open`, {
                          count: summary.open,
                        })}
                      </span>
                    </>
                  )}
                </p>
                {summary.total > 0 ? <SharedListBar summary={summary} /> : null}
                {peek ? <p className="wir-list-tile-peek">{peek}</p> : null}
                {last ? (
                  <p className="wir-list-tile-last">
                    {t(
                      last.kind === 'added'
                        ? 'm5s5.today.wirLists.lastAdded'
                        : shopping
                          ? 'm5s5.today.wirLists.lastCart'
                          : 'm5s5.today.wirLists.lastDone',
                      { name: last.name, title: last.title },
                    )}
                  </p>
                ) : null}
              </Link>
              {wide && collection.capabilities.canEdit ? (
                <AddActionLink
                  to={collectionDetailPath(collection.id)}
                  className="wir-list-tile-add"
                  label={t('m5s5.today.wirLists.add')}
                  aria-describedby={`wir-list-${collection.id}`}
                  onClick={(event) => open(event, collection.id, true)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
