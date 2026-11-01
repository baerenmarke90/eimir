import { useQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { DashboardItemType } from '../api/generated/models/DashboardItemType';
import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import { DashboardViewToJSON } from '../api/generated/models/DashboardView';
import { DurationDisplayMode } from '../api/generated/models/DurationDisplayMode';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { DashboardModuleKey } from '../client/dashboardModules';
import {
  dashboardPreferencesQueryKey,
  isDashboardModuleVisible,
  limitUpcomingItems,
  orderedDashboardModuleKeys,
  selectedDashboardCollectionId,
} from '../client/dashboardPreferences';
import { dashboardItemTitle } from '../client/dashboardPresentation';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { formatCalendarDate, formatRecency } from '../client/formatRecency';
import {
  dashboardItemPath,
  engagementTargetPath,
  type M4ProductApis,
} from '../client/m4Product';
import { decodeDashboardOverview } from '../client/overviewSnapshots';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  PARTNER_PRESENCE_PRODUCT_ENABLED,
  usePartnerPresence,
} from '../client/presence';
import { normalizeClientError } from '../client/problemDetails';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  collectionDetailPath,
} from '../client/routes';
import { spaceConfigurationQueryOptions } from '../client/spaceConfiguration';
import {
  type LivingModule,
  livingModuleContentId,
  selectLivingModule,
  selectMonthlyNotes,
  selectMonthlyStrip,
  selectTodayFocalItem,
} from '../client/todayComposition';
import {
  clearForeignRetrospectiveDismissal,
  isRetrospectiveDismissed,
  rememberRetrospectiveDismissal,
  retrospectiveDismissalToken,
} from '../client/todayRetrospectiveDismissal';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useWarmOverviewQuery } from '../client/useWarmOverviewQuery';
import { useWirStatistics } from '../client/useWirStatistics';
import { resolvedLocale, useTranslation } from '../i18n';
import { AnticipationCard } from './AnticipationCard';
import {
  CouplePresence,
  type CouplePresenceAvatarAction,
} from './CouplePresence';
import { DailyEnergyCheckIn } from './DailyEnergyCheckIn';
import { DailyQuoteCard } from './DailyQuoteCard';
import { SharedExperienceReveal } from './SharedExperienceReveal';
import { DailyVibeCheckIn } from './DailyVibeCheckIn';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { PartnerQuickActions } from './PartnerQuickActions';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { SharedStorySummary } from './SharedStorySummary';
import { TodayDestinationLink } from './TodayDestinationLink';
import { TodayPinnedCollection } from './TodayPinnedCollection';
import { UiState } from './UiState';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  MonthlyRecapInvitation,
  useMonthlyRecapInvitation,
} from './MonthlyRecapInvitation';
import './TodayPage.css';
import { useWirDesign } from '../client/wirDesign';
import './WirDesign.css';

export function formatRelationshipDuration(
  duration: DashboardRelationshipDuration,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (duration.displayMode !== DurationDisplayMode.YEARS_MONTHS) {
    if (duration.daysTogether === 1) {
      return t('m5s5.dashboard.durationDaysOne', {
        defaultValue: '1 Tag zusammen',
      });
    }
    return t('m5s5.dashboard.durationDays', {
      count: duration.daysTogether,
    });
  }

  // DurationDisplayMode.YEARS_MONTHS:
  // Derived strictly from the server-authoritative daysTogether and startedOn.
  const start = new Date(duration.startedOn);
  const end = new Date(start.getTime() + duration.daysTogether * 86_400_000);

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  const days = end.getUTCDate() - start.getUTCDate();

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  years = Math.max(0, years);
  months = Math.max(0, months);

  const yearsLabel =
    years === 1
      ? t('m5s5.dashboard.yearOne', { defaultValue: 'Jahr' })
      : t('m5s5.dashboard.yearMany', { defaultValue: 'Jahre' });
  const monthsLabel =
    months === 1
      ? t('m5s5.dashboard.monthOne', { defaultValue: 'Monat' })
      : t('m5s5.dashboard.monthMany', { defaultValue: 'Monate' });

  if (years > 0 && months > 0) {
    return t('m5s5.dashboard.durationYearsMonths', {
      years,
      yearsLabel,
      months,
      monthsLabel,
      defaultValue: `${years} ${yearsLabel}, ${months} ${monthsLabel} zusammen`,
    });
  }

  if (years > 0) {
    return t('m5s5.dashboard.durationYearsOnly', {
      years,
      yearsLabel,
      defaultValue: `${years} ${yearsLabel} zusammen`,
    });
  }

  if (months > 0) {
    return t('m5s5.dashboard.durationMonthsOnly', {
      months,
      monthsLabel,
      defaultValue: `${months} ${monthsLabel} zusammen`,
    });
  }

  if (duration.daysTogether === 1) {
    return t('m5s5.dashboard.durationDaysOne', {
      defaultValue: '1 Tag zusammen',
    });
  }
  return t('m5s5.dashboard.durationDays', {
    count: duration.daysTogether,
  });
}

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

export type TodayCardVariant = 'recent' | 'retrospective' | 'keepsake';

/**
 * Presentation roles for modules composed on the Today orchestration surface.
 * Rather than equal-sized dashboard widgets, each role fulfills an intentional
 * relationship purpose.
 */
export type TodayPresentationRole =
  | 'hero' // Stable couple presence & emotional anchor
  | 'primary_context' // 0-1 current relevant action/item (e.g. today's plan or due reminder)
  | 'relationship_signal' // 0-1 partner interaction signal (e.g. partner commented on memory)
  | 'shared_content' // Recent shared relationship moments
  | 'editorial_highlight'; // Retrospective discovery (e.g. "Weißt du noch?")

