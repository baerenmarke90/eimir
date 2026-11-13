import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { DashboardItemType } from '../api/generated/models/DashboardItemType';
import { DashboardModulePreferenceListToJSON } from '../api/generated/models/DashboardModulePreferenceList';
import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import type { RediscoveryContext } from '../api/generated/models/RediscoveryContext';
import { DashboardViewToJSON } from '../api/generated/models/DashboardView';
import {
  readableActivityItems,
  useActivityQuery,
} from '../client/activityQueries';
import {
  useAttentionReceipt,
  useAttentionReceipts,
} from '../client/attentionReceipt';
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
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { decodeDashboardOverview } from '../client/overviewSnapshots';
import { usePartnerNickname } from '../client/partnerNickname';
import { planScheduleLabel } from '../client/planningPresentation';
import {
  PARTNER_PRESENCE_PRODUCT_ENABLED,
  usePartnerPresence,
} from '../client/presence';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  calculateRelationshipDuration,
  formatRelationshipDuration as formatSharedTime,
} from '../client/relationshipPreview';
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
import { useRevealAfterCache } from '../client/useRevealAfterCache';
import { useHeldQuery, useResumeSettling } from '../client/useResumeSettling';
import {
  rememberWirScroll,
  takeColdStartWirScroll,
} from '../client/wirScrollMemory';
import { useWarmOverviewQuery } from '../client/useWarmOverviewQuery';
import { useWirStatistics } from '../client/useWirStatistics';
import { resolvedLocale, useTranslation } from '../i18n';
import { ActivityCard } from './ActivityCard';
import { AnticipationCard } from './AnticipationCard';
import {
  CouplePresence,
  type CouplePresenceAvatarAction,
} from './CouplePresence';
import { DailyQuoteCard } from './DailyQuoteCard';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { MomentCreateMenu } from './MomentCreateMenu';
import {
  MonthlyRecapInvitation,
  useMonthlyRecapInvitation,
} from './MonthlyRecapInvitation';
import { OnceIncomingSignal } from './OnceMessages';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { PartnerQuickActions } from './PartnerQuickActions';
import { WirPartnerDaySheet } from './WirPartnerDaySheet';
import { useWirDailyCheckIn } from './WirDailyCheckIn';
import { WirPartnerDistance } from './PartnerDistanceLine';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import {
  RediscoverySecondaryLine,
  useRediscoveryWording,
} from './RediscoveryWording';
import {
  dashboardRediscoverySource,
  viewerToday,
} from './rediscoverySelection';
import { SharedExperienceReveal } from './SharedExperienceReveal';
import { SharedStorySummary } from './SharedStorySummary';
import { TodayDestinationLink } from './TodayDestinationLink';
import { TodayPinnedCollection } from './TodayPinnedCollection';
import { UiState } from './UiState';
import './TodayPage.css';
import { useWirDesign } from '../client/wirDesign';
import './WirDesign.css';

export function formatRelationshipDuration(
  duration: DashboardRelationshipDuration,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  // Derive the reference day from the server snapshot, including cached views.
  const start = new Date(duration.startedOn);
  const end = new Date(start.getTime() + duration.daysTogether * 86_400_000);
  return formatSharedTime(calculateRelationshipDuration(start, end), t);
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

/**
 * Holds the place of a module that only renders from live data while the page
 * still shows its saved read, so the live arrival does not shove content down.
 */
function TodayModulePlaceholder({
  kind,
}: {
  kind: 'shared-experience' | 'pinned-collection' | 'story-summary';
}) {
  return (
    <div
      className="today-module-placeholder"
      data-kind={kind}
      aria-hidden="true"
    />
  );
}

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

function RecentSharedItemCard({
  item,
  onFollow,
}: {
  item: DashboardItem;
  onFollow?: () => void;
}) {
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
      <TodayDestinationLink
        onFollow={onFollow}
        to={path}
        className="today-recent-tile"
      >
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
  const date =
    item.type === 'PLAN' && (item.scheduledAt || item.scheduledOn)
      ? planScheduleLabel({
          plannedOn: item.scheduledOn ?? null,
          plannedStart: item.scheduledAt,
          plannedEnd: null,
        })
      : calendarDate
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
  ) => Promise<ObjectUrlSource>;
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
            hasThumbnail={item.previewHasThumbnail}
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
        // An explicit name keeps Android WebView from announcing the
        // destination's resource ID when the card is only partly on screen.
        ariaLabel={[
          title,
          date && !titleIsDate ? date : null,
          hasImage && item.previewIsSensitive
            ? t('sensitiveMedia.label')
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {feature}
      </TodayDestinationLink>
    );
  }
  return <div className="today-moment">{feature}</div>;
}

