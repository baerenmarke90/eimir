import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { useTranslation } from '../i18n';
import { shortSpaceId } from './ServerAdminSpaceFile';
import { sectionHref } from './serverAdminAreas';

const MIN_QUERY_LENGTH = 2;

/** One field over Accounts and Spaces: an email part or an id. */
export function ServerAdminPeopleSearch({ api }: { api: ServerAdminApi }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const query = useDeferredValue(value.trim());
  const ready = query.replaceAll(/[%_]/g, '').length >= MIN_QUERY_LENGTH;

  const searchQuery = useQuery({
    queryKey: ['server-admin', 'search', query],
    queryFn: () => api.searchServerAdmin({ q: query }),
    enabled: ready,
    retry: false,
  });
  const result = searchQuery.data;
  const count = result ? result.accounts.length + result.spaces.length : 0;

  return (
    <section
      className="server-admin-panel server-admin-panel-wide server-admin-people-search"
      aria-labelledby="server-people-search-title"
    >
      <h2 id="server-people-search-title">{t('serverAdmin.people.title')}</h2>
      <label className="server-admin-people-search-field">
        <span className="sr-only">{t('serverAdmin.people.label')}</span>
        <input
          type="search"
          value={value}
          placeholder={t('serverAdmin.people.placeholder')}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
        />
        {ready && result ? (
          <span className="server-admin-muted" aria-live="polite">
            {t('serverAdmin.people.count', { count })}
          </span>
        ) : null}
      </label>

      {!ready ? (
        <p className="server-admin-muted">{t('serverAdmin.people.hint')}</p>
      ) : searchQuery.isPending ? (
        <p className="server-admin-muted">{t('serverAdmin.people.loading')}</p>
      ) : searchQuery.isError ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.people.error')}
        </p>
      ) : !result || count === 0 ? (
        <p className="server-admin-muted">{t('serverAdmin.people.empty')}</p>
      ) : (
        <div className="server-admin-people-results">
          {result.spaces.length > 0 ? (
            <div>
              <h3>{t('serverAdmin.people.spaces')}</h3>
              <ul className="server-admin-people-list">
                {result.spaces.map((space) => (
                  <li key={space.id}>
                    <Link to={sectionHref('spaces', { space: space.id })}>
                      <strong>
                        {t('serverAdmin.spaceFile.title', {
                          id: shortSpaceId(space.id),
                        })}
                      </strong>
                      <span className="server-admin-muted">
                        {t('serverAdmin.people.spaceMembers', {
                          count: space.activeMembershipCount,
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.accounts.length > 0 ? (
            <div>
              <h3>{t('serverAdmin.people.accounts')}</h3>
              <ul className="server-admin-people-list">
                {result.accounts.map((account) => (
                  <li key={account.id}>
                    <Link to={sectionHref('accounts', { account: account.id })}>
                      <strong>
                        {account.primaryEmail ??
                          t('serverAdmin.spaceFile.member.noEmail')}
                      </strong>
                      <span className="server-admin-muted">
                        {t(
                          account.emailVerified
                            ? 'serverAdmin.accounts.verification.verified'
                            : 'serverAdmin.accounts.verification.unverified',
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
