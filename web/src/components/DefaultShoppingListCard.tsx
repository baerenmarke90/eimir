import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ProblemState } from './ProblemState';
import './SharedContentPages.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/**
 * The short way to the couple's first shopping list (#1808).
 *
 * It appears on the lists overview only while the couple has no shopping list
 * at all, whatever its state: the server answers that with `kind=SHOPPING`, so
 * a list whose items are all in the cart still counts. One tap creates the
 * list with a default name and opens it; the name can be changed on the page.
 * While the answer is unknown (loading, offline, error) nothing is shown, so
 * the overview never waits for or fails because of this card.
 */
export function DefaultShoppingListCard({
  apis,
  spaceId,
  onCreated,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  onCreated: (created: CollectionDetail) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);

  const existing = useQuery({
    queryKey: [
      ...authorSummaryQueryKeys.collections(spaceId),
      'shopping-lists',
    ],
    queryFn: () =>
      apiCall(() =>
        apis.collections.listCollections({
          spaceId,
          kind: 'SHOPPING',
          scope: 'ALL',
          limit: 1,
        }),
      ),
    retry: false,
  });

  const create = useMutation({
    networkMode: 'always',
    retry: false,
    onSettled: () => {
      inFlightRef.current = false;
    },
    mutationFn: () =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.createCollection({
          spaceId,
          collectionCreate: {
            title: t('m5s3.collection.defaultShopping.title'),
            kind: 'SHOPPING',
          },
        });
      }),
    onSuccess: (created) => {
      queryClient.setQueryData(
        authorSummaryQueryKeys.collectionDetail(spaceId, created.id),
        created,
      );
      void queryClient.invalidateQueries({
        queryKey: authorSummaryQueryKeys.collections(spaceId),
      });
      onCreated(created);
    },
  });

  if (!existing.isSuccess || existing.data.items.length > 0) return null;

  return (
    <section
      className="shopping-starter"
      aria-labelledby="shopping-starter-heading"
    >
      <h2 id="shopping-starter-heading">
        {t('m5s3.collection.defaultShopping.heading')}
      </h2>
      <p>{t('m5s3.collection.defaultShopping.body')}</p>
      <AddActionButton
        label={t('m5s3.collection.defaultShopping.action')}
        icon="listen"
        pending={create.isPending}
        pendingLabel={t('m5s3.common.saving')}
        onClick={() => {
          if (inFlightRef.current) return;
          inFlightRef.current = true;
          create.mutate();
        }}
      />
      {create.error ? <ProblemState error={create.error} /> : null}
    </section>
  );
}
