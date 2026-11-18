import { Navigate, useLocation } from 'react-router-dom';
import { PRO_INFORMATION_ROUTE } from '../client/routes';
import { useMemo, useState } from 'react';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../client/apiConfiguration';
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
  const location = useLocation();
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

  if (location.hash === '#profile-premium')
    return <Navigate replace to={PRO_INFORMATION_ROUTE} />;

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
    </div>
  );
}
