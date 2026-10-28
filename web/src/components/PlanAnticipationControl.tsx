import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { planningIfMatch } from '../client/sharedPlanning';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { assertOnlineWrite } from '../client/connectivity';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import {
  clientProblemKind,
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import './RelationshipReflections.css';

export function PlanAnticipationControl({
  apis,
  plan,
  spaceId,
  disabled,
}: {
  apis: SharedPlanningApis;
  plan: PlanDetail;
  spaceId: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const helpId = useId();
  const client = useQueryClient();
  const key = authorSummaryQueryKeys.planDetail(spaceId, plan.id);
  const mutationKey = ['plan-write', spaceId, plan.id] as const;
  const mutation = useMutation({
    mutationKey,
    networkMode: 'always',
    mutationFn: async (intent: {
      send: () => Promise<PlanDetail>;
      ownsRead: () => boolean;
      ownsDashboard: () => boolean;
      starting: PlanDetail;
    }) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      assertOnlineWrite();
      if (!intent.ownsRead() || client.getQueryData(key) !== intent.starting) {
        throw new ClientProblemError('conflict');
      }
      try {
        return await intent.send();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (result, intent) => {
      if (!intent.ownsRead()) return;
      if (client.getQueryData(key) === intent.starting)
        client.setQueryData(key, result);
      await client.invalidateQueries({ queryKey: key, exact: true });
      if (intent.ownsDashboard())
        await client.invalidateQueries({
          queryKey: dashboardQueryKey(spaceId),
          exact: true,
        });
    },
    onError: async (error, intent) => {
      if (intent.ownsRead() && clientProblemKind(error) === 'conflict') {
        await client.invalidateQueries({ queryKey: key, exact: true });
      }
    },
  });
  function toggle() {
    if (disabled || client.isMutating({ mutationKey, exact: true }) > 0) return;
    const ownsRead = captureAuthorizedQuery(client, key);
    const starting = client.getQueryData<PlanDetail>(key);
    if (!ownsRead() || !starting) return;
    const request = {
      spaceId,
      planId: starting.id,
      ifMatch: planningIfMatch(starting),
      planUpdate: { anticipationEnabled: !starting.anticipationEnabled },
    };
    mutation.mutate({
      starting,
      ownsRead,
      ownsDashboard: captureAuthorizedQuery(client, dashboardQueryKey(spaceId)),
      send: () => apis.plans.updatePlan(request),
    });
  }
  return (
    <section className="plan-anticipation-control" data-color-world="natural">
      <label className="choice-row">
        <input
          type="checkbox"
          role="switch"
          aria-labelledby={labelId}
          aria-describedby={helpId}
          checked={plan.anticipationEnabled ?? false}
          disabled={disabled || mutation.isPending}
          onChange={toggle}
        />
        <span>
          <strong id={labelId}>
            {t('relationshipReflections.anticipation.show')}
          </strong>
          <small id={helpId}>
            {t('relationshipReflections.anticipation.help')}
          </small>
        </span>
      </label>
      {mutation.isPending ? <p role="status">{t('common.saving')}</p> : null}
      {mutation.isSuccess ? (
        <p role="status">{t('relationshipReflections.anticipation.saved')}</p>
      ) : null}
      {mutation.error ? (
        <ProblemState error={mutation.error} onRetry={toggle} />
      ) : null}
    </section>
  );
}