export function TodayModuleSection({
  id,
  className,
  colorWorld,
  title,
  kicker,
  subline,
  headerAction,
  children,
}: {
  id?: string;
  className?: string;
  colorWorld?: 'natural' | 'warm';
  title: string;
  kicker?: string;
  subline?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`today-section ${className ?? ''}`.trim()}
      data-color-world={colorWorld}
    >
      <div className="today-section-header">
        <div>
          {kicker ? (
            <span className="today-section-kicker">{kicker}</span>
          ) : null}
          <h2 className="today-section-title">{title}</h2>
          {subline ? <p className="today-section-subline">{subline}</p> : null}
        </div>
        {headerAction ? (
          <div className="today-section-action">{headerAction}</div>
        ) : null}
      </div>
      <div className="today-section-body">{children}</div>
    </section>
  );
}

function RecentItemTypeIcon({ type }: { type: DashboardItemType }) {
  const names: Partial<Record<DashboardItemType, EimirIconName>> = {
    HEART_MOMENT: 'momente',
    ANNIVERSARY: 'momente',
    BIRTHDAY: 'geburtstag',
    MILESTONE: 'meilensteine',
    CHAPTER: 'kapitel',
    COLLECTION: 'listen',
    PLAN: 'kalender',
    IMPORTANT_DATE: 'kalender',
    WISH: 'wuensche',
    PLACE: 'orte',
  };
  return (
    <EimirIcon
      name={names[type] ?? 'erinnerungen'}
      className="recent-type-icon"
    />
  );
}

function RecentSharedItemCard({ item }: { item: DashboardItem }) {
  const { t } = useTranslation();
  const path = dashboardItemPath(item.type, item.id);
  const rawDate = item.occurredOn ?? item.scheduledAt ?? item.createdAt;
  const recency = rawDate ? formatRecency(rawDate, t) : null;
  const typeLabel = t(`m5s5.kind.${item.type}`);
  const { title, titleIsDate } = dashboardItemTitle(item, t);

  const tileInner = (
    <>
      <span
        className={`today-recent-tile-icon today-kind-${item.type.toLowerCase()}`}
        aria-hidden="true"
      >
        <RecentItemTypeIcon type={item.type} />
      </span>
      <span className="today-recent-tile-copy">
        {/* Type stays available to assistive tech (it's still meaningful
            context) but isn't a separate visible field - a redundant text
            label next to an already type-specific icon is what made each
            entry read as a database record (icon, name, type, date) rather
            than a warm shared-life trace (#790/#791 fourth follow-up). */}
        <span className="sr-only">{typeLabel}: </span>
        <span className="today-recent-tile-title">{title}</span>
        {recency && !titleIsDate ? (
          <time
            className="today-recent-tile-date"
            dateTime={rawDate?.toISOString()}
          >
            {recency}
          </time>
        ) : null}
      </span>
    </>
  );

  if (path) {
    return (
      <TodayDestinationLink to={path} className="today-recent-tile">
        {tileInner}
      </TodayDestinationLink>
    );
  }
  return (
    <span className="today-recent-tile today-recent-tile-static">
      {tileInner}
    </span>
  );
}

