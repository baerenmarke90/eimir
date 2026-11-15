import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  createM4ProductApis,
  type M4ProductApis,
  notificationPath,
} from '../client/m4Product';
import { ProfilesApi } from '../client/mediaApis';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';
import {
  isPartnerGestureKind,
  isPartnerReceipt,
  isWishDateReceiptKind,
  OPEN_OWN_DAILY_CHECK_IN_STATE,
  PARTNER_GESTURE_RECEIPT_EVENT,
  PARTNER_GESTURE_VARIANTS,
  PARTNER_RECEIPT_REFRESH_EVENT,
  type PartnerGestureReceiptRequest,
  receiptScope,
  selectArrivedGesture,
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
import { EimirIcon } from './EimirIcon';
import { AuthorAvatar } from './PersonIdentity';
import { ProMark } from './ProMark';
import { isModalLayerActive } from './useModalLifecycle';
import { usePresentationPresence } from './useOverlayPresence';
import { isGestureCooldown, usePartnerGesture } from './usePartnerGesture';
import './PartnerGestureReceipt.css';

/** Long enough to read the sentence and reach the reply comfortably. */
export const PARTNER_GESTURE_RECEIPT_VISIBLE_MS = 8_000;
const HANDLED_LIMIT = 64;
const ARRIVAL_PAGE_SIZE = 5;

const HEART_PATH =
  'M12 20.3 4.7 13A4.8 4.8 0 0 1 11.5 6.2l.5.6.5-.6A4.8 4.8 0 0 1 19.3 13Z';

function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={HEART_PATH} />
    </svg>
  );
}

type NameOf = (item: NotificationItem) => string | null;

