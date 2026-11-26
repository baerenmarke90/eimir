import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type RefObject, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminSpaceFile as SpaceFile } from '../api/generated/models/ServerAdminSpaceFile';
import type { ServerAdminSpaceTimelineEntry } from '../api/generated/models/ServerAdminSpaceTimelineEntry';
import { formatBytes } from '../client/formatBytes';
import { resolvedLocale, useTranslation } from '../i18n';
import {
  activeGift,
  ServerAdminPremiumGiftSheet,
} from './ServerAdminPremiumGiftSheet';
import { ServerAdminStorageQuotaSheet } from './ServerAdminStorageQuotaSheet';
import { sectionHref } from './serverAdminAreas';
import './ServerAdminSpaceFile.css';

const PRESSURE_RATIO = 0.9;

/** `4f2a…c91`: enough to tell Spaces apart without a wall of hex. */
export function shortSpaceId(id: string): string {
  const compact = id.replaceAll('-', '');
  return `${compact.slice(0, 4)}…${compact.slice(-3)}`;
}

function formatDay(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

const TIMELINE_KEYS: Record<string, string> = {
  space_entitlement_granted: 'serverAdmin.spaceFile.timeline.giftGiven',
  space_entitlement_revoked: 'serverAdmin.spaceFile.timeline.giftEnded',
  space_storage_quota_set: 'serverAdmin.spaceFile.timeline.quotaSet',
  space_storage_quota_cleared: 'serverAdmin.spaceFile.timeline.quotaCleared',
  space_configuration_manager_reconciled:
    'serverAdmin.spaceFile.timeline.managerReconciled',
};

const SOURCE_KEYS: Record<string, string> = {
  GOOGLE_PLAY: 'serverAdmin.spaceFile.source.googlePlay',
  APP_STORE: 'serverAdmin.spaceFile.source.appStore',
  CLOUD_STRIPE: 'serverAdmin.spaceFile.source.web',
  SELF_HOSTED_KEY: 'serverAdmin.spaceFile.source.key',
  ADMIN_GRANT: 'serverAdmin.spaceFile.source.gift',
  TEST_FIXTURE: 'serverAdmin.spaceFile.source.test',
};

const LIFECYCLE_KEYS: Record<string, string> = {
  active: 'serverAdmin.spaces.lifecycle.active',
  inactive: 'serverAdmin.spaces.lifecycle.inactive',
  empty: 'serverAdmin.spaces.lifecycle.empty',
};

const ANOMALY_KEYS: Record<string, string> = {
  no_memberships: 'serverAdmin.spaces.anomalies.noMemberships',
  too_many_active_memberships: 'serverAdmin.spaces.anomalies.tooManyActive',
};

const AUTH_METHOD_KEYS: Record<string, string> = {
  LOCAL_PASSWORD: 'serverAdmin.spaceFile.auth.password',
  PASSKEY: 'serverAdmin.spaceFile.auth.passkey',
  OIDC: 'serverAdmin.spaceFile.auth.oidc',
  MAGIC_LINK: 'serverAdmin.spaceFile.auth.magicLink',
};

const MEDIA_KEYS: Record<string, string> = {
  IMAGE: 'serverAdmin.spaceFile.media.image',
  VIDEO: 'serverAdmin.spaceFile.media.video',
  AUDIO: 'serverAdmin.spaceFile.media.audio',
  DOCUMENT: 'serverAdmin.spaceFile.media.document',
};

function timelineText(
  entry: ServerAdminSpaceTimelineEntry,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (entry.kind === 'entitlement_grant') {
    const source = t(
      SOURCE_KEYS[entry.sourceType ?? ''] ??
        'serverAdmin.spaceFile.source.other',
    );
    return t(
      entry.tier === 'PREMIUM'
        ? 'serverAdmin.spaceFile.timeline.premium'
        : 'serverAdmin.spaceFile.timeline.free',
      { source },
    );
  }
  return t(
    TIMELINE_KEYS[entry.kind] ?? 'serverAdmin.spaceFile.timeline.adminAction',
  );
}

function memberStatusKey(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'serverAdmin.spaceFile.member.active';
    case 'LEFT':
      return 'serverAdmin.spaceFile.member.left';
    case 'REMOVED':
      return 'serverAdmin.spaceFile.member.removed';
    default:
      return 'serverAdmin.spaceFile.member.other';
  }
}

