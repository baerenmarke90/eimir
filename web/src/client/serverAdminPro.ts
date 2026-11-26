import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ServerAdminProApi } from '../api/generated/apis/ServerAdminProApi';
import type { GiftCodeBatchCreate } from '../api/generated/models/GiftCodeBatchCreate';
import type { GiftCodeBatchView } from '../api/generated/models/GiftCodeBatchView';
import type { RunningGiftView } from '../api/generated/models/RunningGiftView';

/** Operator data of the ServerAdmin "Pro" area (part 5, #2328). */

/** Server limits (backend `eimir_pro/gift_codes/service.py`). */
export const GIFT_CODE_BATCH_SIZE_MAX = 100;
export const GIFT_CODE_NOTE_MAX = 120;

/** Every Pro query; the page's refresh invalidates them all. */
export const SERVER_ADMIN_PRO_QUERY_KEY = ['server-admin', 'pro'] as const;

export const proOverviewQueryKey = [
  ...SERVER_ADMIN_PRO_QUERY_KEY,
  'overview',
] as const;

export function giftCodeBatchQueryKey(batchId: string) {
  return [...SERVER_ADMIN_PRO_QUERY_KEY, 'batch', batchId] as const;
}

/** The typed count as a whole number from 1 to 100, else `null`. */
export function parseGiftCodeCount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return count >= 1 && count <= GIFT_CODE_BATCH_SIZE_MAX ? count : null;
}

/** The codes nobody has received yet, for "copy all open" (one per line). */
export function openGiftCodes(batch: GiftCodeBatchView): string[] {
  return batch.codes
    .filter((code) => code.state === 'open')
    .map((code) => code.code);
}

/** Running gifts by end date; one without an end comes last. */
export function sortRunningGifts(gifts: RunningGiftView[]): RunningGiftView[] {
  return [...gifts].sort((left, right) => {
    const a = left.effectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY;
    const b = right.effectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY;
    return a - b;
  });
}

export function useProOverview(api: ServerAdminProApi) {
  return useQuery({
    queryKey: proOverviewQueryKey,
    queryFn: () => api.getProOverview(),
    retry: false,
  });
}

export function useGiftCodeBatch(api: ServerAdminProApi, batchId: string) {
  return useQuery({
    queryKey: giftCodeBatchQueryKey(batchId),
    queryFn: () => api.getGiftCodeBatch({ batchId }),
    retry: false,
  });
}

/** A changed batch replaces its cached view; the overview counts refetch. */
function storeBatch(queryClient: QueryClient, batch: GiftCodeBatchView) {
  queryClient.setQueryData(giftCodeBatchQueryKey(batch.id), batch);
  void queryClient.invalidateQueries({ queryKey: proOverviewQueryKey });
}

export function useCreateGiftCodeBatch(api: ServerAdminProApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (giftCodeBatchCreate: GiftCodeBatchCreate) =>
      api.createGiftCodeBatch({ giftCodeBatchCreate }),
    onSuccess: (batch) => storeBatch(queryClient, batch),
  });
}

export function useSetGiftCodeHandedOut(api: ServerAdminProApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      codeId,
      handedOut,
    }: {
      codeId: string;
      handedOut: boolean;
    }) =>
      api.setGiftCodeHandedOut({
        codeId,
        giftCodeHandedOutUpdate: { handedOut },
      }),
    onSuccess: (batch) => storeBatch(queryClient, batch),
  });
}

export function useRevokeGiftCodeBatch(
  api: ServerAdminProApi,
  batchId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.revokeGiftCodeBatch({ batchId }),
    onSuccess: (batch) => storeBatch(queryClient, batch),
  });
}
