import { Link } from 'react-router-dom';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import { formatBytes } from '../client/formatBytes';
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
  if (status === 'no_heartbeat_signal' || status === 'not_probed') {
    // No signal exists yet (part 2 adds it); never shown as healthy.
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
}: {
  overview: ServerAdminOverview;
}) {
  const { t } = useTranslation();
  const items = buildNeedsYouItems(overview);
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
              <li key={item.id}>
                <Link
                  className={`server-admin-needs-you-row is-${item.tone}`}
                  to={item.href}
                >
                  <span className="server-admin-needs-you-icon">
                    <EimirIcon name={ITEM_ICONS[item.kind]} />
                  </span>
                  <span className="server-admin-needs-you-text">
                    <strong>{t(item.titleKey, item.titleValues)}</strong>
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
              </li>
            ))}
          </ul>
        )}
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
