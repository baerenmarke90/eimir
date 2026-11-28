import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import { formatBytes } from '../client/formatBytes';
import { SUPPORT_REPORTS_QUERY_KEY } from '../client/supportReportsAdmin';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import {
  buildNeedsYouItems,
  type NeedsYouItem,
  summaryTone,
} from './serverAdminNeedsYou';

type ServiceTone = 'ok' | 'quiet' | 'problem';

const ITEM_ICONS: Record<NeedsYouItem['kind'], EimirIconName> = {
  reports: 'nachrichten',
  failedJobs: 'close',
  storage: 'photo-library',
  expiringGrant: 'geschenk',
  warning: 'einstellungen',
};

function serviceState(
  status: string,
  t: (key: string) => string,
): { tone: ServiceTone; state: string } {
  if (status === 'ok') return { tone: 'ok', state: t('serverAdmin.health.ok') };
  if (status === 'silent') {
    return { tone: 'problem', state: t('serverAdmin.situation.silent') };
  }
  if (status === 'no_heartbeat_signal' || status === 'not_probed') {
    // No signal (yet); never shown as healthy.
    return { tone: 'quiet', state: t('serverAdmin.situation.noSignalYet') };
  }
  if (status === 'unavailable') {
    return { tone: 'problem', state: t('serverAdmin.health.unavailable') };
  }
  return { tone: 'quiet', state: t('serverAdmin.health.unknown') };
}

function Service({
  label,
  tone,
  state,
}: {
  label: string;
  tone: ServiceTone;
  state: string;
}) {
  return (
    <div className={`server-admin-service is-${tone}`}>
      <span className="server-admin-service-dot" aria-hidden="true" />
      <span className="server-admin-service-text">
        <strong>{label}</strong>
        <span>{state}</span>
      </span>
    </div>
  );
}

/**
 * The ServerAdmin start page (redesign part 1): one summary line, the
 * services, and what needs the operator, each linking to its place.
 */
