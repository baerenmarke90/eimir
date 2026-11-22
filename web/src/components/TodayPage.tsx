import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { SharedNotesApi } from '../api/generated/apis/SharedNotesApi';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { DashboardItemType } from '../api/generated/models/DashboardItemType';
import { DashboardModulePreferenceListToJSON } from '../api/generated/models/DashboardModulePreferenceList';
import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import { DashboardViewToJSON } from '../api/generated/models/DashboardView';
import type { RediscoveryContext } from '../api/generated/models/RediscoveryContext';
import {
  readableActivityItems,
  useActivityQuery,
} from '../client/activityQueries';
import {
  useAttentionReceipt,
  useAttentionReceipts,
} from '../client/attentionReceipt';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { useConnectedMoment } from '../client/connectedMoment';
import {
  DASHBOARD_MODULE_KEYS,
  type DashboardModuleKey,
} from '../client/dashboardModules';
import {
  dashboardPreferencesQueryKey,
  isDashboardModuleVisible,
  limitUpcomingItems,
  orderedDashboardModuleKeys,
  selectedDashboardCollectionIds,
} from '../client/dashboardPreferences';
import { dashboardItemTitle } from '../client/dashboardPresentation';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { retrospectiveTone } from '../client/entryTone';
import { useFirstContentSettle } from '../client/firstContentSettle';
import { formatCalendarDate, formatRecency } from '../client/formatRecency';
import {
  dashboardItemPath,
  engagementTargetPath,
  type M4ProductApis,
} from '../client/m4Product';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { decodeDashboardOverview } from '../client/overviewSnapshots';
import { OPEN_OWN_DAILY_CHECK_IN_STATE } from '../client/partnerGestureReceipt';
import { usePartnerNickname } from '../client/partnerNickname';
import { firstNameFromDisplayName } from '../client/personalName';
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
import { useRootTabIntro } from '../client/rootTabIntro';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  MEMORY_CREATE_ROUTE,
  MORE_COLLECTIONS_ROUTE,
  MORE_NOTES_ROUTE,
  SETTINGS_CATEGORY_ROUTES,
  STORY_OURS_ROUTE,
} from '../client/routes';
import { WIR_NOTE_LIMIT } from '../client/sharedNotes';
import { spaceConfigurationQueryOptions } from '../client/spaceConfiguration';
import { useTaskOrigin } from '../client/taskOrigin';
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
import { useDiaryLayout } from '../client/useDiaryLayout';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useHeldQuery, useResumeSettling } from '../client/useResumeSettling';
import { useRevealAfterCache } from '../client/useRevealAfterCache';
import { useWarmOverviewQuery } from '../client/useWarmOverviewQuery';
import { useWirStatistics } from '../client/useWirStatistics';
import { loadVideoSource } from '../client/video';
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
import { WirPartnerDistance } from './PartnerDistanceLine';
import { PartnerQuickActions } from './PartnerQuickActions';
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
import { UiState } from './UiState';
import { useKeepsakeSway } from './useKeepsakeSway';
import { prefersReducedData, useMomentRotation } from './useMomentRotation';
import { WeeklyBriefWirHint } from './WeeklyBriefWirHint';
import { useWirDailyCheckIn } from './WirDailyCheckIn';
import { WirGardenModule } from './WirGardenModule';
import { WirLists } from './WirLists';
import { type MomentClipLoader, WirMomentSlides } from './WirMomentGallery';
import { WirNotes } from './WirNotes';
import { WirPartnerDaySheet } from './WirPartnerDaySheet';
import { WirStageDistance } from './WirStageDistance';
import { WirWaitingGamesModule } from './WirWaitingGamesModule';
import './TodayPage.css';
import './TodayRetrospectiveAlbum.css';
import { concealedTitle } from '../client/discreetPlans';
import {
  DEFAULT_WIR_DESIGN,
  useWirDesign,
  wirDesignLayout,
} from '../client/wirDesign';
import { DiscreetLock } from './DiscreetPlan';
import './WirDesign.css';
import {
  StageContext,
  stageFinished,
  useStage,
  useStageHold,
} from '../motion/stage';
import { ConnectedMoment } from './ConnectedMoment';
import { FirstStepAction } from './FirstStepAction';
import { useImportantDayMoment, type WirOccasion } from './wirImportantDay';
import { useWirOccasion } from './wirOccasion';

import {
  breatheRings,
  WIR_INTRO_PACE,
  WIR_STAGE,
  wirStageCanStart,
  wirStageDuration,
  wirStageHold,
  wirStageScope,
} from './wirStageMotion';
import './FirstContentSettle.css';
import './WirHeroStage.css';
import './WirSharedAlbum.css';
import './WirCompactLayouts.css';
import './WirMotion.css';
import { useWirReveal } from './useWirReveal';

/**
 * The Wir opening on the motion layer (#2074, #2147): Enter `stage`, identity
 * `wir.stage`, once per app start, on one clock (`useStage`) for the hero and
 * the quote and modules in the page content (`scope`). It waits briefly and
 * invisibly for the data its members show (`hold`), so late data joins the
 * opening instead of arriving on its own clock. After it (and after an
 * important-day Moment) the rings breathe (`breatheRings`).
 */
