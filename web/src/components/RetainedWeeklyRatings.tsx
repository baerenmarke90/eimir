import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import { assertOnlineWrite } from '../client/connectivity';
import { useTranslation } from '../i18n';
import './WeeklyBrief.css';

export function retainedRatingsQueryKey(accountId: string, spaceId: string) {
  return ['retained-weekly-ratings', accountId, spaceId] as const;
}

/**
 * Ratings retained from the retired weekly review (#2203). They stay
 * caller-private Core data, so anyone can delete them, with or without Pro.
 * The line appears only while such ratings exist.
 */
export function RetainedWeeklyRatings({
  api,
  accountId,
  spaceId,
}: {
  api: DailyCheckInsApi;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const queryKey = retainedRatingsQueryKey(accountId, spaceId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.getDailyCheckInWeeklyFeedback({ spaceId }, { signal }),
    retry: false,
    gcTime: 0,
  });
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function clear() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    try {
      assertOnlineWrite();
      setState('saving');
      await api.clearDailyCheckInWeeklyFeedback(
        { spaceId },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      client.setQueryData(queryKey, { ratings: [] });
      setState('saved');
    } catch {
      if (!controller.signal.aborted) setState('error');
    } finally {
      if (active.current === controller) active.current = null;
    }
  }

  if (state === 'saved') {
    return (
      <p className="insight-note insight-retained-ratings" role="status">
        {t('dailyInsights.retainedRatings.cleared')}
      </p>
    );
  }
  if (!query.data || query.data.ratings.length === 0) return null;
  return (
    <div className="insight-retained-ratings">
      <p className="insight-note">
        {t('dailyInsights.retainedRatings.body', {
          count: query.data.ratings.length,
        })}
      </p>
      <button
        type="button"
        className="brief-text-button"
        onClick={() => void clear()}
        disabled={state === 'saving'}
      >
        {t('dailyInsights.retainedRatings.clear')}
      </button>
      {state === 'error' ? (
        <p className="insight-note" role="alert">
          {t('dailyInsights.retainedRatings.error')}
        </p>
      ) : null}
    </div>
  );
}
