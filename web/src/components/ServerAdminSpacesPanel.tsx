import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { resolvedLocale, useTranslation } from '../i18n';
import { ServerAdminSpaceFile } from './ServerAdminSpaceFile';

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ServerAdminSpacesPanel({
  api,
  initialSpaceId = null,
}: {
  api: ServerAdminApi;
  /** A `?space=` link, for example from the Situation; ignored unless a UUID. */
  initialSpaceId?: string | null;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SpaceFilter>('all');
  const [offset, setOffset] = useState(0);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(() =>
    initialSpaceId && UUID_PATTERN.test(initialSpaceId) ? initialSpaceId : null,
  );
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
  useEffect(() => {
    if (initialSpaceId && UUID_PATTERN.test(initialSpaceId)) {
      setSelectedSpaceId(initialSpaceId);
    }
  }, [initialSpaceId]);

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
                        {t('common.open')}
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
        <ServerAdminSpaceFile
          key={selectedSpaceId}
          api={api}
          spaceId={selectedSpaceId}
          headingRef={detailHeadingRef}
          onClose={() => setSelectedSpaceId(null)}
        />
      ) : null}
    </>
  );
}
