import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminSpaceDetail } from '../api/generated/models/ServerAdminSpaceDetail';
import { resolvedLocale, useTranslation } from '../i18n';

const PAGE_SIZE = 25;

type SpaceFilter = 'all' | 'active' | 'inactive' | 'empty' | 'anomaly';

function formatDate(value: Date | null): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function lifecycleLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'active':
      return t('serverAdmin.spaces.lifecycle.active');
    case 'inactive':
      return t('serverAdmin.spaces.lifecycle.inactive');
    case 'empty':
      return t('serverAdmin.spaces.lifecycle.empty');
    default:
      return status;
  }
}

function anomalyLabel(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'no_memberships':
      return t('serverAdmin.spaces.anomalies.noMemberships');
    case 'too_many_active_memberships':
      return t('serverAdmin.spaces.anomalies.tooManyActive');
    default:
      return code;
  }
}

function SpaceDetail({
  space,
  headingRef,
}: {
  space: ServerAdminSpaceDetail;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <section
      id="server-space-detail"
      className="server-admin-panel server-admin-panel-wide"
      aria-labelledby="server-space-detail-title"
    >
      <div className="server-admin-account-detail-heading">
        <div>
          <p className="eyebrow">{t('serverAdmin.spaces.detail.eyebrow')}</p>
          <h2 id="server-space-detail-title" ref={headingRef} tabIndex={-1}>
            {t('serverAdmin.spaces.detail.title')}
          </h2>
          <p className="server-admin-muted server-admin-actor-id">{space.id}</p>
        </div>
        <span
          className={`server-admin-badge ${space.anomalyCodes.length > 0 ? 'is-warning' : 'is-ok'}`}
        >
          {lifecycleLabel(space.lifecycleStatus, t)}
        </span>
      </div>

      <dl className="server-admin-metrics server-admin-account-detail-metrics">
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.createdAt')}</dt>
          <dd>{formatDate(space.createdAt)}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.memberships')}</dt>
          <dd>{space.membershipCount}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.activeMemberships')}</dt>
          <dd>{space.activeMembershipCount}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.historicalMemberships')}</dt>
          <dd>{space.historicalMembershipCount}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.leftMemberships')}</dt>
          <dd>{space.leftMembershipCount}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.removedMemberships')}</dt>
          <dd>{space.removedMembershipCount}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.firstMembership')}</dt>
          <dd>{formatDate(space.firstMembershipAt)}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.lastLifecycleChange')}</dt>
          <dd>{formatDate(space.lastMembershipChangeAt)}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.spaces.latestEndedMembership')}</dt>
          <dd>{formatDate(space.latestMembershipEndedAt)}</dd>
        </div>
      </dl>

      {space.anomalyCodes.length > 0 ? (
        <div className="server-admin-warning-panel">
          <strong>{t('serverAdmin.spaces.anomalies.title')}</strong>
          <ul>
            {space.anomalyCodes.map((code) => (
              <li key={code}>{anomalyLabel(code, t)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="server-admin-muted">
        {t('serverAdmin.spaces.detail.privacy')}
      </p>
    </section>
  );
}

export function ServerAdminSpacesPanel({ api }: { api: ServerAdminApi }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SpaceFilter>('all');
  const [offset, setOffset] = useState(0);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const request = useMemo(
    () => ({
      query: search.trim() || undefined,
      status,
      limit: PAGE_SIZE,
      offset,
    }),
    [offset, search, status],
  );
  const spacesQuery = useQuery({
    queryKey: ['server-admin', 'spaces', request],
    queryFn: () => api.listServerAdminSpacesApiV1ServerAdminSpacesGet(request),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ['server-admin', 'space', selectedSpaceId],
    queryFn: () =>
      api.getServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGet({
        spaceId: selectedSpaceId as string,
      }),
    enabled: selectedSpaceId !== null,
    retry: false,
  });

  useEffect(() => {
    if (selectedSpaceId !== null && detailQuery.data) {
      detailHeadingRef.current?.focus();
    }
  }, [detailQuery.data, selectedSpaceId]);

  const total = spacesQuery.data?.total ?? 0;
  const canPrevious = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <>
      <section
        className="server-admin-panel server-admin-panel-wide"
        aria-labelledby="server-spaces-title"
      >
        <div className="server-admin-panel-heading">
          <div>
            <h2 id="server-spaces-title">{t('serverAdmin.spaces.title')}</h2>
            <p className="server-admin-muted">{t('serverAdmin.spaces.body')}</p>
          </div>
          <span className="server-admin-count">
            {total} {t('serverAdmin.spaces.totalSuffix')}
          </span>
        </div>

        <div className="server-admin-account-filters">
          <label>
            {t('serverAdmin.spaces.search')}
            <input
              type="search"
              value={search}
              placeholder={t('serverAdmin.spaces.searchPlaceholder')}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label>
            {t('serverAdmin.spaces.status.label')}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SpaceFilter);
                setOffset(0);
              }}
            >
              <option value="all">{t('serverAdmin.spaces.status.all')}</option>
              <option value="active">
                {t('serverAdmin.spaces.status.active')}
              </option>
              <option value="inactive">
                {t('serverAdmin.spaces.status.inactive')}
              </option>
              <option value="empty">
                {t('serverAdmin.spaces.status.empty')}
              </option>
              <option value="anomaly">
                {t('serverAdmin.spaces.status.anomaly')}
              </option>
            </select>
          </label>
        </div>

        {spacesQuery.isPending ? (
          <p className="server-admin-muted">
            {t('serverAdmin.spaces.loading')}
          </p>
        ) : spacesQuery.error ? (
          <p className="status status-error" role="alert">
            {t('serverAdmin.spaces.error')}
          </p>
        ) : spacesQuery.data?.items.length === 0 ? (
          <p className="server-admin-muted">{t('serverAdmin.spaces.empty')}</p>
        ) : (
          <div className="server-admin-table-scroll">
            <table className="server-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('serverAdmin.spaces.spaceId')}</th>
                  <th scope="col">{t('serverAdmin.spaces.lifecycleLabel')}</th>
                  <th scope="col">
                    {t('serverAdmin.spaces.activeMemberships')}
                  </th>
                  <th scope="col">
                    {t('serverAdmin.spaces.historicalMemberships')}
                  </th>
                  <th scope="col">
                    {t('serverAdmin.spaces.lastLifecycleChange')}
                  </th>
                  <th scope="col">{t('serverAdmin.spaces.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {spacesQuery.data?.items.map((space) => (
                  <tr key={space.id}>
                    <td className="server-admin-actor-id">{space.id}</td>
                    <td>
                      <span
                        className={`server-admin-badge ${space.anomalyCodes.length > 0 ? 'is-warning' : 'is-ok'}`}
                      >
                        {lifecycleLabel(space.lifecycleStatus, t)}
                      </span>
                    </td>
                    <td>{space.activeMembershipCount}</td>
                    <td>{space.historicalMembershipCount}</td>
                    <td>{formatDate(space.lastMembershipChangeAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        aria-controls="server-space-detail"
                        aria-expanded={selectedSpaceId === space.id}
                        onClick={() => setSelectedSpaceId(space.id)}
                      >
                        {t('serverAdmin.spaces.open')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="server-admin-pagination">
          <button
            type="button"
            className="secondary-button"
            disabled={!canPrevious}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            {t('serverAdmin.spaces.previous')}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!canNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            {t('serverAdmin.spaces.next')}
          </button>
        </div>
      </section>

      {selectedSpaceId !== null ? (
        detailQuery.isPending ? (
          <section
            id="server-space-detail"
            className="server-admin-panel server-admin-panel-wide"
            aria-live="polite"
          >
            <p className="server-admin-muted">
              {t('serverAdmin.spaces.detail.loading')}
            </p>
          </section>
        ) : detailQuery.error ? (
          <section
            id="server-space-detail"
            className="server-admin-panel server-admin-panel-wide"
          >
            <p className="status status-error" role="alert">
              {t('serverAdmin.spaces.detail.error')}
            </p>
            <button type="button" onClick={() => setSelectedSpaceId(null)}>
              {t('serverAdmin.spaces.detail.close')}
            </button>
          </section>
        ) : detailQuery.data ? (
          <>
            <SpaceDetail
              space={detailQuery.data}
              headingRef={detailHeadingRef}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSelectedSpaceId(null)}
            >
              {t('serverAdmin.spaces.detail.close')}
            </button>
          </>
        ) : null
      ) : null}
    </>
  );
}