function SpaceFileContent({
  file,
  api,
  headingRef,
  onChanged,
}: {
  file: SpaceFile;
  api: ServerAdminApi;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<'quota' | 'gift' | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
  const { space, members, storage, entitlement, timeline } = file;
  const premium = entitlement.tier === 'PREMIUM';
  const payingGrant = entitlement.grants.find(
    (grant) => grant.status === 'ACTIVE' && grant.tier === 'PREMIUM',
  );
  const gift = activeGift(entitlement.grants);
  // Over an individual quota the share can pass 100 %; only the bar stops.
  const ratio =
    storage.quotaBytes && storage.quotaBytes > 0
      ? storage.usedBytes / storage.quotaBytes
      : null;
  const fill = ratio === null ? null : Math.min(ratio, 1);

  return (
    <article
      className="server-admin-space-file"
      aria-labelledby="space-file-title"
    >
      <header className="server-admin-space-file-head">
        <h2 id="space-file-title" ref={headingRef} tabIndex={-1}>
          {t('serverAdmin.spaceFile.title', { id: shortSpaceId(space.id) })}
        </h2>
        <p className="server-admin-muted server-admin-actor-id">{space.id}</p>
        <ul className="server-admin-space-file-chips">
          <li
            className={space.anomalyCodes.length > 0 ? 'is-warning' : undefined}
          >
            {t(
              LIFECYCLE_KEYS[space.lifecycleStatus] ??
                'serverAdmin.spaces.lifecycle.active',
            )}
          </li>
          <li className={premium ? 'is-premium' : undefined}>
            {premium
              ? t('serverAdmin.spaceFile.plan.premium', {
                  source: t(
                    SOURCE_KEYS[payingGrant?.sourceType ?? ''] ??
                      'serverAdmin.spaceFile.source.other',
                  ),
                })
              : t('serverAdmin.spaceFile.plan.free')}
          </li>
          <li>
            {t('serverAdmin.spaceFile.since', {
              date: formatDay(space.createdAt),
            })}
          </li>
          {premium && entitlement.effectiveUntil ? (
            <li className="is-positive">
              {t('serverAdmin.spaceFile.until', {
                date: formatDay(entitlement.effectiveUntil),
              })}
            </li>
          ) : null}
        </ul>
      </header>

      {space.anomalyCodes.length > 0 ? (
        <div className="server-admin-warning-panel">
          <strong>{t('serverAdmin.spaces.anomalies.title')}</strong>
          <ul>
            {space.anomalyCodes.map((code) => (
              <li key={code}>
                {ANOMALY_KEYS[code] ? t(ANOMALY_KEYS[code]) : code}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section
        className="server-admin-space-file-card"
        aria-label={t('serverAdmin.spaceFile.membersTitle')}
      >
        {members.length === 0 ? (
          <p className="server-admin-muted">
            {t('serverAdmin.spaceFile.noMembers')}
          </p>
        ) : (
          <ul className="server-admin-space-file-members">
            {members.map((member) => (
              <li key={member.accountId}>
                <span
                  className="server-admin-space-file-avatar"
                  aria-hidden="true"
                >
                  {(member.primaryEmail ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="server-admin-space-file-member-text">
                  <Link
                    to={sectionHref('accounts', { account: member.accountId })}
                  >
                    {member.primaryEmail ??
                      t('serverAdmin.spaceFile.member.noEmail')}
                  </Link>
                  <span className="server-admin-muted">
                    {[
                      t(
                        member.emailVerified
                          ? 'serverAdmin.accounts.verification.verified'
                          : 'serverAdmin.accounts.verification.unverified',
                      ),
                      member.authMethods
                        .map((method) =>
                          t(
                            AUTH_METHOD_KEYS[method] ??
                              'serverAdmin.spaceFile.auth.other',
                          ),
                        )
                        .join(', '),
                      member.membershipStatus === 'ACTIVE'
                        ? null
                        : t(memberStatusKey(member.membershipStatus)),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="server-admin-space-file-card"
        aria-labelledby="space-file-storage-title"
      >
        <div className="server-admin-space-file-storage-head">
          <h3 id="space-file-storage-title" className="eyebrow">
            {t('serverAdmin.spaceFile.storageTitle')}
          </h3>
          <strong
            className={
              ratio !== null && ratio >= PRESSURE_RATIO
                ? 'is-warning'
                : undefined
            }
          >
            {storage.quotaBytes !== null
              ? t('serverAdmin.spaceFile.storageOf', {
                  used: formatBytes(storage.usedBytes),
                  quota: formatBytes(storage.quotaBytes),
                  percent: Math.round((ratio ?? 0) * 100),
                })
              : t('serverAdmin.spaceFile.storageUnmetered', {
                  used: formatBytes(storage.usedBytes),
                })}
          </strong>
        </div>
        {ratio !== null && fill !== null ? (
          <div
            className="server-admin-space-file-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fill * 100)}
            aria-label={t('serverAdmin.spaceFile.storageTitle')}
          >
            <span
              className={ratio >= PRESSURE_RATIO ? 'is-warning' : undefined}
              style={{ inlineSize: `${fill * 100}%` }}
            />
          </div>
        ) : null}
        {storage.override ? (
          <p className="server-admin-space-file-override">
            {storage.override.effectiveUntil
              ? t('serverAdmin.spaceFile.overrideUntil', {
                  quota: formatBytes(storage.override.quotaBytes),
                  date: formatDay(storage.override.effectiveUntil),
                })
              : t('serverAdmin.spaceFile.override', {
                  quota: formatBytes(storage.override.quotaBytes),
                })}
          </p>
        ) : null}
        {storage.byMediaType.length > 0 ? (
          <p className="server-admin-muted">
            {storage.byMediaType
              .map(
                (usage) =>
                  `${t(MEDIA_KEYS[usage.mediaType] ?? 'serverAdmin.spaceFile.media.other')} ${formatBytes(usage.bytes)}`,
              )
              .join(' · ')}
          </p>
        ) : null}
      </section>

      <section
        className="server-admin-space-file-card"
        aria-labelledby="space-file-timeline-title"
      >
        <h3 id="space-file-timeline-title" className="eyebrow">
          {t('serverAdmin.spaceFile.timelineTitle')}
        </h3>
        {timeline.length === 0 ? (
          <p className="server-admin-muted">
            {t('serverAdmin.spaceFile.timelineEmpty')}
          </p>
        ) : (
          <ol className="server-admin-space-file-timeline">
            {timeline.map((entry) => (
              <li key={`${entry.kind}-${entry.at.toISOString()}`}>
                <time dateTime={entry.at.toISOString()}>
                  {formatDay(entry.at)}
                </time>
                <span>{timelineText(entry, t)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="server-admin-space-file-actions">
        {storage.quotaBytes !== null ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => setSheet('quota')}
          >
            {t('serverAdmin.spaceFile.adjustStorage')}
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          onClick={() => setSheet('gift')}
        >
          {gift
            ? t('serverAdmin.spaceFile.manageGift')
            : t('serverAdmin.spaceFile.giftPremium')}
        </button>
      </div>
      <p className="server-admin-muted">{t('serverAdmin.spaceFile.privacy')}</p>

      {sheet === 'quota' ? (
        <ServerAdminStorageQuotaSheet
          api={api}
          spaceId={space.id}
          storage={storage}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            onChanged();
          }}
        />
      ) : null}
      {sheet === 'gift' ? (
        <ServerAdminPremiumGiftSheet
          api={api}
          spaceId={space.id}
          grants={entitlement.grants}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            onChanged();
          }}
        />
      ) : null}
    </article>
  );
}

/** The Space file: whom a Space concerns, its plan, storage and history. */
export function ServerAdminSpaceFile({
  api,
  spaceId,
  headingRef,
  onClose,
}: {
  api: ServerAdminApi;
  spaceId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileQuery = useQuery({
    queryKey: ['server-admin', 'space-file', spaceId],
    queryFn: () => api.getServerAdminSpaceFile({ spaceId }),
    retry: false,
    // Every load is a recorded view; only reload after a change here.
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <section
      id="server-space-detail"
      className="server-admin-panel server-admin-panel-wide"
      aria-busy={fileQuery.isPending}
    >
      {fileQuery.isPending ? (
        <p className="server-admin-muted" aria-live="polite">
          {t('serverAdmin.spaces.detail.loading')}
        </p>
      ) : fileQuery.isError ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.spaces.detail.error')}
        </p>
      ) : (
        <SpaceFileContent
          file={fileQuery.data}
          api={api}
          headingRef={headingRef}
          onChanged={() => {
            void queryClient.invalidateQueries({
              queryKey: ['server-admin', 'space-file', spaceId],
            });
            void queryClient.invalidateQueries({
              queryKey: ['server-admin', 'overview'],
            });
          }}
        />
      )}
      <button type="button" className="text-button" onClick={onClose}>
        {t('serverAdmin.spaces.detail.close')}
      </button>
    </section>
  );
}