function receiptCopy(
  item: NotificationItem,
  t: TFunction,
  nameOf: NameOf,
  locale: string | undefined,
) {
  if (isWishDateReceiptKind(item.kind)) {
    if (!item.appointmentStart || !item.target?.title) return null;
    const accepted = item.kind === 'WISH_DATE_ACCEPTED';
    const message = accepted
      ? 'accepted'
      : item.kind === 'WISH_DATE_COUNTERED'
        ? 'countered'
        : 'proposed';
    const name =
      nameOf(item) || t('m5s5.today.relationshipSignal.partnerFallback');
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(item.appointmentStart);
    return {
      variant: { motion: 'calm-ring', reply: 'WISH_DATE' } as const,
      title: t(`wishDateProposal.receipt.${message}`, { name }),
      detail: `${item.target.title} · ${date}`,
      reply: t(
        accepted ? 'wishDateProposal.openPlan' : 'wishDateProposal.review',
      ),
    };
  }
  if (!isPartnerGestureKind(item.kind)) return null;
  const variant = PARTNER_GESTURE_VARIANTS[item.kind];
  const name = nameOf(item);
  const base = `partnerGestureReceipt.${variant.copy}`;
  return {
    variant,
    label: name
      ? t('partnerGestureReceipt.label', { name })
      : t('partnerGestureReceipt.labelAnon'),
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

interface PartnerGestureReceiptProps {
  item: NotificationItem;
  accountId: string;
  spaceId: string;
  apis: M4ProductApis;
  profilesApi: ProfilesApi;
  presenceState: 'open' | 'exiting';
  onClose: () => void;
  onExitComplete: () => void;
  onHoldChange: (hold: boolean) => void;
}

/**
 * The shared presentation for partner gestures and Wish appointments. The
 * kind selects copy, glyph, motion variant and the allowed action; presentation,
 * accessibility, lifecycle and dismissal are identical.
 */
export function PartnerGestureReceipt({
  item,
  accountId,
  spaceId,
  apis,
  profilesApi,
  presenceState,
  onClose,
  onExitComplete,
  onHoldChange,
}: PartnerGestureReceiptProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const nameOf = useActorName();
  const titleId = useId();
  const copy = receiptCopy(item, t, nameOf, i18n.resolvedLanguage);
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
  const appointment = useMutation({
    networkMode: 'always',
    mutationFn: async (trigger: HTMLButtonElement) => {
      const opened = await apis.notifications.openNotification({
        spaceId,
        notificationId: item.id,
      });
      const destination = notificationPath(opened);
      if (!destination)
        throw new Error('No authorized appointment destination.');
      if (
        !trigger.isConnected ||
        !trigger.closest('aside[data-presence="open"]')
      )
        return;
      void client.invalidateQueries({
        queryKey: notificationUnreadCountQueryKey(spaceId),
      });
      void client.invalidateQueries({
        queryKey: notificationsListQueryKey(spaceId),
      });
      onClose();
      if (!taskOwnsScreen(false)) navigate(destination);
    },
  });

  const replyBusy = appointment.isPending || (replied && gesture.isPending);
  const replyFailed =
    appointment.isError || (replied && Boolean(gesture.error));
  const hold = pointerInside || focusInside || replyBusy || replyFailed;
  useEffect(() => {
    onHoldChange(hold);
  }, [hold, onHoldChange]);

  if (!copy) return null;
  const { variant } = copy;

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

  let reply: {
    label: string;
    run: (trigger: HTMLButtonElement) => void;
    pro?: boolean;
  } | null = null;
  if (variant.reply === 'WISH_DATE') {
    reply = {
      label: copy.reply,
      run: (trigger) => appointment.mutate(trigger),
    };
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

  const gestureStatus = !replied
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
  const status = appointment.isError
    ? { tone: 'error', text: t('wishDateProposal.openError') }
    : appointment.isPending
      ? { tone: 'pending', text: t('m5s3.wish.loading') }
      : gestureStatus;
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
      data-variant={variant.motion}
      data-presence={presenceState}
      data-testid="partner-gesture-receipt"
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
          <span className="partner-gesture-receipt-wave" data-wave="1" />
          {variant.motion === 'calm-ring' ? (
            <>
              <span className="partner-gesture-receipt-wave" data-wave="2" />
              <span className="partner-gesture-receipt-wave" data-wave="3" />
            </>
          ) : null}
          {item.actor ? (
            <AuthorAvatar
              author={item.actor}
              profilesApi={profilesApi}
              spaceId={spaceId}
              size="medium"
            />
          ) : (
            <span className="partner-gesture-receipt-placeholder" />
          )}
          <span
            className="partner-gesture-receipt-glyph"
            data-glyph={variant.reply === 'WISH_DATE' ? 'calendar' : undefined}
          >
            {variant.motion === 'heart-pulse' ? (
              <Heart />
            ) : variant.motion === 'kiss' ? (
              <span className="partner-gesture-receipt-kiss">
                <Heart />
                <Heart />
              </span>
            ) : variant.reply === 'WISH_DATE' ? (
              <EimirIcon name="kalender" />
            ) : (
              '?'
            )}
          </span>
          {variant.motion !== 'calm-ring' ? (
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
          <p className="partner-gesture-receipt-detail">{copy.detail}</p>
        </div>
        {showReply || status ? (
          <div className="partner-gesture-receipt-actions">
            {showReply && reply ? (
              <button
                type="button"
                className="partner-gesture-receipt-reply"
                aria-disabled={replyBusy || undefined}
                onClick={(event) => {
                  if (!replyBusy) reply.run(event.currentTarget);
                }}
              >
                {variant.motion === 'calm-ring' ? null : <Heart />}
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

interface PartnerGestureReceiptHostProps {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  /** The shell's existing unread count, in addition to a verified device wake. */
  unreadCount: number | undefined;
  /** A focused task route is active. */
  suppressed: boolean;
}

/**
 * Mounted once by `AppShell`, keyed by Account/Space. Detects a newly
 * arrived gesture from the existing unread-count refresh, or presents one the
 * user deliberately opened from a push. See
 * `docs/product/design/partner-gesture-receipt.md`.
 */
export function PartnerGestureReceiptHost({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  unreadCount,
  suppressed,
}: PartnerGestureReceiptHostProps) {
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
  const fetchingArrival = useRef(false);

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
      markHandled(item.id);
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
      const copy = receiptCopy(item, t, nameOf, i18n.resolvedLanguage);
      if (!copy) return;
      setEntry(item);
      setHold(false);
      setOpen(true);
      setAnnouncement(`${copy.title}. ${copy.detail}`);
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

  const readArrival = useCallback(() => {
    if (fetchingArrival.current) return;
    if (!windowOwnsAttention() || taskOwnsScreen(suppressedRef.current)) {
      notBefore.current = Date.now();
      return;
    }
    fetchingArrival.current = true;
    void apis.notifications
      .getNotifications({ spaceId, limit: ARRIVAL_PAGE_SIZE })
      .then((page) => {
        if (
          !live.current.mounted ||
          live.current.scope !== scope ||
          !windowOwnsAttention()
        )
          return;
        const arrived = selectArrivedGesture(page.items, {
          accountId,
          notBefore: notBefore.current,
          handled: handled.current,
        });
        for (const item of page.items)
          if (isPartnerReceipt(item)) markHandled(item.id);
        if (arrived) show(arrived);
      })
      .catch(() => undefined)
      .finally(() => {
        fetchingArrival.current = false;
      });
  }, [accountId, apis, markHandled, scope, show, spaceId]);

  useEffect(() => {
    if (unreadCount === undefined) return;
    const previous = previousCount.current;
    previousCount.current = unreadCount;
    if (previous !== undefined && unreadCount > previous) readArrival();
  }, [readArrival, unreadCount]);

  useEffect(() => {
    function onWake(event: Event) {
      if ((event as CustomEvent<string>).detail === scope) readArrival();
    }
    window.addEventListener(PARTNER_RECEIPT_REFRESH_EVENT, onWake);
    return () =>
      window.removeEventListener(PARTNER_RECEIPT_REFRESH_EVENT, onWake);
  }, [readArrival, scope]);

  // Push open: the item was already resolved through the authorized API.
  useEffect(() => {
    function onRequest(event: Event) {
      const detail = (event as CustomEvent<PartnerGestureReceiptRequest>)
        .detail;
      if (!detail || detail.scope !== live.current.scope) return;
      if (!isPartnerGestureKind(detail.item.kind)) return;
      if (handled.current.has(detail.item.id) && entry?.id !== detail.item.id)
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
  const entryId = entry?.id;
  useEffect(() => {
    if (!open || hold || !entryId) return;
    const timeout = window.setTimeout(
      close,
      PARTNER_GESTURE_RECEIPT_VISIBLE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [close, entryId, hold, open]);

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
        <PartnerGestureReceipt
          key={entry.id}
          item={entry}
          accountId={accountId}
          spaceId={spaceId}
          apis={apis}
          profilesApi={profilesApi}
          presenceState={presenceState}
          onClose={close}
          onExitComplete={completeExit}
          onHoldChange={setHold}
        />
      ) : null}
    </>
  );
}