/** Daily rediscovery has its own visibility, order and section heading. */
function TodayRetrospectiveCard({
  item,
  rediscovery,
  viewerLocalDate,
  loadMemoryImage,
}: {
  item: DashboardItem;
  rediscovery?: RediscoveryContext | null;
  viewerLocalDate?: Date | null;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
}) {
  const { t } = useTranslation();
  const path = dashboardItemPath(item.type, item.id);
  // #1790 C2: varying wording instead of a bare date as the title.
  const wording = useRediscoveryWording(
    dashboardRediscoverySource(item, rediscovery),
    { today: viewerToday(viewerLocalDate) },
  );
  const rawDate = item.occurredOn ?? item.createdAt;
  const meta = rawDate ? formatDate(rawDate) : null;
  const previewAttachmentId = item.previewAttachmentId;
  const hasMedia = Boolean(previewAttachmentId && loadMemoryImage);
  const action = t('m5s5.today.living.retrospectiveAction');
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
      <figure className="today-retrospective-photo">
        {hasMedia && previewAttachmentId && loadMemoryImage ? (
          <div className="today-retrospective-media">
            <MemoryPreview
              memoryId={item.id}
              attachmentId={previewAttachmentId}
              isSensitive={item.previewIsSensitive}
              hasThumbnail={item.previewHasThumbnail}
              loadImage={loadMemoryImage}
            />
          </div>
        ) : null}
        <figcaption
          className={`today-retrospective-caption${
            hasMedia ? '' : ' today-retrospective-text-only'
          }`}
        >
          <span className="today-retrospective-title">
            {wording?.headline ?? dashboardItemTitle(item, t).title}
          </span>
          <RediscoverySecondaryLine
            className="today-retrospective-date"
            variantLine={wording?.variantLine ?? null}
            date={date}
            dateTime={dateTime}
          />
        </figcaption>
      </figure>
      {path ? (
        <TodayDestinationLink
          to={path}
          className="button-link button-link-primary today-retrospective-action"
        >
          {action}
        </TodayDestinationLink>
      ) : null}
    </article>
  );
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
  onFollow,
}: {
  module: LivingModule;
  partnerName: string;
  partnerAvatarUrl?: string | null;
  onFollow?: () => void;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
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
            onFollow={onFollow}
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
            hasThumbnail={item.previewHasThumbnail}
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
 * This month's shared photos, composed as a bounded mosaic.
 *
 * Titles overlay the photos; calendar dates remain in their accessible names.
 * The bounded projection deliberately makes no counted-total claim.
 */
export function TodayMonthlyMosaic({
  onFollow,
  items,
  loadMemoryImage,
}: {
  onFollow?: () => void;
  items: readonly DashboardItem[];
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
}) {
  const { t } = useTranslation();
  return (
    <ul className={`today-monthly-strip today-monthly-strip-${items.length}`}>
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
                hasThumbnail={item.previewHasThumbnail}
                loadImage={loadMemoryImage}
              />
            ) : null}
            {item.previewIsSensitive ? (
              <span
                className="today-monthly-sensitive-label"
                aria-hidden="true"
              >
                {t('sensitiveMedia.label')}
              </span>
            ) : null}
          </span>
        );
        return (
          <li key={item.id} className="today-monthly-item">
            {path ? (
              <TodayDestinationLink
                onFollow={onFollow}
                to={path}
                className="today-monthly-tile"
                ariaLabel={[
                  title,
                  item.occurredOn && !titleIsDate
                    ? formatCalendarDate(item.occurredOn)
                    : null,
                  item.previewIsSensitive ? t('sensitiveMedia.label') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              >
                {tile}
                <span className="today-monthly-caption">
                  <strong>{title}</strong>
                </span>
              </TodayDestinationLink>
            ) : (
              <span className="today-monthly-tile">
                {tile}
                <span className="today-monthly-caption">
                  <strong>{title}</strong>
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
  partnerLocationApi,
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
  ) => Promise<ObjectUrlSource>;
  profilesApi?: ProfilesApi;
  account?: AccountView | null;
  recapMediaApis?: ReferenceApis;
  /** Partner distance on the couple hero (#1792). */
  partnerLocationApi?: Pick<
    PartnerLocationApi,
    'getPartnerDistance' | 'getPartnerLocationMap'
  >;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const wirDesign = useWirDesign();
  const queryClient = useQueryClient();
  // After the app regains focus, refreshed reads land together instead of one
  // module at a time (see useResumeSettling).
  const resumeSettling = useResumeSettling();
  const wirStatistics = useWirStatistics({
    api: entitlementApi,
    instance: apiBaseUrl ?? '',
    accountId: account?.id ?? '',
    spaceId,
  });
  const liveDashboardQuery = useWarmOverviewQuery({
    queryKey: dashboardQueryKey(spaceId),
    accountId: account?.id,
    apiBaseUrl,
    spaceId,
    kind: 'dashboard-overview',
    load: async (signal) => {
      const [dashboard, modulePreferences] = await Promise.all([
        apiCall(() => apis.dashboard.getDashboard({ spaceId }, { signal })),
        account?.id
          ? queryClient
              .fetchQuery({
                queryKey: dashboardPreferencesQueryKey(account.id, spaceId),
                queryFn: ({ signal: preferenceSignal }) =>
                  apiCall(() =>
                    apis.dashboard.listDashboardModulePreferences(
                      { spaceId },
                      { signal: preferenceSignal },
                    ),
                  ),
                // Persist server-confirmed choices, never another pending
                // settings mutation's optimistic query value.
                staleTime: 0,
                retry: false,
              })
              .catch((error: unknown) => {
                if (
                  ['unauthorized', 'permission', 'notFound'].includes(
                    clientProblemKind(error),
                  )
                )
                  throw error;
                return undefined;
              })
          : undefined,
      ]);
      return { ...dashboard, modulePreferences };
    },
    serialize: (value) => ({
      ...DashboardViewToJSON(value),
      modulePreferences: DashboardModulePreferenceListToJSON(
        value.modulePreferences,
      ),
    }),
    deserialize: (payload) => decodeDashboardOverview(payload, spaceId),
  });
  const dashboardQuery = useHeldQuery(liveDashboardQuery, resumeSettling);
  const liveSpaceConfigurationQuery = useQuery(
    spaceConfigurationQueryOptions(
      dashboardQuery.data?.space.partner ? spacesApi : undefined,
      account?.id ?? '',
      spaceId,
    ),
  );
  const spaceConfigurationQuery = useHeldQuery(
    liveSpaceConfigurationQuery,
    resumeSettling,
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
  const liveDashboardPreferencesQuery = useQuery({
    queryKey: dashboardPreferencesQueryKey(account?.id ?? '', spaceId),
    queryFn: () =>
      apiCall(() => apis.dashboard.listDashboardModulePreferences({ spaceId })),
    enabled: Boolean(account?.id && spaceId),
    retry: false,
    staleTime: 60_000,
  });
  const dashboardPreferencesQuery = useHeldQuery(
    liveDashboardPreferencesQuery,
    resumeSettling,
  );

  const dashboardPreferences =
    dashboardPreferencesQuery.data ?? dashboardQuery.data?.modulePreferences;

  const pinnedCollectionId = selectedDashboardCollectionId(
    dashboardPreferences,
    'pinned_collection',
  );
  const pinnedCollectionVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'pinned_collection',
  );
  const livePinnedCollectionQuery = useQuery({
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
  const pinnedCollectionQuery = useHeldQuery(
    livePinnedCollectionQuery,
    resumeSettling,
  );

  const activityQuery = useHeldQuery(
    useActivityQuery(apis.activity, spaceId, account?.id),
    resumeSettling,
  );
  const activityItems = readableActivityItems(activityQuery);
  const signalReceipts = useAttentionReceipts(
    [apiBaseUrl ?? '', account?.id ?? '', spaceId, 'partner-signals'],
    activityItems.map((item) => ({
      id: item.id,
      expiresAt: item.createdAt.getTime() + 3 * 24 * 60 * 60_000,
    })),
  );

  const partner = dashboardQuery.data?.space.partner;
  const partnerName = relationshipLabel(
    partner?.id,
    partner?.displayName,
    t('m5s5.today.relationshipSignal.partnerFallback'),
  );
  // Daily check-in on the couple avatars (#1790 slice A).
  const dailyCheckIn = useWirDailyCheckIn({
    api: dailyCheckInsApi,
    accountId: partner ? account?.id : undefined,
    spaceId,
    partnerName,
    vibeEnabled: vibeCheckEnabled,
    energyEnabled: energyCheckInEnabled,
  });
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
    dashboardPreferences,
  );

  const relationshipSignalVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'relationship_signal',
  );
  const recentShared = dashboardQuery.data?.recentShared ?? [];
  const retrospective = dashboardQuery.data?.retrospective;
  const retrospectiveVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'retrospective',
  );
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
  // A newly shared experience keeps priority over rediscovering the same source.
  // Reserve other rediscovery sources even when their personal module is hidden.
  const retrospectiveId =
    !retrospectiveDismissed && retrospective?.id !== incomingId
      ? retrospective?.id
      : null;
  const focalItem = selectTodayFocalItem({
    keepsake:
      serverKeepsake?.id === incomingId ||
      serverKeepsake?.id === retrospectiveId
        ? null
        : serverKeepsake,
    recentShared: ordinaryShared.filter((item) => item.id !== retrospectiveId),
  });

  // 4. Gerade bei euch: one module, deterministic priority, never a stack.
  const livingModule = selectLivingModule({
    partnerId: partner?.id,
    activityItems: activityItems.filter((item) =>
      signalReceipts.pendingIds.has(item.id),
    ),
    recentShared,
    excludeItemIds: [
      ...(retrospectiveId ? [retrospectiveId] : []),
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
  if (retrospectiveId) featuredIds.add(retrospectiveId);
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

  const monthlyItems = [...monthlyStrip, ...monthlyNotes];
  const monthlyReceipt = useAttentionReceipt(
    [apiBaseUrl ?? '', account?.id ?? '', spaceId],
    `month:${new Date().getFullYear()}:${new Date().getMonth()}:${monthlyItems.map((item) => item.id).join(':')}`,
    Math.max(
      0,
      ...monthlyItems.map(
        (item) => (item.occurredOn ?? item.createdAt)?.getTime() ?? 0,
      ),
    ) +
      3 * 24 * 60 * 60_000,
  );

  // The quiet trace is the same first page as Activities, including comments.
  const currentSignalId =
    livingModule?.kind === 'partner_signal'
      ? livingModule.activityItem.id
      : null;
  const recentActivities = activityItems
    .filter((item) => item.id !== currentSignalId)
    .slice(0, 3);

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
  const preferencesDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(dashboardPreferencesQuery.error),
  );
  const contentReady =
    Boolean(dashboardQuery.data) &&
    wirDesign?.presentationReady !== false &&
    !preferencesDenied &&
    (!preferencesUnresolved || Boolean(dashboardPreferences));

  const revealAfterCache = useRevealAfterCache(dashboardQuery.isCached);

  // A cold start (the OS dropped the WebView in the background) returns to the
  // remembered position once there is content to scroll through.
  const accountId = account?.id ?? '';
  const [coldStartScroll] = useState(() =>
    takeColdStartWirScroll(accountId, spaceId),
  );
  const [coldStartScrollSettled, setColdStartScrollSettled] = useState(false);
  useLayoutEffect(() => {
    if (!contentReady || coldStartScrollSettled) return;
    setColdStartScrollSettled(true);
    if (coldStartScroll) window.scrollTo(0, coldStartScroll);
  }, [contentReady, coldStartScroll, coldStartScrollSettled]);
  useEffect(() => {
    // Never record before the restore had its chance, or a background right
    // after launch would overwrite the position with the top.
    if (!accountId || !contentReady || !coldStartScrollSettled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => rememberWirScroll(accountId, spaceId, window.scrollY);
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    };
    const flush = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [accountId, spaceId, contentReady, coldStartScrollSettled]);

  const relationshipPresenceVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'relationship_presence',
  );
  const upcomingVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'upcoming',
  );
  const keepsakeVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'keepsake',
  );
  const monthlyHighlightsVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'monthly_highlights',
  );
  const recentSharedVisible = isDashboardModuleVisible(
    dashboardPreferences,
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
      avatarAction={
        avatarAction && dailyCheckIn?.partnerAriaLabel
          ? {
              ...avatarAction,
              label: `${avatarAction.label}. ${dailyCheckIn.partnerAriaLabel}`,
            }
          : avatarAction
      }
      avatarOverlay={avatarOverlay}
      primaryAvatarAction={dailyCheckIn?.ownAction}
      primaryAvatarAdornment={dailyCheckIn?.ownBadge}
      secondaryAvatarAdornment={dailyCheckIn?.partnerBadge}
      signal={
        partner && account?.id && partnerLocationApi ? (
          <WirPartnerDistance
            api={partnerLocationApi}
            entitlementApi={entitlementApi}
            instance={apiBaseUrl ?? ''}
            accountId={account.id}
            spaceId={spaceId}
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
  const moduleContent: Record<DashboardModuleKey, ReactNode> = {
    shared_experience:
      incomingExperience &&
      isDashboardModuleVisible(dashboardPreferences, 'shared_experience') ? (
        <SharedExperienceReveal
          scope={[apiBaseUrl ?? '', account?.id ?? '', spaceId]}
          entry={incomingExperience}
          partnerName={relationshipLabel(partner?.id, partner?.displayName, '')}
        />
      ) : dashboardQuery.isCached &&
        !dashboardQuery.error &&
        partner &&
        incomingCandidate?.authorId === partner.id &&
        isDashboardModuleVisible(dashboardPreferences, 'shared_experience') ? (
        <TodayModulePlaceholder kind="shared-experience" />
      ) : null,
    daily_quote: dailyQuote,
    relationship_presence: (
      <>
        {/* The shared couple identity stays above the personal section stack,
              including for older accounts that once hid or moved this module. */}
        {relationshipPresenceVisible ? (
          supportGesturesEnabled && partner && account?.id ? (
            <PartnerQuickActions
              apis={apis}
              header={dailyCheckIn?.partnerBlock}
              entitlementApi={entitlementApi}
              accountId={account.id}
              spaceId={spaceId}
              partnerName={partnerName}
              partnerPhotoUrl={partnerAvatar.avatarUrl}
              partnerPhotoIdentity={`${spaceId}:${partner?.id}:${partnerProfileQuery.data?.profileAttachmentId}`}
              thinkingOfYouAvailableAt={
                dashboardQuery.data?.thinkingOfYouAvailableAt ?? null
              }
            >
              {(avatarAction, avatarOverlay) =>
                renderRelationshipHero(avatarAction, avatarOverlay)
              }
            </PartnerQuickActions>
          ) : dailyCheckIn?.partnerBlock && partner ? (
            <WirPartnerDaySheet
              partnerName={partnerName}
              block={dailyCheckIn.partnerBlock}
            >
              {(avatarAction) => renderRelationshipHero(avatarAction)}
            </WirPartnerDaySheet>
          ) : (
            renderRelationshipHero()
          )
        ) : null}
        {relationshipPresenceVisible ? dailyCheckIn?.panel : null}
        {dailyCheckIn?.announcement}
        <OnceIncomingSignal />
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
            className={
              revealAfterCache
                ? 'today-section-pinned-collection today-module-reveal'
                : 'today-section-pinned-collection'
            }
            title={pinnedCollectionQuery.data.title}
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
        ) : dashboardQuery.isCached &&
          pinnedCollectionVisible &&
          pinnedCollectionId ? (
          <TodayModulePlaceholder kind="pinned-collection" />
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
    retrospective: (
      <>
        {retrospectiveVisible && retrospective && retrospectiveId ? (
          <TodayModuleSection
            className="today-section-retrospective"
            title={t('m5s5.today.living.retrospectiveLabel')}
            headerAction={
              dismissalToken ? (
                <button
                  type="button"
                  className="today-retrospective-dismiss"
                  onClick={dismissRetrospectiveToday}
                >
                  {t('m5s5.today.living.retrospectiveDismissToday')}
                </button>
              ) : undefined
            }
          >
            <TodayRetrospectiveCard
              item={retrospective}
              rediscovery={dashboardQuery.data?.retrospectiveRediscovery}
              viewerLocalDate={dashboardQuery.data?.viewerLocalDate}
              loadMemoryImage={loadMemoryImage}
            />
          </TodayModuleSection>
        ) : null}

        {dismissedToken === dismissalToken && dismissalToken ? (
          <span role="status" className="sr-only">
            {t('m5s5.today.living.retrospectiveDismissed')}
          </span>
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
              onFollow={
                currentSignalId
                  ? () => signalReceipts.consume(currentSignalId)
                  : undefined
              }
            />
          </TodayModuleSection>
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
        {monthlyRecapEntry}
        {/* 5. Diesen Monat — this month's shared life, shown rather than
                  counted. */}
        {monthlyHighlightsVisible &&
        monthlyReceipt.visible &&
        (monthlyStrip.length > 0 || monthlyNotes.length > 0) ? (
          <TodayModuleSection
            className="today-section-monthly"
            title={t('m5s5.today.monthly.title', {
              month: new Intl.DateTimeFormat(resolvedLocale(), {
                month: 'long',
              }).format(new Date()),
            })}
            headerAction={
              <TodayDestinationLink
                onFollow={monthlyReceipt.consume}
                to={`${appRoutePath('story')}?tab=timeline`}
                className="today-section-link"
                ariaLabel={t('m5s5.today.monthly.allAriaLabel')}
              >
                {t('m5s5.today.monthly.allAction')}
              </TodayDestinationLink>
            }
          >
            {loadMemoryImage && monthlyStrip.length > 0 ? (
              <TodayMonthlyMosaic
                onFollow={monthlyReceipt.consume}
                items={monthlyStrip}
                loadMemoryImage={loadMemoryImage}
              />
            ) : null}
            {monthlyNotes.length > 0 ? (
              <div className="today-monthly-notes">
                {monthlyNotes.map((item) => (
                  <RecentSharedItemCard
                    key={item.id}
                    item={item}
                    onFollow={monthlyReceipt.consume}
                  />
                ))}
              </div>
            ) : null}
          </TodayModuleSection>
        ) : null}
      </>
    ),
    recent_shared: (
      <>
        {/* 6. Zuletzt bei euch — deliberately secondary. Full activity
                  navigation stays reachable from here. */}
        {recentSharedVisible && recentActivities.length > 0 ? (
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
            <ol className="today-stream today-stream-recent today-activity-trace">
              {recentActivities.map((item) => (
                <ActivityCard
                  key={item.id}
                  item={item}
                  spaceId={spaceId}
                  profilesApi={profilesApi}
                  currentAccountId={account?.id}
                  compact
                />
              ))}
            </ol>
          </TodayModuleSection>
        ) : null}
      </>
    ),
    shared_story_summary: (
      <>
        {sharedStorySummaryVisible &&
        dashboardQuery.data?.sharedStorySummary ? (
          <SharedStorySummary
            summary={dashboardQuery.data.sharedStorySummary}
            accountId={account?.id ?? ''}
            spaceId={spaceId}
            dashboardApi={apis.dashboard}
            loadMemoryImage={loadMemoryImage}
          />
        ) : dashboardQuery.isCached &&
          wirStatistics.allowed &&
          wirStatistics.enabled &&
          dashboardQuery.data?.sharedStorySummary ? (
          <TodayModulePlaceholder kind="story-summary" />
        ) : null}
      </>
    ),
  };
  const orderedModuleKeys = orderedDashboardModuleKeys(dashboardPreferences);

  return (
    <div
      className="page today-page"
      data-wir-design={
        wirDesign?.presentationReady === false
          ? undefined
          : (wirDesign?.current ?? 'warm')
      }
      data-color-world={
        wirDesign?.presentationReady !== false &&
        (wirDesign?.current ?? 'warm') === 'warm'
          ? 'warm'
          : undefined
      }
    >
      {(dashboardQuery.isLoading ||
        wirDesign?.presentationReady === false ||
        (Boolean(dashboardQuery.data) &&
          preferencesUnresolved &&
          !dashboardPreferences)) && (
        <UiState kind="loading" title={t('states.loading.title')} />
      )}
      {dashboardQuery.error && (
        <ProblemState
          error={dashboardQuery.error}
          onRetry={() => dashboardQuery.refetch()}
        />
      )}
      <OverviewCacheNotice
        cachedAt={dashboardQuery.isCached ? dashboardQuery.cachedAt : undefined}
      />
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
          <PageHeader
            variant="root"
            className="content-overview-heading"
            title={t('navigation.today')}
            action={<MomentCreateMenu floating />}
          />

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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
