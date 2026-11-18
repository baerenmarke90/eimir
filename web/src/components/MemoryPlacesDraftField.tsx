import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { Configuration } from '../client/apiConfiguration';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { useTranslation } from '../i18n';
import type { MomentPlaceSelection } from './MomentPlaceField';
import { OrderedMomentPlacesField } from './OrderedMomentPlacesField';
import { ProblemState } from './ProblemState';

export function MemoryPlacesDraftField({
  memoryId,
  order,
  value,
  onChange,
  ...props
}: {
  memoryId: string;
  order: string[];
  value?: MomentPlaceSelection[];
  onChange: (places: MomentPlaceSelection[]) => void;
} & Omit<
  Parameters<typeof OrderedMomentPlacesField>[0],
  'value' | 'onChange'
>) {
  const { t } = useTranslation();
  const api = useMemo(
    () =>
      new PlacesApi(
        new Configuration({
          basePath: props.apiBaseUrl,
          headers: { Authorization: `Bearer ${props.accessToken}` },
        }),
      ),
    [props.apiBaseUrl, props.accessToken],
  );
  const query = useQuery({
    queryKey: [
      ...authorSummaryQueryKeys.places(props.spaceId),
      'memory-draft',
      props.apiBaseUrl,
      props.accountId,
      memoryId,
      order,
    ],
    retry: false,
    queryFn: async ({ signal }) => {
      const places: MomentPlaceSelection[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.listMomentPlaces(
          {
            spaceId: props.spaceId,
            kind: 'memories',
            targetId: memoryId,
            cursor,
            limit: 100,
          },
          { signal },
        );
        places.push(...page.items);
        const next = page.nextCursor ?? undefined;
        if (next === cursor) break;
        cursor = next;
      } while (cursor);
      return places.sort((a, b) => {
        const left = order.indexOf(a.id);
        const right = order.indexOf(b.id);
        return (
          (left < 0 ? order.length : left) - (right < 0 ? order.length : right)
        );
      });
    },
  });
  if (query.error) return <ProblemState error={query.error} />;
  if (!query.data) return <p role="status">{t('states.loading.title')}</p>;
  return (
    <OrderedMomentPlacesField
      {...props}
      value={value ?? query.data}
      onChange={onChange}
    />
  );
}
