import { Navigate, useLocation } from 'react-router-dom';
import { PRO_INFORMATION_ROUTE } from '../client/routes';
import { useMemo, useRef, useState } from 'react';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../client/apiConfiguration';
import { usePartnerName } from '../client/partnerLocation';
import { usePartnerNickname } from '../client/partnerNickname';
import { useTranslation } from '../i18n';
import {
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { PageHeader } from './PageHeader';
import { ProfileIdentityPanel } from './ProfileIdentityPanel';
import {
  ProfilePreferencesSection,
  RelationshipSummarySection,
} from './ProfilePageBase';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
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
  // Names the partner (nickname, else name) instead of "your partner" (#2063).
  const partner = usePartnerName({
    apiBaseUrl: props.apiBaseUrl,
    accessToken: props.accessToken,
    accountId: props.account.id,
    spaceId: props.spaceId,
  });
  const { relationshipLabel, nicknameFor } = usePartnerNickname();
  // The profile's actions live in the shared menu at the top right; each row
  // raises a request that the section owning that action answers once.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);
  const [requests, setRequests] = useState({
    edit: 0,
    preference: 0,
    nickname: 0,
  });
  const request = (kind: keyof typeof requests) =>
    leaveItemMenu(
      menuSheet,
      () =>
        setRequests((current) => ({ ...current, [kind]: current[kind] + 1 })),
      () => setMenuOpen(false),
    );
  const partnerLabel = partner.name
    ? relationshipLabel(partner.id, partner.name, '')
    : '';
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
      <PageHeader
        title={
          partnerLabel
            ? t('profiles.titleWithPartner', { name: partnerLabel })
            : t('profiles.title')
        }
        titleAction={
          <ItemMenuTrigger
            triggerRef={menuTrigger}
            label={t('profiles.menu')}
            open={menuOpen}
            onOpen={() => setMenuOpen(true)}
          />
        }
      />
      <ItemMenuSheet
        open={menuOpen}
        title={t('profiles.menu')}
        restoreFocusRef={menuTrigger}
        sheetRef={menuSheet}
        onClose={() => setMenuOpen(false)}
      >
        <ItemMenuOption
          icon="pen"
          title={t('profileIdentity.editProfile')}
          onClick={() => request('edit')}
        />
        <ItemMenuOption
          icon="hinzufuegen"
          title={t('profiles.addPreference')}
          onClick={() => request('preference')}
        />
        {partner.id ? (
          <ItemMenuOption
            icon="smile-plus"
            title={t(
              nicknameFor(partner.id)
                ? 'profiles.nickname.edit'
                : 'profiles.nickname.add',
            )}
            onClick={() => request('nickname')}
          />
        ) : null}
      </ItemMenuSheet>

      {/* 1. Identity panel for current user */}
      <ProfileIdentityPanel
        {...currentProps}
        editRequest={requests.edit}
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
      <ProfilePreferencesSection
        {...currentProps}
        addPreferenceRequest={requests.preference}
        nicknameRequest={requests.nickname}
      />
    </div>
  );
}
