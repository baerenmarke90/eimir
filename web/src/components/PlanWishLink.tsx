import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { assertOnlineWrite } from '../client/connectivity';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { wishDetailPath } from '../client/routes';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { useTaskActivation } from '../client/useTaskActivation';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PlanWishLink.css';

/** A late source-Wish association uses the existing Plan/Wish lifecycle. */
export function PlanWishLink({
  apis,
  spaceId,
  plan,
  disabled,
  onLinked,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  plan: PlanDetail;
  disabled: boolean;
  onLinked: (plan: PlanDetail) => Promise<void>;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<WishDetail | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sourceLink = useRef<HTMLAnchorElement>(null);
  const inFlight = useRef(false);
  const focusLinkedSource = useRef(false);
  const eligible =
    plan.capabilities.canEdit &&
    !plan.sourceWishId &&
    plan.status !== 'COMPLETED';
  const capture = useTaskActivation(open && plan.capabilities.canEdit);
  const planKey = authorSummaryQueryKeys.planDetail(spaceId, plan.id);
  const mutationKey = ['plan-write', spaceId, plan.id] as const;
  const wishKey = ['m5-s3', 'wishes', spaceId, 'plan-link', plan.id] as const;
  const wishes = useInfiniteQuery({
    queryKey: wishKey,
    initialPageParam: undefined as string | undefined,
    enabled: open && eligible,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apis.wishes.listWishes(
          { spaceId, status: 'OPEN', cursor: pageParam, limit: 20 },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (page, _pages, lastCursor, cursors) => {
      const next = page.nextCursor;
      return next && next !== lastCursor && !cursors.includes(next)
        ? next
        : undefined;
    },
  });
  const items = wishes.data?.pages.flatMap((page) => page.items) ?? [];
  // Refetches can remove/change a chosen Wish. Confirm only a currently offered version.
  const choice = items.find(
    (wish) => wish.id === selected?.id && wish.version === selected.version,
  );
  const mutation = useMutation({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (intent: {
      wish: WishDetail;
      plan: PlanDetail;
      owns: () => boolean;
    }) => {
      assertOnlineWrite();
      if (!intent.owns()) throw new ClientProblemError('permission');
      try {
        return await apis.plans.linkWishToPlan({
          spaceId,
          planId: intent.plan.id,
          ifMatch: planningIfMatch(intent.plan),
          planWishLink: {
            wishId: intent.wish.id,
            wishVersion: intent.wish.version,
          },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (data, intent) => {
      if (!intent.owns()) return;
      focusLinkedSource.current = true;
      await Promise.all([
        onLinked(data.plan),
        client.invalidateQueries({ queryKey: ['m5-s3', 'wishes', spaceId] }),
        client.invalidateQueries({
          queryKey: authorSummaryQueryKeys.wishDetail(spaceId, data.wish.id),
        }),
        invalidateDashboard(client, spaceId),
      ]);
      if (!intent.owns()) return;
      setOpen(false);
      setSelected(null);
      postSnackbar(t('m5s3.plan.wishLinked'), { tone: 'success' });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  function confirm() {
    if (
      !choice ||
      !eligible ||
      wishes.error ||
      inFlight.current ||
      disabled ||
      client.isMutating({ mutationKey, exact: true })
    )
      return;
    const ownsTask = capture();
    const ownsPlan = captureAuthorizedQuery(client, planKey);
    const ownsWishes = captureAuthorizedQuery(client, wishKey);
    inFlight.current = true;
    mutation.mutate({
      wish: choice,
      plan,
      owns: () => ownsTask() && ownsPlan() && ownsWishes(),
    });
  }
  if (!eligible && !plan.sourceWishId) return null;
  return (
    <section className="plan-wish-link">
      {plan.sourceWishId ? (
        <Link
          ref={sourceLink}
          className="button-link secondary-link plan-wish-source"
          to={wishDetailPath(plan.sourceWishId)}
        >
          <EimirIcon name="wuensche" />
          <span>{t('m5s3.plan.openWish')}</span>
        </Link>
      ) : (
        <button
          ref={trigger}
          type="button"
          className="secondary plan-wish-source"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            mutation.reset();
            setSelected(null);
            setOpen(true);
          }}
        >
          <EimirIcon name="wuensche" />
          <span>{t('m5s3.plan.linkWish')}</span>
        </button>
      )}
      <ShortTaskSheet
        open={open && eligible}
        title={t('m5s3.plan.linkWish')}
        restoreFocusRef={plan.sourceWishId ? sourceLink : trigger}
        onPresenceChange={(present) => {
          if (!present && focusLinkedSource.current && sourceLink.current) {
            focusLinkedSource.current = false;
            sourceLink.current.focus({ preventScroll: true });
          }
        }}
        isCloseBlocked={mutation.isPending}
        onClose={() => {
          if (!inFlight.current) setOpen(false);
        }}
        footer={
          <button
            type="button"
            disabled={
              !choice || Boolean(wishes.error) || mutation.isPending || disabled
            }
            onClick={confirm}
          >
            {t(
              mutation.isPending
                ? 'm5s3.common.saving'
                : 'm5s3.plan.confirmWishLink',
            )}
          </button>
        }
      >
        <p>{t('m5s3.plan.linkWishHelp')}</p>
        {wishes.isPending ? (
          <p role="status">{t('m5s3.common.loading')}</p>
        ) : null}
        {wishes.error ? (
          <ProblemState
            error={wishes.error}
            onRetry={() => void wishes.refetch()}
          />
        ) : null}
        {!wishes.isPending && !wishes.error && !items.length ? (
          <p>{t('m5s3.plan.noOpenWishes')}</p>
        ) : null}
        {!wishes.error && items.length ? (
          <fieldset className="plan-wish-choices">
            <legend className="sr-only">{t('m5s3.plan.chooseWish')}</legend>
            {items.map((wish) => (
              <label key={wish.id}>
                <input
                  type="radio"
                  name={`plan-wish-${plan.id}`}
                  value={wish.id}
                  checked={choice?.id === wish.id}
                  disabled={mutation.isPending}
                  onChange={() => {
                    mutation.reset();
                    setSelected(wish);
                  }}
                />
                <span>{wish.title}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {wishes.hasNextPage ? (
          <button
            type="button"
            className="tertiary"
            disabled={wishes.isFetchingNextPage || mutation.isPending}
            onClick={() => void wishes.fetchNextPage()}
          >
            {t('m5s3.common.loadMore')}
          </button>
        ) : null}
        {mutation.error ? (
          <ProblemState
            error={mutation.error}
            onRetry={() =>
              void Promise.all([
                wishes.refetch(),
                client.invalidateQueries({ queryKey: planKey }),
              ])
            }
          />
        ) : null}
      </ShortTaskSheet>
    </section>
  );
}
