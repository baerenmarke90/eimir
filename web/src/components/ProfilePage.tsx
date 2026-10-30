import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../client/apiConfiguration';
import { MORE_PASSPORT_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProfileIdentityPanel } from './ProfileIdentityPanel';
import {
  ProfilePreferencesSection,
  RelationshipSummarySection,
} from './ProfilePageBase';
import './ProfilePage.css';

export interface ProfilePageProps {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
}

export function ProfilePage(props: ProfilePageProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(props.account.displayName);
  const currentAccount = useMemo(
    () => ({ ...props.account, displayName }),
    [props.account, displayName],
  );
  const currentProps = useMemo(
    () => ({ ...props, account: currentAccount }),
    [props, currentAccount],
  );

  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: props.apiBaseUrl,
        headers: { Authorization: `Bearer ${props.accessToken}` },
      }),
    [props.accessToken, props.apiBaseUrl],
  );
  const spacesApi = useMemo(
    () => new SpacesApi(configuration),
    [configuration],
  );

  return (
    <div className="page profile-page">
      <PageHeader title={t('profiles.title')} />

      {/* 1. Identity panel for current user */}
      <ProfileIdentityPanel
        {...currentProps}
        onDisplayNameChanged={(nextDisplayName) => {
          setDisplayName(nextDisplayName);
        }}
      />

      {/* Relationship compact badge/row (if anniversary date is configured) */}
      <RelationshipSummarySection
        spacesApi={spacesApi}
        spaceId={props.spaceId}
      />

      {/* 2. Personal and partner profile content remains ahead of product/account messaging. */}
      <ProfilePreferencesSection {...currentProps} />

      <Link className="profile-passport-entry" to={MORE_PASSPORT_ROUTE}>
        <span>
          <strong>{t('recaps.shortTitle')}</strong>
          <span>{t('recaps.profileLink')}</span>
        </span>
        <span aria-hidden="true">↗</span>
      </Link>

      {/* 3. Account-level Premium information stays factual and secondary. */}
      <details
        id="profile-premium"
        className="profile-premium-section"
        aria-labelledby="profile-premium-title"
      >
        <summary className="profile-premium-title-row">
          <h2 id="profile-premium-title">{t('profiles.premium.title')}</h2>
        </summary>
        <p className="profile-premium-lead">
          {t('profiles.premium.gamesTitle')}
        </p>
        <p className="profile-section-intro">
          {t('profiles.premium.gamesBody')}
        </p>
        <details className="profile-premium-details">
          <summary>{t('profiles.premium.action')}</summary>
          <div className="profile-premium-details-copy">
            <strong>{t('profiles.premium.detailsTitle')}</strong>
            <p>{t('profiles.premium.detailsBody')}</p>
          </div>
        </details>
      </details>
    </div>
  );
}
