import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import { RemindersApi } from '../api/generated/apis/RemindersApi';
import type { Schedule } from '../api/generated/models/Schedule';
import { Configuration } from '../client/apiConfiguration';
import { authorDisplayName } from '../client/authorPresentation';
import { normalizeClientError } from '../client/problemDetails';
import { MORE_NOTIFICATIONS_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { PageHeader } from './PageHeader';
import { UiState } from './UiState';
import './ReminderReadPage.css';
import './StoryDetailContentFirst.css';

export function ReminderReadPage({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  timeZone,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  timeZone?: string;
}) {
  const { t } = useTranslation();
  const { reminderId = '' } = useParams();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const api = useMemo(
    () =>
      new RemindersApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const query = useQuery({
    queryKey: ['reminder-detail', apiBaseUrl, accountId, spaceId, reminderId],
    queryFn: async ({ signal }) => {
      try {
        return await api.getReminder({ spaceId, reminderId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    refetchOnMount: 'always',
  });
  const returnToInbox = () =>
    requestReturn(
      (location.state as { taskOriginKey?: unknown } | null)?.taskOriginKey,
      MORE_NOTIFICATIONS_ROUTE,
    );
  const back = (
    <button
      type="button"
      className="back-link tertiary"
      onClick={returnToInbox}
    >
      {t('m5s5.reminderDetail.back')}
    </button>
  );
  // A denied revalidation hides any earlier cached title as well.
  if (query.isError)
    return (
      <div className="page">
        {back}
        <ProblemState
          error={query.error}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </div>
    );
  if (!query.data)
    return (
      <div className="page">
        {back}
        <UiState kind="loading" title={t('m5s5.reminderDetail.loading')} />
      </div>
    );
  const reminder = query.data;
  function scheduleLabel(schedule: Schedule): string {
    const locale = resolvedLocale();
    if (schedule.type === 'ONCE')
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone,
      }).format(schedule.at);
    const [hour, minute] = schedule.localTime.split(':').map(Number);
    const time = new Intl.DateTimeFormat(locale, {
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
    if (schedule.type === 'ANNUAL')
      return t('m5s5.reminderDetail.annual', {
        date: new Intl.DateTimeFormat(locale, {
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(2000, schedule.month - 1, schedule.day))),
        time,
      });
    return t('m5s5.reminderDetail.dayCount', {
      count: schedule.dayCount,
      time,
      days: new Intl.NumberFormat(locale).format(schedule.dayCount),
    });
  }
  return (
    <div className="page product-detail-page reminder-read-page">
      {back}
      <PageHeader
        title={reminder.title}
        eyebrow={t('m5s5.reminderDetail.title')}
      />
      <article className="reminder-read-content">
        <p>{scheduleLabel(reminder.schedule)}</p>
        {reminder.description ? (
          <p className="story-body">{reminder.description}</p>
        ) : null}
        <p className="reminder-read-attribution">
          {t('m5s5.reminderDetail.createdBy', {
            name: authorDisplayName(reminder.creator),
          })}
        </p>
        {reminder.muted ? <p>{t('m5s5.reminderDetail.muted')}</p> : null}
      </article>
    </div>
  );
}
