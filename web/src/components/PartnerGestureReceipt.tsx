import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DashboardView } from '../api/generated/models/DashboardView';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { Configuration } from '../client/apiConfiguration';
import { authorDisplayName } from '../client/authorPresentation';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { dashboardQueryKey } from '../client/dashboardQueries';
import {
  NOTIFICATION_WAKE_EVENT,
  type NotificationWakeScope,
  notificationArrivalKey,
  selectArrivedNotification,
} from '../client/foregroundNotifications';
import {
  createM4ProductApis,
  type M4ProductApis,
  notificationPath,
} from '../client/m4Product';
import { ProfilesApi } from '../client/mediaApis';
import { getNotificationItemTitle } from '../client/notificationTitle';
import {
  isPartnerGestureKind,
  isPartnerNoticeKind,
  isWishDateReceiptKind,
  isWishSelectionReceiptKind,
  OPEN_OWN_DAILY_CHECK_IN_STATE,
  PARTNER_GESTURE_RECEIPT_EVENT,
  PARTNER_GESTURE_VARIANTS,
  PARTNER_NOTICE_ICONS,
  type PartnerGestureReceiptRequest,
  receiptScope,
  WISH_SELECTION_RECEIPT_COPY,
} from '../client/partnerGestureReceipt';
import { usePartnerNickname } from '../client/partnerNickname';
import { PARTNER_QUICK_ACTIONS_CAPABILITY } from '../client/partnerQuickActions';
import { DEFAULT_APP_ROUTE, proPaywallPath } from '../client/routes';
import {
  type SpaceConfigurationSnapshot,
  spaceConfigurationQueryKey,
} from '../client/spaceConfiguration';
import { useSpaceCapability } from '../client/spaceEntitlement';
import { isDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import { wishDateProposalQueryKey } from '../client/wishDateProposal';
import { useTranslation } from '../i18n';
import { haptic } from '../motion/haptics';
import { type MomentTicket, startMoment } from '../motion/moment';
import { usePresentationPresence } from '../motion/presence';
import { durationMs } from '../motion/tokens';
import { EimirIcon } from './EimirIcon';
import { NotificationMotion } from './NotificationMotion';
import { AuthorAvatar } from './PersonIdentity';
import { ProMark } from './ProMark';
import { isModalLayerActive } from './useModalLifecycle';
import { isGestureCooldown, usePartnerGesture } from './usePartnerGesture';
import '../motion/moments.css';
import './PartnerGestureReceipt.css';

/** Long enough to read the sentence and reach the reply comfortably. */
export const FOREGROUND_NOTIFICATION_VISIBLE_MS = 8_000;
const HANDLED_LIMIT = 64;
const ARRIVAL_PAGE_SIZE = 5;

/** The Moment identity of a received notification's choreography. */
export const RECEIPT_MOMENT = 'notification.receipt';
/** Receipts whose beats were granted and have not ended yet, by arrival key. */
const playingReceipts = new Map<string, MomentTicket>();

/** The receipt's beats end when the badge has landed (receipt CSS). */
function receiptMomentDuration(): number {
  return (
    2 * durationMs('sequence-beat') +
    durationMs('gesture-sequence') +
    durationMs('context')
  );
}

/**
 * Whether a receipt's choreography plays (Motion Contract 4.7). It plays at
 * most once per received item, as the screen's one emphasized motion, only
 * while the page is visible and never with reduced motion; otherwise the
 * receipt shows its settled badge at once (`final`). A received gesture the
 * person is looking at gets the Moment's one haptic on its first beat (4.10);
 * calm notices get none. The same item rendering again while its beats run
 * (a re-render, StrictMode) keeps playing instead of settling early.
 */
export function receiptMoment(
  key: string,
  gesture: boolean,
): 'playing' | 'final' {
  if (playingReceipts.has(key)) return 'playing';
  const duration = receiptMomentDuration();
  const ticket = startMoment(RECEIPT_MOMENT, key, {
    visible:
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
    duration,
  });
  if (!ticket) return 'final';
  if (ticket.delay > 0) {
    // Another emphasized motion is running: settle instead of waiting.
    ticket.end();
    return 'final';
  }
  if (gesture) haptic('moment');
  playingReceipts.set(key, ticket);
  setTimeout(() => {
    playingReceipts.delete(key);
    ticket.end();
  }, duration);
  return 'playing';
}

const HEART_PATH =
  'M12 20.3 4.7 13A4.8 4.8 0 0 1 11.5 6.2l.5.6.5-.6A4.8 4.8 0 0 1 19.3 13Z';

function Heart() {
  return (
    <svg
      className="inline-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={HEART_PATH} />
    </svg>
  );
}

type NameOf = (item: NotificationItem) => string | null;

function receiptCopy(
  item: NotificationItem,
  t: TFunction,
  nameOf: NameOf,
  accountId: string,
  locale?: string,
) {
  if (isWishDateReceiptKind(item.kind)) {
    const accepted = item.kind === 'WISH_DATE_ACCEPTED';
    const message = accepted
      ? 'accepted'
      : item.kind === 'WISH_DATE_COUNTERED'
        ? 'countered'
        : 'proposed';
    const name =
      nameOf(item) || t('m5s5.today.relationshipSignal.partnerFallback');
    const date = item.appointmentStart
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(item.appointmentStart)
      : null;
    return {
      variant: {
        motion: 'calm-ring',
        reply: 'OPEN',
        icons: PARTNER_NOTICE_ICONS[item.kind],
      } as const,
      title: t(`wishDateProposal.receipt.${message}`, { name }),
      detail:
        item.target?.title && date ? `${item.target.title} · ${date}` : null,
      reply: t(
        accepted ? 'wishDateProposal.openPlan' : 'wishDateProposal.review',
      ),
    };
  }
  if (isWishSelectionReceiptKind(item.kind)) {
    const copy = WISH_SELECTION_RECEIPT_COPY[item.kind];
    const name =
      nameOf(item) || t('m5s5.today.relationshipSignal.partnerFallback');
    const reply =
      copy === 'ready' || copy === 'accepted' ? 'resultReply' : `${copy}Reply`;
    return {
      variant: {
        motion: 'calm-ring',
        reply: 'OPEN',
        icons: PARTNER_NOTICE_ICONS[item.kind],
      } as const,
      title: t(`wishSelection.notice.${copy}Title`, { name }),
      detail:
        copy === 'shared'
          ? item.selectionSize
            ? t('wishSelection.notice.sharedDetail', {
                count: item.selectionSize,
              })
            : t('wishSelection.notice.sharedDetailUncounted')
          : t(`wishSelection.notice.${copy}Detail`, { name }),
      reply: t(`wishSelection.notice.${reply}`),
    };
  }
  if (!isPartnerGestureKind(item.kind)) {
    return {
      // Partner-caused notices share the calm receipt; system and owner-only
      // kinds keep the plain notification surface.
      variant: isPartnerNoticeKind(item.kind)
        ? ({
            motion: 'calm-ring',
            reply: 'OPEN',
            icons: PARTNER_NOTICE_ICONS[item.kind],
          } as const)
        : null,
      title: getNotificationItemTitle(item, t, accountId),
      detail: null,
      reply: t('m5s5.common.open'),
    };
  }
  const variant = PARTNER_GESTURE_VARIANTS[item.kind];
  const name = nameOf(item);
  const base = `partnerGestureReceipt.${variant.copy}`;
  return {
    variant,
    title: name ? t(`${base}.title`, { name }) : t(`${base}.titleAnon`),
    detail: t(`${base}.detail`),
    reply: t(`${base}.reply`),
  };
}

function useActorName(): NameOf {
  const { relationshipLabel } = usePartnerNickname();
  return useCallback(
    (item: NotificationItem) =>
      item.actor
        ? relationshipLabel(
            item.actor.id,
            authorDisplayName(item.actor),
            authorDisplayName(item.actor),
          ) || null
        : null,
    [relationshipLabel],
  );
}

/** A focused task, unsaved draft, modal layer or text entry owns the screen. */
function taskOwnsScreen(suppressed: boolean): boolean {
  if (suppressed || isDocumentLeaveBlocked() || isModalLayerActive())
    return true;
  if (typeof document === 'undefined') return true;
  if (document.querySelector('dialog[open], [aria-modal="true"]')) return true;
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.isContentEditable ||
      active.matches(
        'textarea, select, input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="reset"]):not([type="range"])',
      ))
  );
}