function TodayAgendaRow({ item }: { item: DashboardItem }) {
  const { t } = useTranslation();
  const path = dashboardItemPath(item.type, item.id);
  const rawDate = item.occurredOn ?? item.scheduledAt ?? item.createdAt;
  const calendarDate = item.scheduledOn ?? item.occurredOn;
  const date = calendarDate
    ? new Intl.DateTimeFormat(resolvedLocale(), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(calendarDate)
    : rawDate
      ? new Intl.DateTimeFormat(resolvedLocale(), {
          dateStyle: 'long',
          timeStyle: item.scheduledAt ? 'short' : undefined,
        }).format(rawDate)
      : null;
  const title =
    item.titleOrText?.trim() ||
    t(
      item.type === 'ANNIVERSARY'
        ? 'm5s5.dashboard.anniversaryTitle'
        : `m5s5.kind.${item.type}`,
    );

  const rowInner = (
    <>
      <span className="today-agenda-icon" aria-hidden="true">
        <RecentItemTypeIcon type={item.type} />
      </span>
      <span className="today-agenda-copy">
        <span className="today-agenda-title">{title}</span>
        {date ? (
          <time
            className="today-agenda-date"
            dateTime={
              calendarDate?.toISOString().slice(0, 10) ?? rawDate?.toISOString()
            }
          >
            {date}
          </time>
        ) : null}
      </span>
    </>
  );

  if (path) {
    return (
      <TodayDestinationLink
        to={path}
        className="today-agenda-row today-agenda-row-link"
      >
        {rowInner}
      </TodayDestinationLink>
    );
  }
  return <div className="today-agenda-row">{rowInner}</div>;
}

/**
 * `Euer Moment` — the page's dominant emotional anchor.
 *
 * The photograph is the surface: it carries its own frame, and the title and
 * date sit on a legibility scrim inside it instead of below it in a metadata
 * strip. That is deliberately a different physical grammar from every other
 * module on the page, and it is why this block does not reuse a generic
 * content card.
 */
function TodayMomentFeature({
  item,
  loadMemoryImage,
  isKeepsake,
}: {
  item: DashboardItem;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  isKeepsake: boolean;
}) {
  const { t } = useTranslation();
  const path = dashboardItemPath(item.type, item.id);
  const rawDate = item.occurredOn ?? item.createdAt;
  const { title, titleIsDate } = dashboardItemTitle(item, t);
  const date = item.occurredOn
    ? formatCalendarDate(item.occurredOn)
    : rawDate
      ? formatDate(rawDate)
      : null;
  const previewAttachmentId = item.previewAttachmentId;
  const hasImage = Boolean(previewAttachmentId && loadMemoryImage);

  const feature = hasImage ? (
    <figure className="today-moment-figure eimir-motion-lift">
      <div className="today-moment-media">
        {previewAttachmentId && loadMemoryImage ? (
          <MemoryPreview
            memoryId={item.id}
            attachmentId={previewAttachmentId}
            isSensitive={item.previewIsSensitive}
            allowReveal
            loadImage={loadMemoryImage}
          />
        ) : null}
      </div>
      <figcaption className="today-moment-caption">
        <span className="today-moment-title">{title}</span>
        {date && !titleIsDate ? (
          <time className="today-moment-date" dateTime={rawDate?.toISOString()}>
            {date}
          </time>
        ) : null}
      </figcaption>
    </figure>
  ) : (
    <article className="today-moment-text eimir-motion-lift">
      <span className="today-moment-text-context">
        {isKeepsake
          ? t('m5s5.today.keepsake.textContext')
          : t('m5s5.today.keepsake.sharedTextContext')}
      </span>
      <p className="today-moment-text-content">{title}</p>
      {date && !titleIsDate ? (
        <time
          className="today-moment-text-date"
          dateTime={rawDate?.toISOString()}
        >
          {date}
        </time>
      ) : null}
    </article>
  );

  if (path) {
    return (
      <TodayDestinationLink
        to={path}
        className="today-moment today-moment-link"
        previewControls={hasImage && item.previewIsSensitive === true}
      >
        {feature}
      </TodayDestinationLink>
    );
  }
  return <div className="today-moment">{feature}</div>;
}

/**
 * `Gerade bei euch` — the one contextual relationship module.
 *
 * The candidate is chosen by `selectLivingModule`; this component only renders
 * whichever kind came back. It uses a warm tinted panel with an accent edge so
 * it reads as a different kind of thing from both the agenda tiles above and
 * the quiet activity trace below.
 */
function TodayLivingModuleCard({
  module,
  partnerName,
  partnerAvatarUrl,
  loadMemoryImage,
  onDismissRetrospective,
}: {
  module: LivingModule;
  partnerName: string;
  partnerAvatarUrl?: string | null;
  onDismissRetrospective?: () => void;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
}) {
  const { t } = useTranslation();

  if (module.kind === 'partner_signal') {
    const { activityItem } = module;
    const path = engagementTargetPath(
      activityItem.targetType,
      activityItem.targetId,
    );
    const date = formatDate(activityItem.createdAt);
    const message =
      activityItem.targetType === 'MEMORY'
        ? t('m5s5.today.relationshipSignal.partnerCommentedMemory', {
            name: partnerName,
          })
        : t('m5s5.today.relationshipSignal.partnerCommentedGeneric', {
            name: partnerName,
          });

    return (
      <div className="today-living today-living-partner_signal eimir-motion-lift">
        <div className="today-living-body">
          {/* The partner's own name, not a category label: the section
              heading already says `Gerade bei euch`, and repeating a second
              near-identical caption inside the card is exactly the metadata
              stacking that made this surface read as a dashboard. */}
          <span className="today-living-label">
            <span className="today-living-avatar" aria-hidden="true">
              <PersonIdentity
                displayName={partnerName}
                imageUrl={partnerAvatarUrl}
                size="small"
                showName={false}
                imageAlt={partnerName}
                fallbackAlt={partnerName}
              />
            </span>
            {partnerName}
          </span>
          <p className="today-living-title">{message}</p>
          {date ? <span className="today-living-meta">{date}</span> : null}
        </div>
        {path ? (
          <TodayDestinationLink
            to={path}
            className="today-living-action"
            ariaLabel={t('m5s5.today.relationshipSignal.ariaLabel', {
              name: partnerName,
            })}
          >
            {t('m5s5.today.relationshipSignal.viewAction')}
          </TodayDestinationLink>
        ) : null}
      </div>
    );
  }

  const { item, kind } = module;
  const path = dashboardItemPath(item.type, item.id);
  const { title, titleIsDate } = dashboardItemTitle(item, t);
  const label = t(`m5s5.today.living.${kind}Label`);
  const action = t(`m5s5.today.living.${kind}Action`);
  const rawDate = item.occurredOn ?? item.scheduledAt ?? item.createdAt;
  const meta = rawDate ? formatDate(rawDate) : null;
  const previewAttachmentId = item.previewAttachmentId;
  const hasMedia = Boolean(previewAttachmentId && loadMemoryImage);

  if (kind === 'retrospective') {
    // OpenAPI date-only values are UTC-midnight carriers, not local instants.
    // Read their encoded calendar components without shifting historic days.
    const date = item.occurredOn
      ? new Intl.DateTimeFormat(resolvedLocale(), {
          dateStyle: 'long',
          timeZone: 'UTC',
        }).format(item.occurredOn)
      : meta;
    const dateTime = item.occurredOn
      ? item.occurredOn.toISOString().slice(0, 10)
      : rawDate?.toISOString();

    return (
      <article className="today-living today-living-retrospective eimir-motion-lift">
        <div className="today-retrospective-header">
          <span className="today-living-label">{label}</span>
          {onDismissRetrospective ? (
            <button
              type="button"
              className="today-retrospective-dismiss"
              onClick={onDismissRetrospective}
            >
              {t('m5s5.today.living.retrospectiveDismissToday')}
            </button>
          ) : null}
        </div>
        <figure className="today-retrospective-photo">
          {hasMedia && previewAttachmentId && loadMemoryImage ? (
            <div className="today-retrospective-media">
              <MemoryPreview
                memoryId={item.id}
                attachmentId={previewAttachmentId}
                isSensitive={item.previewIsSensitive}
                loadImage={loadMemoryImage}
              />
            </div>
          ) : null}
          <figcaption
            className={`today-retrospective-caption${
              hasMedia ? '' : ' today-retrospective-text-only'
            }`}
          >
            <span className="today-retrospective-title">{title}</span>
            {date && !titleIsDate ? (
              <time className="today-retrospective-date" dateTime={dateTime}>
                {date}
              </time>
            ) : null}
          </figcaption>
        </figure>
        {path ? (
          <TodayDestinationLink
            to={path}
            className="today-retrospective-action"
          >
            {action}
          </TodayDestinationLink>
        ) : null}
      </article>
    );
  }

  return (
    <div
      className={`today-living today-living-${kind}${
        hasMedia ? ' today-living-has-media' : ''
      } eimir-motion-lift`}
    >
      {hasMedia && previewAttachmentId && loadMemoryImage ? (
        <div className="today-living-media">
          <MemoryPreview
            memoryId={item.id}
            attachmentId={previewAttachmentId}
            isSensitive={item.previewIsSensitive}
            loadImage={loadMemoryImage}
          />
        </div>
      ) : null}
      <div className="today-living-body">
        <span className="today-living-label">{label}</span>
        <p className="today-living-title">{title}</p>
        {meta && !titleIsDate ? (
          <span className="today-living-meta">{meta}</span>
        ) : null}
      </div>
      {path ? (
        <TodayDestinationLink to={path} className="today-living-action">
          {action}
        </TodayDestinationLink>
      ) : null}
    </div>
  );
}

/**
 * `Diesen Monat` — a small strip of this month's real shared photos.
 *
 * Photos carry their real title and calendar date, alongside text highlights.
 * The bounded projection deliberately makes no counted-total claim.
 */
function TodayMonthlyStrip({
  items,
  loadMemoryImage,
}: {
  items: readonly DashboardItem[];
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
}) {
  const { t } = useTranslation();
  const isCarousel = items.length > 1;
  return (
    <ul
      className={`today-monthly-strip today-monthly-strip-${items.length}${
        isCarousel ? ' eimir-media-snap-track' : ''
      }`}
    >
      {items.map((item) => {
        const path = dashboardItemPath(item.type, item.id);
        const { title, titleIsDate } = dashboardItemTitle(item, t);
        const tile = (
          <span className="today-monthly-tile-media">
            {item.previewAttachmentId ? (
              <MemoryPreview
                memoryId={item.id}
                attachmentId={item.previewAttachmentId}
                isSensitive={item.previewIsSensitive}
                loadImage={loadMemoryImage}
              />
            ) : null}
          </span>
        );
        return (
          <li
            key={item.id}
            className={`today-monthly-item${
              isCarousel
                ? ' eimir-media-snap-item eimir-media-snap-item-start'
                : ''
            }`}
          >
            {path ? (
              <TodayDestinationLink to={path} className="today-monthly-tile">
                {tile}
                <span className="today-monthly-caption">
                  <strong>{title}</strong>
                  {item.occurredOn && !titleIsDate ? (
                    <time dateTime={item.occurredOn.toISOString()}>
                      {formatCalendarDate(item.occurredOn)}
                    </time>
                  ) : null}
                </span>
              </TodayDestinationLink>
            ) : (
              <span className="today-monthly-tile">
                {tile}
                <span className="today-monthly-caption">
                  <strong>{title}</strong>
                  {item.occurredOn && !titleIsDate ? (
                    <time dateTime={item.occurredOn.toISOString()}>
                      {formatCalendarDate(item.occurredOn)}
                    </time>
                  ) : null}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
export function TodayPage({
  apis,
  apiBaseUrl,
  spaceId,
  loadMemoryImage,
  profilesApi,
  spacesApi,
  dailyCheckInsApi,
  dailyQuoteApi,
  entitlementApi,
  collectionsApi,
  account,
  recapMediaApis,
}: {
  apis: M4ProductApis;
  apiBaseUrl?: string;
  spaceId: string;
  spacesApi?: SpacesApi;
  dailyCheckInsApi?: DailyCheckInsApi;
  dailyQuoteApi?: DailyQuoteApi;
  entitlementApi?: EntitlementsApi;
  collectionsApi?: CollectionsApi;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  profilesApi?: ProfilesApi;
  account?: AccountView | null;
  recapMediaApis?: ReferenceApis;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const wirDesign = useWirDesign();
  const wirStatistics = useWirStatistics({
    api: entitlementApi,
    instance: apiBaseUrl ?? '',
    accountId: account?.id ?? '',
    spaceId,
  });
  const dashboardQuery = useWarmOverviewQuery({
    queryKey: dashboardQueryKey(spaceId),
    accountId: account?.id,
    apiBaseUrl,
    spaceId,
    kind: 'dashboard-overview',
    load: (signal) =>
      apiCall(() => apis.dashboard.getDashboard({ spaceId }, { signal })),
    serialize: DashboardViewToJSON,
    deserialize: (payload) => decodeDashboardOverview(payload, spaceId),
  });
  const spaceConfigurationQuery = useQuery(
    spaceConfigurationQueryOptions(
      dashboardQuery.data?.space.partner ? spacesApi : undefined,
      account?.id ?? '',
      spaceId,
    ),
  );
  const supportGesturesEnabled =
    !dashboardQuery.isCached &&
    spaceConfigurationQuery.data?.configuration.supportGesturesEnabled === true;
  const energyCheckInEnabled =
    !dashboardQuery.isCached &&
    spaceConfigurationQuery.data?.configuration.energyCheckInEnabled === true;
  const vibeCheckEnabled =
    !dashboardQuery.isCached &&
    spaceConfigurationQuery.data?.configuration.vibeCheckEnabled === true;
  const sharedAchievementsEnabled =
    spaceConfigurationQuery.data?.configuration.sharedAchievementsEnabled ===
    true;
  const dashboardPreferencesQuery = useQuery({
    queryKey: dashboardPreferencesQueryKey(account?.id ?? '', spaceId),
    queryFn: () =>
      apiCall(() => apis.dashboard.listDashboardModulePreferences({ spaceId })),
    enabled: Boolean(account?.id && spaceId),
    retry: false,
  });

  const pinnedCollectionId = selectedDashboardCollectionId(
    dashboardPreferencesQuery.data,
    'pinned_collection',
  );
  const pinnedCollectionVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'pinned_collection',
  );
  const pinnedCollectionQuery = useQuery({
    queryKey: authorSummaryQueryKeys.collectionDetail(
      spaceId,
      pinnedCollectionId ?? undefined,
    ),
    queryFn: () => {
      if (!collectionsApi || !pinnedCollectionId) {
        throw new Error('Pinned Collection is not available.');
      }
      return apiCall(() =>
        collectionsApi.getCollection({
          spaceId,
          collectionId: pinnedCollectionId,
        }),
      );
    },
    enabled: Boolean(
      collectionsApi &&
        pinnedCollectionId &&
        pinnedCollectionVisible &&
        account?.id,
    ),
    retry: false,
  });

  const activityQuery = useQuery({
    queryKey: ['m4', 'activity', spaceId],
    queryFn: () =>
      apiCall(() => apis.activity.getActivity({ spaceId, limit: 10 })),
    enabled: Boolean(apis?.activity && spaceId),
    retry: false,
  });

  const partner = dashboardQuery.data?.space.partner;
  const partnerName = relationshipLabel(
    partner?.id,
    partner?.displayName,
    t('m5s5.today.relationshipSignal.partnerFallback'),
  );
  const presenceQuery = usePartnerPresence({
    accountId: account?.id ?? '',
    spaceId,
    enabled:
      PARTNER_PRESENCE_PRODUCT_ENABLED && Boolean(account?.id && partner),
  });
  const partnerPresenceStatus = !partner
    ? 'waiting'
    : !PARTNER_PRESENCE_PRODUCT_ENABLED
      ? 'unknown'
      : presenceQuery.error
        ? 'unknown'
        : presenceQuery.data?.state === 'ACTIVE'
          ? 'active'
          : presenceQuery.data?.state === 'RECENT'
            ? 'recent'
            : 'unknown';

  const userProfileQuery = useQuery({
    queryKey: ['profile-identity', spaceId, account?.id],
    queryFn: () =>
      profilesApi && account
        ? profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
            accountId: account.id,
            spaceId,
          })
        : null,
    enabled: Boolean(profilesApi && account && spaceId),
    retry: false,
  });

  const partnerProfileQuery = useQuery({
    queryKey: ['profile-identity', spaceId, partner?.id],
    queryFn: () =>
      profilesApi && partner?.id
        ? profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
            accountId: partner.id,
            spaceId,
          })
        : null,
    enabled: Boolean(profilesApi && partner?.id && spaceId),
    retry: false,
  });

  const userAvatar = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    account?.id ?? '',
    userProfileQuery.data?.profileAttachmentId,
  );

  const partnerAvatar = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    partner?.id ?? '',
    partnerProfileQuery.data?.profileAttachmentId,
  );

  /*
   * Product Reference v1 R4 calibrates the existing #850 composition rather
   * than replacing its domains: couple presence first, compact next context,
   * one real shared focal item, then only relevant supporting relationship
   * content. Availability decides what exists; no domain receives placeholder
   * chrome merely because it is registered.
   */

  // 2. Shared Planning Horizon. The item limit is the personal Account+Space
  // Dashboard preference from #848 with the #854 default of 1; Today only
  // consumes it and never defines a limit of its own.
  const anticipation = dashboardQuery.data?.anticipation;
  const upcoming = limitUpcomingItems(
    (dashboardQuery.data?.upcoming ?? []).filter(
      (item) =>
        !(
          anticipation &&
          item.type === 'PLAN' &&
          item.id === anticipation.planId
        ),
    ),
    dashboardPreferencesQuery.data,
  );

  const recentShared = dashboardQuery.data?.recentShared ?? [];
  const retrospective = dashboardQuery.data?.retrospective;
  const serverKeepsake = dashboardQuery.data?.keepsake;

  // This is local presentation state only. The authorized candidate remains
  // server-owned; dismissal neither mutates nor caches a Memory.
  // Wait for the Account-local Dashboard day before expiring persisted state.
  // Only legacy servers fall back to the device day during rolling upgrades.
  const dismissalToken = dashboardQuery.data
    ? retrospectiveDismissalToken(
        account?.id ?? '',
        spaceId,
        dashboardQuery.data.viewerLocalDate,
      )
    : null;
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);
  useEffect(() => {
    clearForeignRetrospectiveDismissal(dismissalToken);
  }, [dismissalToken]);
  const retrospectiveDismissed = Boolean(
    dismissalToken &&
      (dismissedToken === dismissalToken ||
        isRetrospectiveDismissed(dismissalToken)),
  );

  function dismissRetrospectiveToday(): void {
    if (!dismissalToken) return;
    rememberRetrospectiveDismissal(dismissalToken);
    setDismissedToken(dismissalToken);
  }

  // 3. Focal shared content. The authoritative Keepsake wins when present;
  // otherwise a genuine shared story item receives intentional text-first
  // treatment. No eligible photo means a different composition, never an
  // empty image well or generic photo-onboarding copy.
  const incomingCandidate = dashboardQuery.data?.incomingExperience;
  const incomingExperience =
    !dashboardQuery.error &&
    !dashboardQuery.isCached &&
    incomingCandidate &&
    partner &&
    incomingCandidate.authorId === partner.id
      ? incomingCandidate
      : null;
  const incomingId = incomingExperience?.id;
  const ordinaryShared = recentShared.filter((item) => item.id !== incomingId);
  const focalItem = selectTodayFocalItem({
    keepsake: serverKeepsake?.id === incomingId ? null : serverKeepsake,
    recentShared: ordinaryShared,
  });

  // 4. Gerade bei euch: one module, deterministic priority, never a stack.
  const livingModule = selectLivingModule({
    partnerId: partner?.id,
    activityItems: activityQuery.data?.items,
    retrospective: retrospectiveDismissed ? null : retrospective,
    recentShared,
    excludeItemIds: [
      ...(focalItem ? [focalItem.item.id] : []),
      ...(incomingId ? [incomingId] : []),
    ],
    suppressPlanningFallback: Boolean(anticipation) || upcoming.length > 0,
  });

  /*
   * The shared content the page already features prominently, by id.
   *
   * For a partner signal that is the item the partner commented *on*, not the
   * activity entry - otherwise the same Memory could appear as the signal,
   * again in `Diesen Monat`, and again in the trace. Comparing plain content
   * ids keeps the no-duplicate rule one generic rule rather than a
   * per-module special case.
   *
   * The set grows as the page is composed, because each section can only
   * exclude what the sections above it have already claimed: `Diesen Monat`
   * still gets to choose freely from everything the two blocks above did not
   * take, and only then do its photos become featured content for the trace.
   */
  const featuredIds = new Set<string>(incomingId ? [incomingId] : []);
  if (focalItem) featuredIds.add(focalItem.item.id);
  const livingContentId = livingModuleContentId(livingModule);
  if (livingContentId) featuredIds.add(livingContentId);

  // 5. Diesen Monat: this month's real shared photos, minus anything already
  // featured above.
  const monthlyStrip = loadMemoryImage
    ? selectMonthlyStrip({
        recentShared,
        now: new Date(),
        excludeItemIds: [...featuredIds],
      })
    : [];

  const monthlyNotes = selectMonthlyNotes({
    recentShared,
    now: new Date(),
    excludeItemIds: [...featuredIds, ...monthlyStrip.map((item) => item.id)],
  });

  // 6. Zuletzt bei euch: the quiet trace, minus everything featured above it -
  // the photos the strip just claimed included, so a Memory is never both a
  // thumbnail up there and a row down here.
  const traceExcludedIds = new Set(featuredIds);
  for (const item of [...monthlyStrip, ...monthlyNotes])
    traceExcludedIds.add(item.id);
  const recentSharedForTrace = recentShared.filter(
    (item) => !traceExcludedIds.has(item.id),
  );

  /*
   * Per-user module visibility (#817). This is presentation only: every
   * selection/exclusion computation above stays based on the real
   * authoritative data, unaffected by what the user chose to hide, so hiding
   * one module never changes what another module selects (for example,
   * hiding the `relationship_signal` module must not let its content
   * reappear in the `recent_shared` trace). Only the final render of each
   * section below is additionally gated on its effective visibility.
   *
   * `preferencesUnresolved` distinguishes "the preference query is still
   * actually fetching" from "it resolved with no override" or "it is
   * disabled" (no account context) - `fetchStatus` stays `'idle'` in the
   * latter two cases, so only a genuine in-flight fetch counts. Dashboard
   * data and Dashboard preferences load independently; without this, a
   * user-hidden module could render for one frame before the slower
   * preferences request arrives and hides it again. The configurable module
   * stack below (including the relationship-presence hero) stays gated on
   * `contentReady` until the real preference state is known, so nothing the
   * user chose to hide is ever shown, even momentarily.
   */
  const preferencesUnresolved =
    dashboardPreferencesQuery.isPending &&
    dashboardPreferencesQuery.fetchStatus !== 'idle';
  const contentReady = Boolean(dashboardQuery.data) && !preferencesUnresolved;

  const relationshipPresenceVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'relationship_presence',
  );
  const upcomingVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'upcoming',
  );
  const keepsakeVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'keepsake',
  );
  const relationshipSignalVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'relationship_signal',
  );
  const monthlyHighlightsVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'monthly_highlights',
  );
  const recentSharedVisible = isDashboardModuleVisible(
    dashboardPreferencesQuery.data,
    'recent_shared',
  );
  const monthlyRecapEnabled = Boolean(
    contentReady &&
      monthlyHighlightsVisible &&
      apis.recaps &&
      recapMediaApis &&
      account &&
      !dashboardQuery.isCached,
  );
  const monthlyRecapEdition = useMonthlyRecapInvitation({
    api: apis.recaps,
    today: dashboardQuery.data?.viewerLocalDate ?? new Date(),
    instance: apiBaseUrl ?? '',
    accountId: account?.id,
    spaceId,
    enabled: monthlyRecapEnabled,
  });
  const monthlyRecapEntry =
    monthlyRecapEnabled && recapMediaApis && account ? (
      <MonthlyRecapInvitation
        edition={monthlyRecapEdition}
        mediaApis={recapMediaApis}
        account={account}
        spaceId={spaceId}
        excludeSourceIds={[
          ...featuredIds,
          ...monthlyStrip.map((item) => item.id),
          ...monthlyNotes.map((item) => item.id),
        ]}
      />
    ) : null;
  const sharedStorySummaryVisible =
    wirStatistics.allowed && wirStatistics.enabled && !dashboardQuery.isCached;

  const isSparse = Boolean(
    dashboardQuery.data &&
      !(sharedStorySummaryVisible && dashboardQuery.data.sharedStorySummary) &&
      !anticipation &&
      upcoming.length === 0 &&
      recentShared.length === 0 &&
      !retrospective &&
      !livingModule &&
      !serverKeepsake &&
      !(pinnedCollectionVisible && pinnedCollectionId),
  );

  const showMomentSection = Boolean(!isSparse && focalItem);

  const renderRelationshipHero = (
    avatarAction?: CouplePresenceAvatarAction,
    avatarOverlay?: ReactNode,
  ) => (
    <CouplePresence
      className="today-hero"
      eyebrow={
        (wirDesign?.current ?? 'warm') === 'warm'
          ? t('wirDesign.welcome')
          : undefined
      }
      headingLevel="h2"
      spaceTitle={
        partner
          ? t('m5s5.dashboard.partner', {
              name: partnerName,
            })
          : t('m5s5.dashboard.durationTitle')
      }
      primaryPerson={{
        displayName:
          account?.displayName ||
          t('m5s5.activity.you', { defaultValue: 'Du' }),
        imageUrl: userAvatar.avatarUrl,
      }}
      secondaryPerson={
        partner
          ? {
              displayName: partnerName,
              imageUrl: partnerAvatar.avatarUrl,
            }
          : null
      }
      secondaryLabel={partner ? partnerName : undefined}
      status={partnerPresenceStatus}
      relationshipDuration={
        dashboardQuery.data?.relationshipDuration
          ? formatRelationshipDuration(
              dashboardQuery.data.relationshipDuration,
              t,
            )
          : undefined
      }
      durationLinkTo={
        dashboardQuery.data?.relationshipDuration
          ? '/more/profile#relationship-profile-title'
          : undefined
      }
      durationTitle={t('m5s5.dashboard.openRelationshipSettings')}
      avatarSize="hero"
      avatarAction={avatarAction}
      avatarOverlay={avatarOverlay}
      avatarAdornment={
        energyCheckInEnabled && account?.id ? (
          <DailyEnergyCheckIn
            key={`${account.id}:${spaceId}`}
            api={dailyCheckInsApi}
            accountId={account.id}
            spaceId={spaceId}
            partnerName={partner ? partnerName : undefined}
          />
        ) : undefined
      }
    />
  );

  const dailyQuote =
    account?.id && dailyQuoteApi && entitlementApi ? (
      <DailyQuoteCard
        key={`quote:${account.id}:${spaceId}`}
        quoteApi={dailyQuoteApi}
        entitlementsApi={entitlementApi}
        accountId={account.id}
        spaceId={spaceId}
        partnerName={partner ? partnerName : undefined}
        partnerNameIsResolved
      />
    ) : null;
  const dailyVibe =
    vibeCheckEnabled && partner && account?.id && dailyCheckInsApi ? (
      <DailyVibeCheckIn
        key={`vibe:${account.id}:${spaceId}`}
        api={dailyCheckInsApi}
        accountId={account.id}
        spaceId={spaceId}
        partnerName={partnerName}
        partnerNameIsResolved
        configuredEnabled
      />
    ) : null;
  const moduleContent: Record<DashboardModuleKey, ReactNode> = {
    shared_experience:
      incomingExperience &&
      isDashboardModuleVisible(
        dashboardPreferencesQuery.data,
        'shared_experience',
      ) ? (
        <SharedExperienceReveal
          entry={incomingExperience}
          partnerName={partnerName}
        />
      ) : null,
    daily_quote: dailyQuote,
    relationship_presence: (
      <>
        {/* ROLE: Hero / Couple Presence — the permanent emotional entry
              point, shown for every space including a new/sparse one, unless
              the user hid the `relationship_presence` module. The couple's
              names become the page H1; hidden modules retain a semantic fallback. */}
        {relationshipPresenceVisible ? (
          supportGesturesEnabled && partner && account?.id ? (
            <PartnerQuickActions
              apis={apis}
              entitlementApi={entitlementApi}
              accountId={account.id}
              spaceId={spaceId}
              partnerName={partnerName}
              thinkingOfYouAvailableAt={
                dashboardQuery.data?.thinkingOfYouAvailableAt ?? null
              }
            >
              {(avatarAction, avatarOverlay) =>
                renderRelationshipHero(avatarAction, avatarOverlay)
              }
            </PartnerQuickActions>
          ) : (
            renderRelationshipHero()
          )
        ) : null}
        {dailyVibe}
      </>
    ),
    keepsake: (
      <>
        {/* Personal shared content comes before the practical horizon:
                  Today should show the relationship itself before another
                  stack of planning utilities. */}
        {showMomentSection && keepsakeVisible && focalItem ? (
          <TodayModuleSection
            className="today-section-moment"
            title={t('m5s5.today.keepsake.title')}
          >
            <TodayMomentFeature
              item={focalItem.item}
              loadMemoryImage={loadMemoryImage}
              isKeepsake={focalItem.kind === 'keepsake'}
            />
          </TodayModuleSection>
        ) : null}
      </>
    ),
    upcoming: (
      <>
        {/* Demnächst — the short shared horizon. One item is the
                  default and must read as complete on its own; two or three
                  stay restrained rather than becoming an agenda table. */}
        {upcomingVisible && (anticipation || upcoming.length > 0) ? (
          <TodayModuleSection
            className="today-section-upcoming"
            colorWorld="natural"
            title={t('m5s5.dashboard.upcomingTitle')}
            headerAction={
              <Link
                to={appRoutePath('plan')}
                className="today-section-link"
                aria-label={t('m5s5.today.upcoming.allAriaLabel')}
              >
                {t('m5s5.today.upcoming.allAction')}
              </Link>
            }
          >
            {anticipation ? <AnticipationCard value={anticipation} /> : null}
            <div className="today-agenda-list">
              {upcoming.map((item: DashboardItem) => (
                <TodayAgendaRow key={item.id} item={item} />
              ))}
            </div>
          </TodayModuleSection>
        ) : null}
      </>
    ),
    pinned_collection: (
      <>
        {!dashboardQuery.isCached &&
        pinnedCollectionVisible &&
        pinnedCollectionId &&
        pinnedCollectionQuery.data ? (
          <TodayModuleSection
            className="today-section-pinned-collection"
            title={pinnedCollectionQuery.data.title}
            kicker={t('m5s5.today.pinnedCollection.kicker')}
            headerAction={
              <TodayDestinationLink
                to={collectionDetailPath(pinnedCollectionId)}
                className="today-section-link"
                ariaLabel={t('m5s5.today.pinnedCollection.openAriaLabel', {
                  title: pinnedCollectionQuery.data.title,
                })}
              >
                {t('m5s5.today.pinnedCollection.openAction')}
              </TodayDestinationLink>
            }
          >
            {collectionsApi ? (
              <TodayPinnedCollection
                api={collectionsApi}
                accountId={account?.id ?? ''}
                spaceId={spaceId}
                collection={pinnedCollectionQuery.data}
                sharedAchievementsEnabled={sharedAchievementsEnabled}
              />
            ) : null}
          </TodayModuleSection>
        ) : null}

        {pinnedCollectionVisible &&
        pinnedCollectionId &&
        pinnedCollectionQuery.error ? (
          <div className="today-partial-error" role="status">
            <span>{t('m5s5.today.pinnedCollection.loadError')}</span>
            <button
              type="button"
              className="today-partial-error-action"
              onClick={() => void pinnedCollectionQuery.refetch()}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}
      </>
    ),
    relationship_signal: (
      <>
        {/* 4. Gerade bei euch — exactly one contextual module. */}
        {livingModule && relationshipSignalVisible ? (
          <TodayModuleSection
            className="today-section-living"
            title={t('m5s5.today.living.kicker')}
          >
            <TodayLivingModuleCard
              module={livingModule}
              partnerName={partnerName}
              partnerAvatarUrl={partnerAvatar.avatarUrl}
              loadMemoryImage={loadMemoryImage}
              onDismissRetrospective={
                dismissalToken ? dismissRetrospectiveToday : undefined
              }
            />
          </TodayModuleSection>
        ) : null}

        {dismissedToken === dismissalToken && dismissalToken ? (
          <span role="status" className="sr-only">
            {t('m5s5.today.living.retrospectiveDismissed')}
          </span>
        ) : null}

        {activityQuery.error && relationshipSignalVisible ? (
          <div className="today-partial-error" role="status">
            <span>{t('m5s5.today.partialActivityError')}</span>
            <button
              type="button"
              className="today-partial-error-action"
              onClick={() => void activityQuery.refetch()}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}
      </>
    ),
    monthly_highlights: (
      <>
        {/* 5. Diesen Monat — this month's shared life, shown rather than
                  counted. */}
        {monthlyHighlightsVisible &&
        (monthlyStrip.length > 0 ||
          monthlyNotes.length > 0 ||
          monthlyRecapEdition) ? (
          <TodayModuleSection
            className="today-section-monthly"
            title={t('m5s5.today.monthly.title')}
            headerAction={
              <Link
                to={`${appRoutePath('story')}?tab=timeline`}
                className="today-section-link"
                aria-label={t('m5s5.today.monthly.allAriaLabel')}
              >
                {t('m5s5.today.monthly.allAction')}
              </Link>
            }
          >
            {monthlyRecapEntry}
            {loadMemoryImage && monthlyStrip.length > 0 ? (
              <TodayMonthlyStrip
                items={monthlyStrip}
                loadMemoryImage={loadMemoryImage}
              />
            ) : null}
            {monthlyNotes.length > 0 ? (
              <div className="today-monthly-notes">
                {monthlyNotes.map((item) => (
                  <RecentSharedItemCard key={item.id} item={item} />
                ))}
              </div>
            ) : null}
          </TodayModuleSection>
        ) : monthlyHighlightsVisible ? (
          monthlyRecapEntry
        ) : null}
      </>
    ),
    recent_shared: (
      <>
        {/* 6. Zuletzt bei euch — deliberately secondary. Full activity
                  navigation stays reachable from here. */}
        {recentSharedVisible && recentSharedForTrace.length > 0 ? (
          <TodayModuleSection
            className="today-section-recent"
            title={t('m5s5.dashboard.recentTitle')}
            headerAction={
              <Link
                to={ACTIVITY_ROUTE}
                className="today-section-link today-recent-activity-link"
                aria-label={t('m5s5.dashboard.allActivityAction')}
              >
                {t('m5s5.today.recent.allAction')}
              </Link>
            }
          >
            <div className="today-stream today-stream-recent">
              {recentSharedForTrace.slice(0, 4).map((item: DashboardItem) => (
                <RecentSharedItemCard key={item.id} item={item} />
              ))}
            </div>
          </TodayModuleSection>
        ) : null}
      </>
    ),
    shared_story_summary: (
      <>
        {sharedStorySummaryVisible &&
        dashboardQuery.data?.sharedStorySummary ? (
          <SharedStorySummary
            summary={dashboardQuery.data?.sharedStorySummary}
            showEmpty
          />
        ) : null}
      </>
    ),
  };
  const orderedModuleKeys = orderedDashboardModuleKeys(
    dashboardPreferencesQuery.data,
  );

  return (
    <div
      className="page today-page"
      data-wir-design={wirDesign?.current ?? 'warm'}
      data-color-world={
        (wirDesign?.current ?? 'warm') === 'warm' ? 'warm' : undefined
      }
    >
      {(dashboardQuery.isLoading ||
        (Boolean(dashboardQuery.data) && preferencesUnresolved)) && (
        <UiState kind="loading" title={t('states.loading.title')} />
      )}
      {dashboardQuery.error && (
        <ProblemState
          error={dashboardQuery.error}
          onRetry={() => dashboardQuery.refetch()}
        />
      )}
      {dashboardQuery.isCached ? (
        <OverviewCacheNotice cachedAt={dashboardQuery.cachedAt} />
      ) : null}
      {/* A failed preferences fetch does not block Today: the configurable
          module stack proceeds with product defaults (visible) rather than
          holding the whole page hostage on a secondary, non-critical
          presentation preference. The retry stays reachable so the user's
          real hidden/shown choices come back without a full reload. */}
      {dashboardPreferencesQuery.error ? (
        <ProblemState
          error={dashboardPreferencesQuery.error}
          onRetry={() => void dashboardPreferencesQuery.refetch()}
        />
      ) : null}

      {contentReady && dashboardQuery.data ? (
        <div className="today-content">
          <PageHeader variant="root" title={t('navigation.today')} />

          {orderedModuleKeys.map((key) => (
            <Fragment key={key}>{moduleContent[key]}</Fragment>
          ))}
          {isSparse ? (
            <div className="new-space-experience">
              <h2 className="new-space-title">
                {partner
                  ? t('m5s5.dashboard.newSpacePartner', {
                      name: partnerName,
                    })
                  : t('m5s5.dashboard.newSpaceEmpty')}
              </h2>
              <p className="new-space-body">
                {t('m5s5.dashboard.newSpaceIntro')}
              </p>
              <div className="new-space-actions">
                <Link
                  className="button-link primary new-space-cta"
                  to="/story/memories/new"
                >
                  {t('m5s5.dashboard.newSpaceAction')}
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
