import { useMemo } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { RulesApi } from '../api/generated/apis/RulesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../api/generated/runtime';
import { isDemoModeConfigured } from '../client/demoMode';
import {
  appRoutePath,
  isSettingsCategoryId,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_SETTINGS_ROUTE,
  settingsCategoryIdFromHash,
  settingsCategoryPath,
  type SettingsCategoryId,
} from '../client/routes';
import { settingsCategoryDefinition } from '../client/settingsNavigation';
import { useTranslation } from '../i18n';
import { AccountSettingsPanel } from './AccountSettingsPanel';
import {
  AnniversaryReminderSettings,
  PartnerBirthdayReminderSettings,
} from './AnniversaryReminderSettings';
import { DashboardSettingsPanel } from './DashboardSettingsPanel';
import { PageHeader } from './PageHeader';
import { PartnerConnectionPanel } from './PartnerConnectionPanel';
import { ProfileAppearancePanel } from './ProfileAppearancePanel';
import { RelationshipSettingsSection } from './ProfilePageBase';
import { SettingsIndex } from './SettingsIndex';
import { SpaceOffboardingPanel } from './SpaceOffboardingPanel';
import { TransferPanel } from './TransferPanel';
import './SettingsPage.css';

export interface SettingsPageProps {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
}

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { settingsCategory } = useParams<{ settingsCategory?: string }>();

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
  const rulesApi = useMemo(() => new RulesApi(configuration), [configuration]);
  const dashboardApi = useMemo(
    () => new DashboardApi(configuration),
    [configuration],
  );
  const demoMode = isDemoModeConfigured();

  const legacyCategory =
    settingsCategory === undefined
      ? settingsCategoryIdFromHash(location.hash)
      : null;
  if (legacyCategory) {
    return <Navigate replace to={settingsCategoryPath(legacyCategory)} />;
  }

  if (
    settingsCategory !== undefined &&
    !isSettingsCategoryId(settingsCategory)
  ) {
    return <Navigate replace to={MORE_SETTINGS_ROUTE} />;
  }

  const categoryId: SettingsCategoryId | null =
    settingsCategory && isSettingsCategoryId(settingsCategory)
      ? settingsCategory
      : null;
  const category = categoryId ? settingsCategoryDefinition(categoryId) : null;

  const openDataCategory = () => {
    navigate(settingsCategoryPath('data'));
  };

  let categoryContent = null;
  if (categoryId === 'relationship') {
    categoryContent = (
      <div
        id="settings-connection"
        className="settings-category-content settings-connection-block"
      >
        <RelationshipSettingsSection
          spacesApi={spacesApi}
          spaceId={props.spaceId}
        />
        <PartnerConnectionPanel {...props} />
      </div>
    );
  } else if (categoryId === 'notifications') {
    categoryContent = (
      <section
        id="settings-notifications"
        className="settings-category-content settings-functional-panel"
        aria-label={t('profileIdentity.settingsNotifications')}
      >
        <AnniversaryReminderSettings
          rulesApi={rulesApi}
          spaceId={props.spaceId}
        />
        <PartnerBirthdayReminderSettings
          rulesApi={rulesApi}
          spaceId={props.spaceId}
        />
        <div className="form-actions settings-notification-inbox-action">
          <Link
            className="button-link secondary-link"
            to={MORE_NOTIFICATIONS_ROUTE}
          >
            {t('profileIdentity.settingsNotificationsAction')}
          </Link>
        </div>
      </section>
    );
  } else if (categoryId === 'today') {
    categoryContent = (
      <div className="settings-category-content">
        <DashboardSettingsPanel
          dashboardApi={dashboardApi}
          accountId={props.account.id}
          spaceId={props.spaceId}
        />
      </div>
    );
  } else if (categoryId === 'appearance') {
    categoryContent = (
      <div
        id="settings-appearance"
        className="settings-category-content settings-appearance-block"
      >
        <ProfileAppearancePanel id="settings-appearance-panel" />
      </div>
    );
  } else if (categoryId === 'data') {
    categoryContent = (
      <div
        id="settings-data"
        className="settings-category-content settings-data-block"
      >
        <TransferPanel
          apiBaseUrl={props.apiBaseUrl}
          accessToken={props.accessToken}
          spaceId={props.spaceId}
        />
      </div>
    );
  } else if (categoryId === 'account') {
    categoryContent = (
      <section
        id="settings-account"
        className="settings-category-content settings-sensitive-zone"
        aria-labelledby="settings-sensitive-heading"
      >
        <div className="settings-sensitive-head">
          <p className="eyebrow">
            {t('profileIdentity.settingsSensitiveEyebrow')}
          </p>
          <h2 id="settings-sensitive-heading">
            {t('profileIdentity.settingsSensitiveTitle')}
          </h2>
          <p>{t('profileIdentity.settingsSensitiveIntro')}</p>
        </div>
        <div className="settings-sensitive-grid">
          <SpaceOffboardingPanel
            spacesApi={spacesApi}
            spaceId={props.spaceId}
            demoMode={demoMode}
            onOpenDataExport={openDataCategory}
          />
          <AccountSettingsPanel
            apiBaseUrl={props.apiBaseUrl}
            accessToken={props.accessToken}
            demoMode={demoMode}
            onOpenDataExport={openDataCategory}
          />
        </div>
      </section>
    );
  }

  const backTarget = category ? MORE_SETTINGS_ROUTE : appRoutePath('more');
  const backLabel = category
    ? t('profileIdentity.settingsBackToIndex')
    : t('profileIdentity.settingsBackToMore');

  return (
    <div
      className={
        category
          ? 'page settings-page settings-category-page'
          : 'page settings-page settings-index-page'
      }
    >
      <PageHeader
        before={
          <Link className="settings-back-link" to={backTarget}>
            <span aria-hidden="true">←</span>
            <span>{backLabel}</span>
          </Link>
        }
        eyebrow={t('navigation.settings')}
        title={category ? t(category.titleKey) : t('navigation.settings')}
        description={
          category
            ? t(category.descriptionKey)
            : t('profileIdentity.settingsPageIntro')
        }
      />

      {category ? categoryContent : <SettingsIndex />}
    </div>
  );
}