/** Only the visible, focused window may present; other tabs stay silent. */
function windowOwnsAttention(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  );
}

interface NotificationReceiptProps {
  item: NotificationItem;
  accountId: string;
  spaceId: string;
  apis: M4ProductApis;
  profilesApi: ProfilesApi;
  presenceState: 'open' | 'exiting';
  onClose: () => void;
  onExitComplete: () => void;
  onHoldChange: (hold: boolean) => void;
  openNotification?: (notificationId: string, sourceEventId: string) => void;
}

/**
 * One foreground surface. Partner gestures provide their own reply and motion;
 * other notifications open the same destination as a system notification.
 */
function NotificationReceipt({
  item,
  accountId,
  spaceId,
  apis,
  profilesApi,
  presenceState,
  onClose,
  onExitComplete,
  onHoldChange,
  openNotification,
}: NotificationReceiptProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const nameOf = useActorName();
  const titleId = useId();
  const copy = receiptCopy(item, t, nameOf, accountId, i18n.resolvedLanguage);
  const [replied, setReplied] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const gesture = usePartnerGesture({
    apis,
    accountId,
    spaceId,
    onModuleDisabled: onClose,
  });
  // Only the session's cached entitlement view; this surface never reads it.
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    enabled: false,
    capability: PARTNER_QUICK_ACTIONS_CAPABILITY,
  });

  const replyBusy = replied && gesture.isPending;
  const replyFailed = replied && Boolean(gesture.error);
  const hold = pointerInside || focusInside || replyBusy || replyFailed;
  useEffect(() => {
    onHoldChange(hold);
  }, [hold, onHoldChange]);

  const { variant } = copy;
  // Gestures draw their own glyph; the other calm notices badge an icon.
  const icons = variant && 'icons' in variant ? variant.icons : undefined;
  const calm = variant?.motion === 'calm-ring';
  const [moment] = useState(() =>
    variant ? receiptMoment(notificationArrivalKey(item), !calm) : undefined,
  );
  // A badge on an avatar-less circle would only repeat the icon inside it.
  const showBadge =
    icons !== undefined && (item.actor || icons.badge !== icons.center);

  const configuration = client.getQueryData<SpaceConfigurationSnapshot>(
    spaceConfigurationQueryKey(accountId, spaceId),
  )?.configuration;
  const gesturesEnabled = configuration?.supportGesturesEnabled === true;
  const now = Date.now();
  const dashboardCooldown = client.getQueryData<DashboardView>(
    dashboardQueryKey(spaceId),
  )?.thinkingOfYouAvailableAt;
  const coolingDown = (deadline: Date | null | undefined) =>
    Boolean(deadline && deadline.getTime() > now);

  const send = (action: 'THINKING' | 'KISS') => {
    if (gesture.isInFlight()) return;
    setReplied(true);
    gesture.send(action);
  };

  let reply: { label: string; run: () => void; pro?: boolean } | null = null;
  if (!variant || variant.reply === 'OPEN') {
    if (openNotification) {
      reply = {
        label: copy.reply,
        run: () => {
          onClose();
          openNotification(item.id, item.sourceEventId);
        },
      };
    }
  } else if (variant.reply === 'THINKING') {
    if (
      gesturesEnabled &&
      !coolingDown(gesture.cooldowns.THINKING) &&
      !coolingDown(dashboardCooldown)
    )
      reply = { label: copy.reply, run: () => send('THINKING') };
  } else if (variant.reply === 'KISS') {
    if (gesturesEnabled && capability.data === true) {
      if (!coolingDown(gesture.cooldowns.KISS))
        reply = { label: copy.reply, run: () => send('KISS') };
    } else if (gesturesEnabled && capability.data === false) {
      // The same Pro discovery as the quick actions: no send, no new paywall.
      reply = {
        label: copy.reply,
        pro: true,
        run: () => {
          onClose();
          navigate(proPaywallPath());
        },
      };
    }
  } else if (
    configuration?.vibeCheckEnabled === true ||
    configuration?.energyCheckInEnabled === true
  ) {
    reply = {
      label: copy.reply,
      run: () => {
        onClose();
        navigate(DEFAULT_APP_ROUTE, {
          state: { [OPEN_OWN_DAILY_CHECK_IN_STATE]: true },
        });
      },
    };
  }

  const status = !replied
    ? null
    : gesture.pendingAction
      ? {
          tone: 'pending',
          text: t(
            gesture.pendingAction === 'KISS'
              ? 'partnerQuickActions.sendingKiss'
              : 'partnerQuickActions.sendingThinking',
          ),
        }
      : gesture.error
        ? {
            tone: 'error',
            text: t(
              isGestureCooldown(gesture.error)
                ? 'partnerQuickActions.cooldown'
                : gesture.error.kind === 'offline'
                  ? 'partnerQuickActions.offline'
                  : 'partnerQuickActions.sendError',
            ),
          }
        : gesture.confirmedAction
          ? {
              tone: 'success',
              text: t(
                gesture.confirmedAction === 'KISS'
                  ? 'partnerQuickActions.sentKiss'
                  : 'partnerQuickActions.sentThinking',
              ),
            }
          : null;
  const showReply =
    reply && (!replied || status?.tone === 'error' || status === null);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  }

  return (
    <aside
      className="partner-gesture-receipt"
      data-variant={variant?.motion}
      data-moment={moment === 'final' ? 'final' : undefined}
      data-presence={presenceState}
      data-testid={
        isPartnerGestureKind(item.kind) || isWishDateReceiptKind(item.kind)
          ? 'partner-gesture-receipt'
          : 'foreground-notification'
      }
      aria-labelledby={titleId}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocusInside(false);
      }}
      onKeyDown={onKeyDown}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && presenceState === 'exiting')
          onExitComplete();
      }}
    >
      <div className="partner-gesture-receipt-body">
        <div className="partner-gesture-receipt-person" aria-hidden="true">
          {variant && !calm ? (
            <span className="partner-gesture-receipt-wave" data-wave="1" />
          ) : null}
          {item.actor ? (
            <AuthorAvatar
              author={item.actor}
              profilesApi={profilesApi}
              spaceId={spaceId}
              size="medium"
            />
          ) : (
            <span className="partner-gesture-receipt-placeholder">
              {icons ? (
                <EimirIcon name={icons.center} />
              ) : variant ? null : (
                <NotificationMotion kind={item.kind} />
              )}
            </span>
          )}
          {icons ? (
            showBadge ? (
              <span className="partner-gesture-receipt-glyph" data-glyph="icon">
                <EimirIcon name={icons.badge} />
              </span>
            ) : null
          ) : variant ? (
            <span className="partner-gesture-receipt-glyph">
              {variant.motion === 'heart-pulse' ? (
                <Heart />
              ) : variant.motion === 'kiss' ? (
                <span className="partner-gesture-receipt-kiss">
                  <Heart />
                  <Heart />
                </span>
              ) : (
                '?'
              )}
            </span>
          ) : item.actor ? (
            <span className="partner-gesture-receipt-glyph notification-motion-badge">
              <NotificationMotion kind={item.kind} />
            </span>
          ) : null}
          {variant && !calm ? (
            <span className="partner-gesture-receipt-hero">
              <Heart />
              {variant.motion === 'kiss' ? <Heart /> : null}
            </span>
          ) : null}
        </div>
        <div className="partner-gesture-receipt-copy">
          <p id={titleId} className="partner-gesture-receipt-title">
            {copy.title}
          </p>
          {copy.detail ? (
            <p className="partner-gesture-receipt-detail">{copy.detail}</p>
          ) : null}
        </div>
        {showReply || status ? (
          <div className="partner-gesture-receipt-actions">
            {showReply && reply ? (
              <button
                type="button"
                className="partner-gesture-receipt-reply"
                aria-disabled={replyBusy || undefined}
                onClick={() => {
                  if (!replyBusy) reply.run();
                }}
              >
                {variant && !calm ? <Heart /> : null}
                <span>{reply.label}</span>
                {reply.pro ? (
                  <ProMark label={t('partnerQuickActions.pro')} />
                ) : null}
              </button>
            ) : null}
            {status ? (
              <p
                className={`partner-gesture-receipt-status${
                  status.tone === 'error' ? ' is-error' : ''
                }`}
                role={status.tone === 'error' ? 'alert' : 'status'}
              >
                {status.text}
              </p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="partner-gesture-receipt-close"
          aria-label={t('partnerGestureReceipt.close')}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </aside>
  );
}

interface ForegroundNotificationHostProps {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  /** The shell's existing unread count also detects arrivals without Push. */
  unreadCount: number | undefined;
  /** A focused task route is active. */
  suppressed: boolean;
  openNotification?: (notificationId: string, sourceEventId: string) => void;
}

/**
 * Account/Space-scoped foreground presentation for the notification inbox.
 * A wake is a refresh signal. All displayed content comes from the inbox.
 */
export function ForegroundNotificationHost({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  unreadCount,
  suppressed,
  openNotification,
}: ForegroundNotificationHostProps) {
  const { t, i18n } = useTranslation();
  const nameOf = useActorName();
  const client = useQueryClient();
  const location = useLocation();
  const pathname = useRef(location.pathname);
  pathname.current = location.pathname;
  const scope = receiptScope(accountId, spaceId);
  const apis = useMemo(
    () => createM4ProductApis(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const profilesApi = useMemo(
    () =>
      new ProfilesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );

  const live = useRef({ scope, mounted: true });
  live.current.scope = scope;
  useEffect(() => {
    live.current.mounted = true;
    return () => {
      live.current.mounted = false;
    };
  }, []);
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
  // Items created before this shell instance are history, never arrivals.
  const notBefore = useRef(Date.now());
  const handled = useRef(new Set<string>());
  const previousCount = useRef<number | undefined>(undefined);
  const loadingArrivals = useRef(false);
  const arrivalReadPending = useRef(false);

  const [entry, setEntry] = useState<NotificationItem | null>(null);
  const [open, setOpen] = useState(false);
  const [hold, setHold] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const { present, presenceState, completeExit } =
    usePresentationPresence(open);

  const markHandled = useCallback((id: string) => {
    const ids = handled.current;
    ids.add(id);
    if (ids.size > HANDLED_LIMIT)
      ids.delete(ids.values().next().value as string);
  }, []);

  const show = useCallback(
    (item: NotificationItem) => {
      markHandled(notificationArrivalKey(item));
      if (isWishDateReceiptKind(item.kind)) {
        const wishId =
          item.targetType === 'WISH' ? (item.targetId ?? undefined) : undefined;
        void client.invalidateQueries({
          queryKey: wishDateProposalQueryKey(
            apiBaseUrl,
            accountId,
            spaceId,
            wishId,
          ),
        });
        if (item.kind === 'WISH_DATE_ACCEPTED') {
          void client.invalidateQueries({
            queryKey: authorSummaryQueryKeys.wishes(spaceId),
          });
          void client.invalidateQueries({
            queryKey: authorSummaryQueryKeys.plans(spaceId),
          });
        }
        if (notificationPath(item)?.split('#')[0] === pathname.current) return;
      }
      if (taskOwnsScreen(suppressedRef.current)) return;
      const copy = receiptCopy(
        item,
        t,
        nameOf,
        accountId,
        i18n.resolvedLanguage,
      );
      setEntry(item);
      setHold(false);
      setOpen(true);
      setAnnouncement(
        copy.detail ? `${copy.title}. ${copy.detail}` : copy.title,
      );
    },
    [
      accountId,
      apiBaseUrl,
      client,
      i18n.resolvedLanguage,
      markHandled,
      nameOf,
      spaceId,
      t,
    ],
  );

  const close = useCallback(() => {
    setOpen(false);
    setAnnouncement('');
  }, []);

  useEffect(() => {
    let foreground = windowOwnsAttention();
    function visibilityChanged() {
      const visible = windowOwnsAttention();
      if (visible === foreground) return;
      foreground = visible;
      notBefore.current = Date.now();
      if (!visible) close();
    }
    window.addEventListener('focus', visibilityChanged);
    window.addEventListener('blur', visibilityChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      window.removeEventListener('focus', visibilityChanged);
      window.removeEventListener('blur', visibilityChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [close]);

  const refreshArrivals = useCallback(async () => {
    if (!windowOwnsAttention() || taskOwnsScreen(suppressedRef.current)) {
      notBefore.current = Date.now();
      return;
    }
    if (loadingArrivals.current) {
      arrivalReadPending.current = true;
      return;
    }
    loadingArrivals.current = true;
    try {
      do {
        arrivalReadPending.current = false;
        const page = await apis.notifications.getNotifications({
          spaceId,
          limit: ARRIVAL_PAGE_SIZE,
        });
        if (
          !live.current.mounted ||
          live.current.scope !== scope ||
          !windowOwnsAttention()
        )
          return;
        const arrived = selectArrivedNotification(page.items, {
          accountId,
          notBefore: notBefore.current,
          handled: handled.current,
        });
        for (const item of page.items)
          markHandled(notificationArrivalKey(item));
        if (arrived) show(arrived);
      } while (
        arrivalReadPending.current &&
        !taskOwnsScreen(suppressedRef.current)
      );
    } catch {
      // A failed foreground read leaves the inbox as the fallback.
    } finally {
      loadingArrivals.current = false;
    }
  }, [accountId, apis, markHandled, scope, show, spaceId]);

  useEffect(() => {
    if (unreadCount === undefined) return;
    const previous = previousCount.current;
    previousCount.current = unreadCount;
    if (previous !== undefined && unreadCount > previous)
      void refreshArrivals();
  }, [refreshArrivals, unreadCount]);

  useEffect(() => {
    function onWake(event: Event) {
      const detail = (event as CustomEvent<NotificationWakeScope>).detail;
      if (
        detail?.accountId === accountId &&
        detail.apiBaseUrl === apiBaseUrl &&
        detail.spaceId === spaceId
      )
        void refreshArrivals();
    }
    window.addEventListener(NOTIFICATION_WAKE_EVENT, onWake);
    return () => window.removeEventListener(NOTIFICATION_WAKE_EVENT, onWake);
  }, [accountId, apiBaseUrl, refreshArrivals, spaceId]);

  // Push open: the item was already resolved through the authorized API.
  useEffect(() => {
    function onRequest(event: Event) {
      const detail = (event as CustomEvent<PartnerGestureReceiptRequest>)
        .detail;
      if (!detail || detail.scope !== live.current.scope) return;
      if (!isPartnerGestureKind(detail.item.kind)) return;
      const key = notificationArrivalKey(detail.item);
      if (
        handled.current.has(key) &&
        (!entry || notificationArrivalKey(entry) !== key)
      )
        return;
      show(detail.item);
    }
    window.addEventListener(PARTNER_GESTURE_RECEIPT_EVENT, onRequest);
    return () =>
      window.removeEventListener(PARTNER_GESTURE_RECEIPT_EVENT, onRequest);
  }, [entry, show]);

  // A focused task starting now takes precedence over the receipt.
  useEffect(() => {
    if (suppressed) close();
  }, [close, suppressed]);

  // A newer arrival replaces the current one and restarts its reading time.
  const entryKey = entry ? notificationArrivalKey(entry) : null;
  useEffect(() => {
    if (!open || hold || !entryKey) return;
    const timeout = window.setTimeout(
      close,
      FOREGROUND_NOTIFICATION_VISIBLE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [close, entryKey, hold, open]);

  return (
    <>
      <div
        className="partner-gesture-receipt-announcer"
        data-testid="partner-gesture-receipt-announcer"
        // A plain polite live region, not role="status": the shell already
        // owns the page's status regions (Snackbar, task feedback).
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
      {present && entry ? (
        <NotificationReceipt
          key={entryKey}
          item={entry}
          accountId={accountId}
          spaceId={spaceId}
          apis={apis}
          profilesApi={profilesApi}
          presenceState={presenceState}
          onClose={close}
          onExitComplete={completeExit}
          onHoldChange={setHold}
          openNotification={openNotification}
        />
      ) : null}
    </>
  );
}