export function ServerAdminSituation({
  overview,
  api,
  reportsApi,
}: {
  overview: ServerAdminOverview;
  api: ServerAdminApi;
  reportsApi: ServerAdminSupportReportsApi;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const items = buildNeedsYouItems(overview);
  // "Seen" (#2342): failed jobs are hidden until a new one fails; the reports
  // that were new when the page loaded move to in progress.
  const [seenNotice, setSeenNotice] = useState<'saved' | 'failed' | null>(null);
  const seen = useMutation({
    mutationFn: async (kind: 'reports' | 'failedJobs'): Promise<void> => {
      if (kind === 'failedJobs') {
        await api.markFailedJobsSeenApiV1ServerAdminFailedJobsSeenPost();
        return;
      }
      const loadedAt = queryClient.getQueryState([
        'server-admin',
        'overview',
      ])?.dataUpdatedAt;
      await reportsApi.markSupportReportsSeen({
        supportReportsSeen: {
          through: loadedAt ? new Date(loadedAt) : new Date(),
        },
      });
    },
    onMutate: () => setSeenNotice(null),
    onSuccess: () => {
      setSeenNotice('saved');
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'overview'],
      });
      void queryClient.invalidateQueries({
        queryKey: SUPPORT_REPORTS_QUERY_KEY,
      });
    },
    onError: () => setSeenNotice('failed'),
  });
  const tone = summaryTone(overview);
  const number = new Intl.NumberFormat(resolvedLocale());
  const summary =
    items.length > 0
      ? t('serverAdmin.situation.attention', { count: items.length })
      : tone === 'attention'
        ? t('serverAdmin.situation.serviceProblem')
        : t('serverAdmin.situation.allGood');
  const services: Array<{ label: string; tone: ServiceTone; state: string }> = [
    {
      label: t('serverAdmin.health.application'),
      ...serviceState(overview.applicationStatus, t),
    },
    {
      label: t('serverAdmin.health.database'),
      ...serviceState(overview.databaseStatus, t),
    },
    {
      label: t('serverAdmin.health.worker'),
      ...serviceState(overview.workerStatus, t),
    },
    {
      label: t('serverAdmin.health.media'),
      ...serviceState(overview.mediaStatus, t),
    },
    {
      label: t('serverAdmin.situation.mail'),
      tone: overview.mailTransport === 'none' ? 'quiet' : 'ok',
      state:
        overview.mailTransport === 'none'
          ? t('serverAdmin.situation.mailOff')
          : t('serverAdmin.situation.mailOn'),
    },
    {
      label: t('serverAdmin.situation.push'),
      tone: overview.pushFailuresLastHour > 5 ? 'problem' : 'ok',
      state:
        overview.pushFailuresLastHour > 5
          ? t('serverAdmin.situation.pushProblem')
          : t('serverAdmin.situation.pushOk'),
    },
    {
      // Only Cloud must have a backup reported to eimir.; Self-Hosted
      // operators may back up outside of it (#2317).
      label: t('serverAdmin.situation.backup'),
      tone: overview.deployment === 'cloud' ? 'problem' : 'quiet',
      state:
        overview.deployment === 'cloud'
          ? t('serverAdmin.situation.backupMissing')
          : t('serverAdmin.situation.backupUnknown'),
    },
  ];

  return (
    <>
      <section
        className={`server-admin-panel server-admin-panel-wide server-admin-summary is-${tone}`}
        aria-labelledby="server-situation-summary"
      >
        <EimirIcon name={tone === 'ok' ? 'check' : 'benachrichtigungen'} />
        <h2 id="server-situation-summary">{summary}</h2>
      </section>

      <section
        className="server-admin-panel server-admin-panel-wide"
        aria-labelledby="server-situation-needs-you"
      >
        <h2 id="server-situation-needs-you">
          {t('serverAdmin.situation.needsYouTitle')}
        </h2>
        {items.length === 0 ? (
          <p className="server-admin-muted">
            {t('serverAdmin.situation.nothingNeedsYou')}
          </p>
        ) : (
          <ul className="server-admin-needs-you">
            {items.map((item) => (
              <li key={item.id} className="server-admin-needs-you-item">
                <Link
                  className={`server-admin-needs-you-row is-${item.tone}`}
                  to={item.href}
                >
                  <span className="server-admin-needs-you-icon">
                    <EimirIcon name={ITEM_ICONS[item.kind]} />
                  </span>
                  <span className="server-admin-needs-you-text">
                    <strong>
                      {item.titleValues
                        ? t(item.titleKey, item.titleValues)
                        : t(item.titleKey)}
                    </strong>
                    {item.detailKey ? <span>{t(item.detailKey)}</span> : null}
                    {item.storage ? (
                      <span>
                        {t('serverAdmin.situation.storageDetail', {
                          used: formatBytes(item.storage.usedBytes),
                          quota: formatBytes(item.storage.quotaBytes),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <EimirIcon name="chevron-right" />
                </Link>
                {item.seen ? (
                  <button
                    type="button"
                    className="secondary server-admin-needs-you-seen"
                    aria-label={t(
                      item.seen === 'failedJobs'
                        ? 'serverAdmin.situation.seenFailedJobs'
                        : 'serverAdmin.situation.seenReports',
                    )}
                    disabled={seen.isPending}
                    onClick={() =>
                      seen.mutate(item.seen as 'reports' | 'failedJobs')
                    }
                  >
                    {t('serverAdmin.situation.seen')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="server-admin-muted" role="status">
          {seenNotice === 'saved'
            ? t('serverAdmin.situation.seenSaved')
            : seenNotice === 'failed'
              ? t('serverAdmin.situation.seenFailed')
              : null}
        </p>
      </section>

      <section
        className="server-admin-panel"
        aria-labelledby="server-situation-services"
      >
        <h2 id="server-situation-services">
          {t('serverAdmin.situation.servicesTitle')}
        </h2>
        <div className="server-admin-services">
          {services.map((service) => (
            <Service
              key={service.label}
              label={service.label}
              tone={service.tone}
              state={service.state}
            />
          ))}
        </div>
      </section>

      <section
        className="server-admin-panel"
        aria-labelledby="server-situation-registrations"
      >
        <h2 id="server-situation-registrations">
          {t('serverAdmin.situation.registrationsTitle')}
        </h2>
        <dl className="server-admin-registrations">
          <div>
            <dt>{t('serverAdmin.usage.accounts24h')}</dt>
            <dd>{number.format(overview.accountsLast24h)}</dd>
          </div>
          <div>
            <dt>{t('serverAdmin.usage.accounts7d')}</dt>
            <dd>{number.format(overview.accountsLast7d)}</dd>
          </div>
          <div>
            <dt>{t('serverAdmin.usage.accounts30d')}</dt>
            <dd>{number.format(overview.accountsLast30d)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
