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
import { localDateInputValue } from './dateInput';

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

/** Latest deadline the server accepts, in months from now. */
export const GIFT_CODE_REDEEMABLE_MONTHS_MAX = 24;

/** Calendar months added to the UTC timestamp, clamped to the month's length (backend `add_months`). */
function addUtcMonths(value: Date, months: number): Date {
  const day = value.getUTCDate();
  const result = new Date(value.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const monthLength = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, monthLength));
  return result;
}

/**
 * The local days the operator may pick as "redeemable until": from tomorrow
 * to the last day whose end still lies within 24 months, since the server
 * refuses a deadline beyond now + 24 months.
 */
export function redeemableUntilBounds(now: Date = new Date()): {
  min: string;
  max: string;
} {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const limit = addUtcMonths(now, GIFT_CODE_REDEEMABLE_MONTHS_MAX);
  const lastDay = new Date(
    limit.getFullYear(),
    limit.getMonth(),
    limit.getDate() - 1,
  );
  return {
    min: localDateInputValue(tomorrow),
    max: localDateInputValue(lastDay),
  };
}

/** The end of a picked local day (`YYYY-MM-DD`) as an instant, else `null`. */
export function endOfLocalDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const end = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
    999,
  );
  return localDateInputValue(end) === value ? end : null;
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
