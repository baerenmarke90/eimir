import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { PlansApi } from '../api/generated/apis/PlansApi';
import { Configuration } from './apiConfiguration';
import { normalizeClientError } from './problemDetails';

/** Source identities are scoped; location content is always read with current authorization. */
export function usePlanCaptureSource({
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
  enabled = true,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
  enabled?: boolean;
}) {
  const location = useLocation();
  const candidate = (
    location.state as {
      sourcePlan?: {
        id?: unknown;
        spaceId?: unknown;
        accountId?: unknown;
        instance?: unknown;
      };
    } | null
  )?.sourcePlan;
  const sourcePlanId =
    enabled &&
    candidate?.spaceId === spaceId &&
    candidate.accountId === accountId &&
    candidate.instance === apiBaseUrl &&
    typeof candidate.id === 'string'
      ? candidate.id
      : null;
  const apis = useMemo(() => {
    const configuration = new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      plans: new PlansApi(configuration),
      places: new PlacesApi(configuration),
    };
  }, [apiBaseUrl, accessToken]);
  const sourcePlan = useQuery({
    queryKey: [
      'plan-capture-source',
      apiBaseUrl,
      accountId,
      spaceId,
      sourcePlanId,
    ],
    enabled: Boolean(sourcePlanId),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!sourcePlanId) throw new Error('No source Plan selected.');
      try {
        return await apis.plans.getPlan(
          { spaceId, planId: sourcePlanId },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const eligible =
    sourcePlan.data?.spaceId === spaceId &&
    sourcePlan.data.status === 'COMPLETED' &&
    sourcePlan.data.capabilities.canEdit;
  const placeId = eligible ? sourcePlan.data?.placeId : null;
  const sourcePlace = useQuery({
    queryKey: [
      'plan-capture-place',
      apiBaseUrl,
      accountId,
      spaceId,
      sourcePlanId,
      placeId,
    ],
    enabled: Boolean(placeId),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!placeId) throw new Error('No source Place selected.');
      try {
        return await apis.places.getPlace({ spaceId, placeId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  return {
    sourcePlanId,
    sourcePlan,
    sourcePlace,
    loading: Boolean(
      sourcePlanId &&
        (sourcePlan.isPending || (placeId && sourcePlace.isPending)),
    ),
  };
}