function WirIntroStage({
  occasion,
  children,
}: {
  occasion: WirOccasion | null;
  children: ReactNode;
}) {
  const stageRef = useStage<HTMLDivElement>(WIR_STAGE, {
    duration: wirStageDuration(),
    canStart: wirStageCanStart,
    hold: wirStageHold(),
    scope: wirStageScope,
  });
  const moment = useImportantDayMoment(occasion, stageRef);
  const [stageEnded, setStageEnded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void stageFinished(WIR_STAGE).then(() => {
      if (!cancelled) setStageEnded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Ambient starts only after the opening and the Moment (M15); a portrait
  // column that remounted joins the breath where it is.
  useLayoutEffect(() => {
    if (stageEnded && (moment === 'none' || moment === 'final'))
      breatheRings(stageRef.current);
  });
  return (
    <div
      ref={stageRef}
      className="wir-stage"
      style={{ '--wir-intro-pace': WIR_INTRO_PACE } as CSSProperties}
      data-important-day={moment === 'none' ? undefined : moment}
      data-occasion-person={
        moment === 'playing' || moment === 'final'
          ? (occasion?.birthday ?? undefined)
          : undefined
      }
    >
      <StageContext.Provider value={WIR_STAGE}>
        {children}
      </StageContext.Provider>
    </div>
  );
}

/** #2072: the cake mark on the birthday person's rim (decorative). */
function WirOccasionCake() {
  return (
    <span className="wir-occasion-cake" aria-hidden="true">
      <EimirIcon name="geburtstag" />
    </span>
  );
}

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
  const { ref, revealProps } = useWirReveal<HTMLElement>(className);
  return (
    <section
      ref={ref}
      id={id}
      className={`today-section ${className ?? ''}`.trim()}
      data-color-world={colorWorld}
      {...revealProps}
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
    ANNIVERSARY: 'jahrestag',
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

function WirSharedAlbumArrow() {
  return (
    <svg
      className="inline-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 12h16m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TodayAgendaRow({
  item,
  sharedAlbum = false,
}: {
  item: DashboardItem;
  sharedAlbum?: boolean;
}) {
  const { t } = useTranslation();
  const path = dashboardItemPath(item.type, item.id);
  const rawDate = item.occurredOn ?? item.scheduledAt ?? item.createdAt;
  const calendarDate = item.scheduledOn ?? item.occurredOn;
  const date =
    item.type === 'PLAN' && (item.scheduledAt || item.scheduledOn)
      ? planScheduleLabel({
          plannedOn: item.scheduledOn ?? null,
          plannedUntil: item.scheduledUntil ?? null,
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
  const title = item.concealed
    ? concealedTitle(item.titleOrText, t)
    : item.titleOrText?.trim() ||
      t(
        item.type === 'ANNIVERSARY'
          ? 'm5s5.dashboard.anniversaryTitle'
          : `m5s5.kind.${item.type}`,
      );

  const stampDate = calendarDate ?? rawDate;
  const stamp =
    sharedAlbum && stampDate
      ? new Intl.DateTimeFormat(resolvedLocale(), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: calendarDate ? 'UTC' : undefined,
        }).formatToParts(stampDate)
      : null;
  const stampTime =
    stamp && item.scheduledAt && !calendarDate
      ? t('m5s3.common.timeWithUnit', {
          time: new Intl.DateTimeFormat(resolvedLocale(), {
            hour: '2-digit',
            minute: '2-digit',
          }).format(item.scheduledAt),
        })
      : null;
  const rowInner = (
    <>
      {stamp ? (
        <span className="shared-album-date-stamp" aria-hidden="true">
          <span>{stamp.find((part) => part.type === 'weekday')?.value}</span>
          <strong>{stamp.find((part) => part.type === 'day')?.value}</strong>
          <span>{stamp.find((part) => part.type === 'month')?.value}</span>
        </span>
      ) : (
        <span className="today-agenda-icon" aria-hidden="true">
          <RecentItemTypeIcon type={item.type} />
        </span>
      )}
      <span className="today-agenda-copy">
        <span className="today-agenda-title">
          {title}
          {item.concealed ? <DiscreetLock /> : null}
        </span>
        {date ? (
          <time
            className={stamp && !stampTime ? 'sr-only' : 'today-agenda-date'}
            dateTime={
              calendarDate?.toISOString().slice(0, 10) ?? rawDate?.toISOString()
            }
          >
            {stampTime ? (
              <>
                <span className="sr-only">{date}</span>
                <span aria-hidden="true">{stampTime}</span>
              </>
            ) : (
              date
            )}
          </time>
        ) : null}
      </span>
      {sharedAlbum && path ? (
        <span className="shared-album-row-arrow">
          <WirSharedAlbumArrow />
        </span>
      ) : null}
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
  loadMemoryClip,
  isKeepsake,
}: {
  item: DashboardItem;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
  loadMemoryClip?: MomentClipLoader;
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
  // The Keepsake rotates through its memory's pictures. The server only lists
  // ready, non-sensitive ones; a sensitive preview never rotates.
  const gallery = item.gallery ?? [];
  const rotating =
    hasImage && item.previewIsSensitive !== true && gallery.length > 1;
  const clipsAllowed = Boolean(loadMemoryClip) && !prefersReducedData();
  const rotation = useMomentRotation(
    rotating ? gallery.length : 0,
    (position) => clipsAllowed && gallery[position]?.mediaType === 'VIDEO',
  );

  const feature = hasImage ? (
    <figure className="today-moment-figure eimir-motion-lift">
      <div className="today-moment-media">
        {rotating && loadMemoryImage ? (
          <WirMomentSlides
            memoryId={item.id}
            media={gallery}
            index={rotation.index}
            previous={rotation.previous}
            running={rotation.running}
            preloadNext={rotation.rotates}
            clipsAllowed={clipsAllowed}
            loadImage={loadMemoryImage}
            loadClip={loadMemoryClip}
            onClipEnded={rotation.advance}
          />
        ) : previewAttachmentId && loadMemoryImage ? (
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

  const frame = (moment: ReactNode) =>
    rotating ? (
      // The controls sit beside the link, never inside it.
      <div
        ref={rotation.frameRef}
        className="wir-moment-frame"
        {...rotation.engagement}
      >
        {moment}
      </div>
    ) : (
      moment
    );

  if (path) {
    return frame(
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
      </TodayDestinationLink>,
    );
  }
  return frame(<div className="today-moment">{feature}</div>);
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
  const [diaryLayout] = useDiaryLayout();
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
  const tone = hasMedia ? retrospectiveTone(item) : 'calm';
  const swayRef = useKeepsakeSway<HTMLElement>(
    diaryLayout === 'album' && tone !== 'calm',
  );
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
    <article
      className="today-living today-living-retrospective eimir-motion-lift"
      data-color-world={diaryLayout === 'album' ? 'warm' : undefined}
      data-diary-layout={diaryLayout}
      data-tone={tone}
    >
      <figure ref={swayRef} className="today-retrospective-photo">
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
  sharedNotesApi,
  account,
  recapMediaApis,
  partnerLocationApi,
  gamesApi,
}: {
  apis: M4ProductApis;
  apiBaseUrl?: string;
  spaceId: string;
  spacesApi?: SpacesApi;
  dailyCheckInsApi?: DailyCheckInsApi;
  dailyQuoteApi?: DailyQuoteApi;
  entitlementApi?: EntitlementsApi;
  collectionsApi?: CollectionsApi;
  sharedNotesApi?: SharedNotesApi;
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
  /** The shared garden's read for the optional Wir module. */
  gamesApi?: Pick<GamesApi, 'getGarden' | 'getWaitingGames'>;
}) {
  const { t } = useTranslation();
  // Clips of the shared moment play silently; they need the media APIs.
  const loadMemoryClip = useMemo<MomentClipLoader | undefined>(
    () =>
      recapMediaApis
        ? (memoryId, attachmentId, signal) =>
            loadVideoSource(
              recapMediaApis,
              spaceId,
              'MEMORY',
              memoryId,
              attachmentId,
              signal,
            )
        : undefined,
    [recapMediaApis, spaceId],
  );
  const { relationshipLabel } = usePartnerNickname();
  const wirDesign = useWirDesign();
  const wirDesignId = wirDesign?.current ?? DEFAULT_WIR_DESIGN;
  const wirLayout = wirDesignLayout(wirDesignId);
  // Names (Zu zweit) and note (Handschrift): a compact hero with the details
  // first and small portraits; note then leads with the latest Heart Moment.
  const namesLayout = wirLayout === 'names';
  const noteLayout = wirLayout === 'note';
  const compactPresence = namesLayout || noteLayout;
  // "Seite an Seite": the two people as rows and agenda date stamps.
  const sharedAlbum = wirLayout === 'rows';
  // "Verbunden": two portraits joined by a heart line (the default design).
  const connectedDesign = wirLayout === 'connected';
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

  const pinnedCollectionIds = selectedDashboardCollectionIds(
    dashboardPreferences,
    'pinned_collection',
  );
  const pinnedCollectionVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'pinned_collection',
  );

  // Pinned shared notes (#1969): the note carries the pin, so the module only
  // needs the visibility choice. More than five stay behind "all notes".
  const pinnedNoteVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'pinned_note',
  );
  const pinnedNotesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.sharedNoteWir(spaceId),
    queryFn: ({ signal }) => {
      if (!sharedNotesApi) throw new Error('Shared notes API is unavailable.');
      return apiCall(() =>
        sharedNotesApi.listSharedNotes(
          { spaceId, pinned: true, limit: WIR_NOTE_LIMIT },
          { signal },
        ),
      );
    },
    enabled: Boolean(sharedNotesApi && account?.id && pinnedNoteVisible),
    retry: false,
    staleTime: 60_000,
  });
  const pinnedNotes =
    pinnedNoteVisible && pinnedNotesQuery.data
      ? pinnedNotesQuery.data.items.slice(0, WIR_NOTE_LIMIT)
      : [];

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
  // "Gefühl teilen" from a partner check-in receipt opens the viewer's own
  // daily check-in once; the flag is removed so Back never reopens it.
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  // #2048: alone in the Space, the empty partner place invites.
  const partnerInviteRoute = `${SETTINGS_CATEGORY_ROUTES.relationship}#partner-connection-title`;
  const openPartnerInvite = () => {
    const taskOriginKey = captureOrigin({ selectedKey: 'wir-invite-place' });
    void navigate(
      partnerInviteRoute,
      taskOriginKey ? { state: { taskOriginKey } } : undefined,
    );
  };
  const openOwnCheckIn = dailyCheckIn?.ownAction.onActivate;
  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    if (!state?.[OPEN_OWN_DAILY_CHECK_IN_STATE] || !openOwnCheckIn) return;
    const { [OPEN_OWN_DAILY_CHECK_IN_STATE]: _consumed, ...rest } = state;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: Object.keys(rest).length > 0 ? rest : null,
    });
    openOwnCheckIn();
  }, [
    location.state,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    openOwnCheckIn,
  ]);
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

  // #2147: the opening waits briefly, invisibly, for what its portraits and
  // the check-in row show (the Space configuration, both profiles and their
  // photos), so they join the opening instead of arriving on their own.
  const portraitPending = (
    query: {
      isLoading: boolean;
      data?: { profileAttachmentId?: string | null } | null;
    },
    avatar: { avatarUrl: string | null; loadFailed: boolean },
  ) =>
    query.isLoading ||
    (Boolean(query.data?.profileAttachmentId) &&
      !avatar.avatarUrl &&
      !avatar.loadFailed);
  useStageHold(
    WIR_STAGE,
    Boolean(dashboardQuery.data) &&
      (liveSpaceConfigurationQuery.isLoading ||
        portraitPending(userProfileQuery, userAvatar) ||
        portraitPending(partnerProfileQuery, partnerAvatar)),
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
  // Content shown above (the moment, the month, the signal) is not repeated
  // in the trace (#2063: one memory appeared three times on Wir).
  const shownContentIds = new Set([
    ...featuredIds,
    ...monthlyItems.map((item) => item.id),
  ]);
  const recentActivities = activityItems
    .filter(
      (item) =>
        item.id !== currentSignalId &&
        !(item.targetId && shownContentIds.has(item.targetId)),
    )
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
      !(pinnedCollectionVisible && pinnedCollectionIds.length > 0) &&
      pinnedNotes.length === 0,
  );

  const showMomentSection = Boolean(!isSparse && focalItem);
  // #1907 I1: the first moment settles in where the move-in stood.
  const firstMomentSettle = useFirstContentSettle(
    dashboardQuery.data && !dashboardQuery.isCached ? isSparse : undefined,
  );
  const connectedMoment = useConnectedMoment(
    account?.id,
    spaceId,
    partner?.id ?? null,
    Boolean(dashboardQuery.data && !dashboardQuery.isCached),
  );
  const rootIntro = useRootTabIntro<HTMLDivElement>('today');

  // #1792: the distance is a normal Wir module. Directly below the couple
  // hero it stays inside the hero; moved elsewhere it renders in its place.
  const heroDistance =
    partner && account?.id && partnerLocationApi ? (
      <WirPartnerDistance
        api={partnerLocationApi}
        entitlementApi={entitlementApi}
        accountId={account.id}
        spaceId={spaceId}
        partnerName={partnerName}
        compact
      />
    ) : null;
  const partnerDistance =
    partner && account?.id && partnerLocationApi ? (
      <WirPartnerDistance
        api={partnerLocationApi}
        entitlementApi={entitlementApi}
        accountId={account.id}
        spaceId={spaceId}
        partnerName={partnerName}
      />
    ) : null;
  const partnerDistanceVisible = isDashboardModuleVisible(
    dashboardPreferences,
    'partner_distance',
  );
  const visibleModuleOrder = orderedDashboardModuleKeys(
    dashboardPreferences,
  ).filter((key) => isDashboardModuleVisible(dashboardPreferences, key));
  const partnerDistanceInHero =
    partnerDistanceVisible &&
    visibleModuleOrder[
      visibleModuleOrder.indexOf('relationship_presence') + 1
    ] === 'partner_distance' &&
    visibleModuleOrder.includes('relationship_presence');

  // The "Verbunden" Wir hero: two portraits joined by a bridge that carries what the
  // couple shares, their time together. Everything personal sits under its
  // person; only the two tappable marks sit on a photo.
  const heroDuration = dashboardQuery.data?.relationshipDuration;
  const heroDurationText = heroDuration
    ? formatRelationshipDuration(heroDuration, t)
    : undefined;
  const heroSplit = heroDuration
    ? calculateRelationshipDuration(
        new Date(heroDuration.startedOn),
        new Date(
          new Date(heroDuration.startedOn).getTime() +
            heroDuration.daysTogether * 86_400_000,
        ),
      )
    : null;
  const heroCountsDays =
    heroDuration?.displayMode === 'DAYS' || (heroSplit?.years ?? 0) === 0;
  const heroYears = heroCountsDays ? 0 : (heroSplit?.years ?? 0);
  const heroDayUnit = heroDuration
    ? t('m5s5.dashboard.durationDayCount', {
        count: heroDuration.daysTogether,
      })
        .replace(String(heroDuration.daysTogether), '')
        .trim()
    : '';
  // Above the line: the largest unit. Below it: the rest of the same figure.
  const heroBridgeLead = heroDuration
    ? heroYears > 0
      ? `${heroYears} ${t('m5s5.dashboard.durationYearUnit', { count: heroYears })}`
      : `${new Intl.NumberFormat(resolvedLocale()).format(heroDuration.daysTogether)} ${heroDayUnit}`
    : null;
  const heroBridgeRest =
    heroSplit && heroYears > 0
      ? [
          heroSplit.months > 0
            ? `${heroSplit.months} ${t('m5s5.dashboard.durationMonthUnit', { count: heroSplit.months })}`
            : null,
          heroSplit.remainingDays > 0
            ? t('m5s5.dashboard.durationDayCount', {
                count: heroSplit.remainingDays,
              })
            : null,
        ].filter((part): part is string => Boolean(part))
      : [];
  // #2072: today's occasion, only with a partner and in the Verbunden stage.
  const wirOccasion = useWirOccasion(
    partner && connectedDesign ? spaceId : undefined,
    account?.id,
    dashboardQuery.data?.upcoming,
  );
  // One stroke from person to person: each side draws its half of the heart.
  const heroBridgeLine = (
    <span className="wir-bridge-line" aria-hidden="true">
      <span className="wir-bridge-arm" />
      <svg viewBox="0 0 32 28" aria-hidden="true" focusable="false">
        {wirOccasion ? (
          <>
            <path
              className="wir-bridge-heart-fill wir-bridge-heart-fill-own"
              d="M16 26.5C4 17.5 1 11.5 1 7.5 1 3.5 4 1 8 1c3.5 0 6.5 2 8 5z"
            />
            <path
              className="wir-bridge-heart-fill wir-bridge-heart-fill-partner"
              d="M16 26.5c12-9 15-15 15-19 0-4-3-6.5-7-6.5-3.5 0-6.5 2-8 5z"
            />
          </>
        ) : null}
        <path
          className="wir-bridge-heart-own"
          pathLength={100}
          d="M16 26.5C4 17.5 1 11.5 1 7.5 1 3.5 4 1 8 1c3.5 0 6.5 2 8 5"
        />
        <path
          className="wir-bridge-heart-partner"
          pathLength={100}
          d="M16 26.5c12-9 15-15 15-19 0-4-3-6.5-7-6.5-3.5 0-6.5 2-8 5"
        />
      </svg>
      <span className="wir-bridge-arm wir-bridge-arm-partner" />
    </span>
  );
  const heroBridge = partner ? (
    heroBridgeLead ? (
      // The heart line opens the couple's own story. It leaves with its
      // origin, so Back returns to Wir.
      <TodayDestinationLink
        to={STORY_OURS_ROUTE}
        className="wir-bridge"
        ariaLabel={`${wirOccasion ? `${wirOccasion.primary}. ` : ''}${heroDurationText}. ${t('relationshipReflections.passport.title')}`}
      >
        <strong className="wir-bridge-lead">
          {wirOccasion ? (
            <span className="wir-bridge-swap">
              <span className="wir-bridge-time">{heroBridgeLead}</span>
              <span className="wir-bridge-occasion">{wirOccasion.primary}</span>
            </span>
          ) : (
            heroBridgeLead
          )}
        </strong>
        {heroBridgeLine}
        <span className="wir-bridge-rest">
          {wirOccasion ? (
            <span className="wir-bridge-swap">
              <span className="wir-bridge-time">
                {heroBridgeRest.map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </span>
              <span className="wir-bridge-occasion">
                {wirOccasion.secondary}
              </span>
            </span>
          ) : (
            heroBridgeRest.map((part) => <span key={part}>{part}</span>)
          )}
        </span>
      </TodayDestinationLink>
    ) : (
      <span className="wir-bridge" aria-hidden="true">
        <span />
        {heroBridgeLine}
        <span />
      </span>
    )
  ) : null;
  const heroOwnName = firstNameFromDisplayName(
    account?.displayName ?? '',
    t('m5s5.activity.you', { defaultValue: 'Du' }),
  );

  const renderConnectedHero = (
    avatarAction?: CouplePresenceAvatarAction,
    avatarOverlay?: ReactNode,
  ) => (
    <WirIntroStage occasion={wirOccasion}>
      <CouplePresence
        className="today-hero"
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
        onInviteClick={partner ? undefined : openPartnerInvite}
        waitingAvatarAdornment={
          partner ? undefined : (
            <span className="wir-stage-name is-waiting" aria-hidden="true">
              {t('m5s5.dashboard.partnerPlace')}
            </span>
          )
        }
        relationshipDuration={heroBridge ? undefined : heroDurationText}
        avatarAdornment={
          heroBridge ? (
            <>
              {heroBridge}
              <span className="wir-stage-amp" aria-hidden="true">
                {t('wirDesign.nameJoiner')}
              </span>
              {partnerDistanceInHero && heroDistance ? (
                <WirStageDistance>{heroDistance}</WirStageDistance>
              ) : null}
            </>
          ) : undefined
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
        primaryAvatarAdornment={
          <>
            <span className="wir-stage-name" aria-hidden="true">
              {heroOwnName}
            </span>
            {wirOccasion?.birthday === 'own' ? <WirOccasionCake /> : null}
            {dailyCheckIn?.ownBadge}
            {dailyCheckIn ? (
              <span
                className="wir-stage-gesture wir-stage-gesture-own"
                aria-hidden="true"
              >
                <svg
                  className="inline-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  {dailyCheckIn.ownHasValue ? (
                    <path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4L16.5 4.5z" />
                  ) : (
                    <path d="M12 5.5v13M5.5 12h13" />
                  )}
                </svg>
              </span>
            ) : null}
          </>
        }
        secondaryAvatarAdornment={
          partner ? (
            <>
              <span className="wir-stage-name" aria-hidden="true">
                {partnerName}
              </span>
              {wirOccasion?.birthday === 'partner' ? <WirOccasionCake /> : null}
              {dailyCheckIn?.partnerBadge}
              {avatarAction ? (
                <span className="wir-stage-gesture" aria-hidden="true">
                  <svg
                    className="inline-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M20.5 3.5 10.5 13.5M20.5 3.5l-6 17-4-7-7-4 17-6z" />
                  </svg>
                </span>
              ) : null}
            </>
          ) : undefined
        }
      />
    </WirIntroStage>
  );

  // The note layout opens with the latest shared Heart Moment that has words
  // and nothing to conceal; otherwise it shows the usual moment feature.
  const leadNote =
    noteLayout && keepsakeVisible && !dashboardQuery.isCached
      ? ordinaryShared.find(
          (item) =>
            item.type === 'HEART_MOMENT' &&
            !item.concealed &&
            !item.previewIsSensitive &&
            item.id !== retrospectiveId &&
            item.titleOrText?.trim(),
        )
      : undefined;
  const leadNotePath = leadNote
    ? dashboardItemPath(leadNote.type, leadNote.id)
    : null;
  const leadNoteDate = leadNote?.occurredOn ?? leadNote?.createdAt;
  const showNoteKeepsake = noteLayout && showMomentSection && keepsakeVisible;
  const noteReplacesKeepsake =
    noteLayout &&
    relationshipPresenceVisible &&
    ((!leadNotePath && showNoteKeepsake) ||
      leadNote?.id === focalItem?.item.id);
  const noteFeature =
    leadNote && leadNotePath ? (
      <TodayDestinationLink to={leadNotePath} className="wir-note-card">
        <span className="wir-note-kind">
          <EimirIcon name="momente" variant="filled" />
          {t('story.kind.heartMoment')}
          {leadNoteDate ? (
            <time
              className="wir-note-date"
              dateTime={leadNoteDate.toISOString()}
            >
              {formatCalendarDate(leadNoteDate)}
            </time>
          ) : null}
        </span>
        <p className="wir-note-text">{leadNote.titleOrText}</p>
        <span className="wir-note-open">
          {t('wirDesign.note.open')}
          <EimirIcon name="chevron-right" />
        </span>
      </TodayDestinationLink>
    ) : showNoteKeepsake && focalItem ? (
      <div className="wir-note-moment">
        <TodayMomentFeature
          item={focalItem.item}
          loadMemoryImage={loadMemoryImage}
          loadMemoryClip={loadMemoryClip}
          isKeepsake={focalItem.kind === 'keepsake'}
        />
      </div>
    ) : undefined;

  const renderClassicHero = (
    avatarAction?: CouplePresenceAvatarAction,
    avatarOverlay?: ReactNode,
  ) => (
    <CouplePresence
      className={
        compactPresence
          ? 'today-hero wir-compact-hero'
          : sharedAlbum
            ? 'today-hero shared-album-hero'
            : 'today-hero'
      }
      detailsFirst={compactPresence || sharedAlbum}
      stackNames={namesLayout}
      feature={noteFeature}
      titleAction={
        (compactPresence && partner) || sharedAlbum ? (
          <TodayDestinationLink
            to={STORY_OURS_ROUTE}
            className={
              compactPresence
                ? 'wir-compact-story-link'
                : 'shared-album-story-link'
            }
          >
            <span>{t('m5s5.dashboard.storySummaryTitle')}</span>
            {compactPresence ? (
              <EimirIcon name="chevron-right" />
            ) : (
              <WirSharedAlbumArrow />
            )}
          </TodayDestinationLink>
        ) : undefined
      }
      eyebrow={wirLayout === 'open' ? t('wirDesign.welcome') : undefined}
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
      avatarSize={compactPresence ? 'small' : sharedAlbum ? 'medium' : 'hero'}
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
      primaryAvatarAdornment={
        compactPresence || sharedAlbum ? (
          <span
            className={
              compactPresence ? 'wir-compact-person' : 'shared-album-person'
            }
          >
            <strong>
              {compactPresence && dailyCheckIn
                ? t('wirDesign.compact.own')
                : heroOwnName}
            </strong>
            {dailyCheckIn?.ownBadge}
          </span>
        ) : (
          dailyCheckIn?.ownBadge
        )
      }
      secondaryAvatarAdornment={
        compactPresence || sharedAlbum ? (
          <span
            className={
              compactPresence ? 'wir-compact-person' : 'shared-album-person'
            }
          >
            <strong>
              {compactPresence && avatarAction
                ? t('wirDesign.compact.partner', { name: partnerName })
                : partnerName}
            </strong>
            {dailyCheckIn?.partnerBadge}
          </span>
        ) : (
          dailyCheckIn?.partnerBadge
        )
      }
      signal={
        partnerDistanceInHero
          ? sharedAlbum
            ? heroDistance
            : partnerDistance
          : undefined
      }
    />
  );

  const renderRelationshipHero = (
    avatarAction?: CouplePresenceAvatarAction,
    avatarOverlay?: ReactNode,
  ) =>
    connectedDesign
      ? renderConnectedHero(avatarAction, avatarOverlay)
      : renderClassicHero(avatarAction, avatarOverlay);

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
        arrive
      />
    ) : null;
  const moduleContent: Record<DashboardModuleKey, ReactNode> = {
    partner_distance:
      partnerDistanceVisible && !partnerDistanceInHero && partnerDistance ? (
        <div className="today-partner-distance">{partnerDistance}</div>
      ) : null,
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
    // #2048: a brand-new, empty Space starts calm, without a Pro teaser.
    daily_quote: isSparse ? null : dailyQuote,
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
        {connectedMoment.visible ? (
          <ConnectedMoment playing={connectedMoment.playing} />
        ) : null}
        {relationshipPresenceVisible ? dailyCheckIn?.panel : null}
        {dailyCheckIn?.announcement}
        {account?.id && dailyCheckInsApi && entitlementApi && !isSparse ? (
          <WeeklyBriefWirHint
            accountId={account.id}
            spaceId={spaceId}
            dailyCheckInsApi={dailyCheckInsApi}
            entitlementApi={entitlementApi}
            modulesEnabled={vibeCheckEnabled || energyCheckInEnabled}
          />
        ) : null}
        <OnceIncomingSignal />
      </>
    ),
    keepsake: (
      <>
        {/* Personal shared content comes before the practical horizon:
                  Today should show the relationship itself before another
                  stack of planning utilities. */}
        {showMomentSection &&
        keepsakeVisible &&
        focalItem &&
        !noteReplacesKeepsake ? (
          <TodayModuleSection
            className={
              firstMomentSettle
                ? 'today-section-moment first-content-settle'
                : 'today-section-moment'
            }
            title={t('m5s5.today.keepsake.title')}
            headerAction={namesLayout ? <MomentCreateMenu /> : undefined}
          >
            <TodayMomentFeature
              item={focalItem.item}
              loadMemoryImage={loadMemoryImage}
              loadMemoryClip={loadMemoryClip}
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
                <TodayAgendaRow
                  key={item.id}
                  item={item}
                  sharedAlbum={sharedAlbum}
                />
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
        pinnedCollectionIds.length > 0 &&
        collectionsApi ? (
          <TodayModuleSection
            className={
              revealAfterCache
                ? 'today-section-pinned-collection today-module-reveal'
                : 'today-section-pinned-collection'
            }
            title={t(
              pinnedCollectionIds.length === 1
                ? 'm5s5.today.wirLists.titleOne'
                : 'm5s5.today.wirLists.titleMany',
            )}
            headerAction={
              <TodayDestinationLink
                to={MORE_COLLECTIONS_ROUTE}
                className="today-section-link"
                ariaLabel={t('m5s5.today.wirLists.allListsAria')}
              >
                {t('m5s5.today.wirLists.allLists')}
              </TodayDestinationLink>
            }
          >
            <WirLists
              apis={{ collections: collectionsApi }}
              accountId={account?.id ?? ''}
              spaceId={spaceId}
              collectionIds={pinnedCollectionIds}
              enabled={Boolean(account?.id)}
            />
          </TodayModuleSection>
        ) : dashboardQuery.isCached &&
          pinnedCollectionVisible &&
          pinnedCollectionIds.length > 0 ? (
          <TodayModulePlaceholder kind="pinned-collection" />
        ) : null}
      </>
    ),
    pinned_note: (
      <>
        {!dashboardQuery.isCached && pinnedNotes.length > 0 ? (
          <TodayModuleSection
            className={
              revealAfterCache
                ? 'today-section-pinned-note today-module-reveal'
                : 'today-section-pinned-note'
            }
            title={t(
              pinnedNotes.length === 1
                ? 'sharedNotes.wir.titleOne'
                : 'sharedNotes.wir.titleMany',
            )}
            headerAction={
              <TodayDestinationLink
                to={MORE_NOTES_ROUTE}
                className="today-section-link"
                ariaLabel={t('sharedNotes.wir.allNotesAria')}
              >
                {t('sharedNotes.wir.allNotes')}
              </TodayDestinationLink>
            }
          >
            <WirNotes
              notes={pinnedNotes}
              hasMore={pinnedNotesQuery.data?.hasMore === true}
              accountId={account?.id ?? ''}
            />
          </TodayModuleSection>
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
              <TodayDestinationLink
                to={ACTIVITY_ROUTE}
                className="today-section-link today-recent-activity-link"
                ariaLabel={t('m5s5.dashboard.allActivityAction')}
              >
                {t('m5s5.today.recent.allAction')}
              </TodayDestinationLink>
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
            variant="compact"
          />
        ) : dashboardQuery.isCached &&
          wirStatistics.allowed &&
          wirStatistics.enabled &&
          dashboardQuery.data?.sharedStorySummary ? (
          <TodayModulePlaceholder kind="story-summary" />
        ) : null}
      </>
    ),
    // #2158 C: on by default and Premium; it renders only while a game waits.
    games_waiting:
      account?.id && gamesApi && entitlementApi ? (
        <WirWaitingGamesModule
          gamesApi={gamesApi}
          entitlementApi={entitlementApi}
          accountId={account.id}
          spaceId={spaceId}
          partnerName={partnerName}
          visible={isDashboardModuleVisible(
            dashboardPreferences,
            'games_waiting',
          )}
        />
      ) : null,
    // Opt-in and Premium; it renders nothing (and reads nothing) otherwise.
    shared_garden:
      account?.id && gamesApi && entitlementApi ? (
        <WirGardenModule
          gamesApi={gamesApi}
          entitlementApi={entitlementApi}
          accountId={account.id}
          spaceId={spaceId}
          partnerName={partnerName}
          visible={isDashboardModuleVisible(
            dashboardPreferences,
            'shared_garden',
          )}
        />
      ) : null,
  };
  const orderedModuleKeys = orderedDashboardModuleKeys(dashboardPreferences);
  // The names layout keeps custom orders intact. With the catalog order, the
  // moment sits directly below the people; every other module keeps its place.
  const namesDefaultOrder =
    namesLayout &&
    orderedModuleKeys.every(
      (key, index) => key === DASHBOARD_MODULE_KEYS[index],
    );
  const visibleOrder: DashboardModuleKey[] = namesDefaultOrder
    ? [
        'relationship_presence',
        'keepsake',
        ...orderedModuleKeys.slice(1).filter((key) => key !== 'keepsake'),
      ]
    : orderedModuleKeys;

  return (
    <div
      className="page today-page"
      data-wir-design={
        wirDesign?.presentationReady === false ? undefined : wirDesignId
      }
      data-wir-layout={
        wirDesign?.presentationReady === false ? undefined : wirLayout
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
        <div
          className="today-content"
          ref={rootIntro}
          style={{ '--wir-intro-pace': WIR_INTRO_PACE } as CSSProperties}
        >
          <PageHeader
            variant="root"
            className="content-overview-heading"
            title={t('navigation.today')}
            action={
              noteLayout ||
              (namesLayout &&
                showMomentSection &&
                keepsakeVisible) ? undefined : (
                <MomentCreateMenu floating={!sharedAlbum} everything />
              )
            }
          />

          {visibleOrder.map((key) => (
            <Fragment key={key}>
              {moduleContent[key]}
              {noteLayout && key === 'relationship_presence' ? (
                <div className="wir-note-add">
                  <MomentCreateMenu />
                </div>
              ) : null}
            </Fragment>
          ))}
          {isSparse ? (
            <div className="new-space-experience">
              <h2 className="new-space-title">
                {partner
                  ? t('m5s5.dashboard.newSpacePartner', {
                      name: partnerName,
                    })
                  : connectedDesign
                    ? t('m5s5.dashboard.newSpaceSolo', { name: heroOwnName })
                    : t('m5s5.dashboard.newSpaceEmpty')}
              </h2>
              <p className="new-space-body">
                {t(
                  partner
                    ? 'm5s5.dashboard.newSpaceIntro'
                    : connectedDesign
                      ? 'm5s5.dashboard.newSpaceSoloIntro'
                      : 'quietHints.moveIn.solo',
                )}
              </p>
              <span className="new-space-wall" aria-hidden="true">
                <span />
              </span>
              <FirstStepAction
                to={MEMORY_CREATE_ROUTE}
                label={t('m5s5.dashboard.newSpaceAction')}
                icon="foto"
                selectedKey="wir-move-in"
              />
              {partner ? null : (
                <TodayDestinationLink
                  to={`${SETTINGS_CATEGORY_ROUTES.relationship}#partner-connection-title`}
                  className="new-space-invite"
                >
                  <EimirIcon name="profil" />
                  <span>{t('quietHints.moveIn.invite')}</span>
                </TodayDestinationLink>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
