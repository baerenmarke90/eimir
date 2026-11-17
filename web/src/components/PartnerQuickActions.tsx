import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { M4ProductApis } from '../client/m4Product';
import { ONCE_CREATE_ROUTE } from '../client/onceMessages';
import {
  PARTNER_QUICK_ACTIONS_CAPABILITY,
  PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED,
} from '../client/partnerQuickActions';
import { proPaywallPath } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useMediaQuery } from '../client/useMediaQuery';
import { useTranslation } from '../i18n';
import { AvatarPhoto, type AvatarPhotoHandle } from './AvatarPhoto';
import type { CouplePresenceAvatarAction } from './CouplePresence';
import { postSnackbar } from '../client/snackbar';
import { DestinationIcon } from './DestinationIcon';
import { EimirIcon } from './EimirIcon';
import { type GestureFlight, startGestureFlight } from './gestureFlight';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { usePresentationPresence } from './useOverlayPresence';
import {
  isGestureCooldown,
  type PartnerAction,
  usePartnerGesture,
} from './usePartnerGesture';
import './PartnerQuickActions.css';

const EXPANDED_QUERY = '(min-width: 840px)';

const SENT_SNACKBAR: Record<PartnerAction, string> = {
  THINKING: 'snackbar.partnerQuickActionThinkingSent',
  KISS: 'snackbar.partnerQuickActionKissSent',
  CHECK_IN: 'snackbar.partnerQuickActionCheckInSent',
};

interface FeedbackState {
  tone: 'success' | 'error';
  text: string;
}

export interface PartnerQuickActionsProps {
  apis: M4ProductApis;
  entitlementApi?: EntitlementsApi;
  accountId: string;
  spaceId: string;
  partnerName: string;
  partnerPhotoUrl?: string | null;
  partnerPhotoIdentity?: string;
  thinkingOfYouAvailableAt: Date | null;
  /**
   * Partner context shown above the unchanged quick actions, e.g. today's
   * shared vibe and energy (#1790 slice A). Rendered only while open.
   */
  header?: ReactNode;
  children: (
    avatarAction: CouplePresenceAvatarAction,
    avatarOverlay: ReactNode,
  ) => ReactNode;
}

/**
 * One relationship-native entry point for deliberate partner gestures.
 *
 * The avatar pair owns discovery. Compact presentation delegates modality and
 * retained exit to ShortTaskSheet; Expanded presentation delegates outside /
 * Escape dismissal to the existing dismissible-popover primitive.
 */
export function PartnerQuickActions({
  apis,
  entitlementApi,
  accountId,
  spaceId,
  partnerName,
  thinkingOfYouAvailableAt,
  partnerPhotoUrl,
  partnerPhotoIdentity,
  header,
  children,
}: PartnerQuickActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, resolveOrigin } = useTaskOrigin();
  const isExpanded = useMediaQuery(EXPANDED_QUERY);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const photoRef = useRef<AvatarPhotoHandle>(null);
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  const titleId = useId();
  const [compactPresent, setCompactPresent] = useState(false);
  const [, setCooldownRevision] = useState(0);
  const { isOpen, close, toggle, triggerRef, panelRef } = useDismissiblePopover(
    {
      restoreFocusOnEscape: isExpanded,
      dismissOnOutsidePointerDown: isExpanded,
      dismissOnEscape: isExpanded,
    },
  );
  const desiredExpandedOpen = isOpen && isExpanded && !compactPresent;
  // The Expanded popover owns a history entry like the Compact sheet, so
  // system Back closes it. Handoffs release that entry before navigating.
  const releaseExpanded = useEditorHistoryEntry({
    isActive: desiredExpandedOpen,
    isDirty: false,
    onClose: close,
    onDiscardRequested: close,
  });
  const closeExpandedThen = (next: () => void) =>
    releaseExpanded(() => {
      close();
      next();
    });
  useEffect(() => {
    const key = (location.state as { taskReturnKey?: unknown } | null)
      ?.taskReturnKey;
    const origin = resolveOrigin(key);
    if (
      origin?.selectedKey !== 'partner-quick-actions' ||
      origin.to !== taskOriginPath(location.pathname, location.search)
    )
      return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scrollY, behavior: 'instant' });
      triggerRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    location.state,
    location.pathname,
    location.search,
    resolveOrigin,
    triggerRef,
  ]);
  const {
    present: expandedPresent,
    presenceState: expandedPresenceState,
    completeExit: completeExpandedExit,
  } = usePresentationPresence(desiredExpandedOpen);
  const compactOpen = isOpen && !isExpanded && !expandedPresent;

  const loadEntitlement = useMemo(
    () =>
      entitlementApi ? entitlementLoader(entitlementApi, spaceId) : undefined,
    [entitlementApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start; opening the
  // sheet only reads it when that startup read has not completed.
  const capabilityQuery = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: isOpen,
    capability: PARTNER_QUICK_ACTIONS_CAPABILITY,
  });

  const gesture = usePartnerGesture({
    apis,
    accountId,
    spaceId,
    onModuleDisabled: close,
  });
  const cachedThinkingCooldown = gesture.cooldowns.THINKING;
  const resolvedThinkingCooldown =
    cachedThinkingCooldown &&
    (!thinkingOfYouAvailableAt ||
      cachedThinkingCooldown > thinkingOfYouAvailableAt)
      ? cachedThinkingCooldown
      : thinkingOfYouAvailableAt;
  const extendedCooldowns = gesture.cooldowns;
  const feedback: FeedbackState | null = gesture.error
    ? {
        tone: 'error',
        text: t(
          isGestureCooldown(gesture.error)
            ? 'partnerQuickActions.cooldown'
            : gesture.error.code === PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED
              ? 'partnerQuickActions.premiumHint'
              : gesture.error.kind === 'offline'
                ? 'partnerQuickActions.offline'
                : 'partnerQuickActions.sendError',
        ),
      }
    : gesture.confirmedAction
      ? {
          tone: 'success',
          text: t(
            gesture.confirmedAction === 'THINKING'
              ? 'partnerQuickActions.sentThinking'
              : gesture.confirmedAction === 'KISS'
                ? 'partnerQuickActions.sentKiss'
                : 'partnerQuickActions.sentCheckIn',
          ),
        }
      : null;

  const cooldownNow = Date.now();
  const nextCooldownAt = [
    resolvedThinkingCooldown?.getTime(),
    extendedCooldowns.KISS?.getTime(),
    extendedCooldowns.CHECK_IN?.getTime(),
  ]
    .filter(
      (deadline): deadline is number =>
        deadline !== undefined && deadline > cooldownNow,
    )
    .reduce<number | null>(
      (earliest, deadline) =>
        earliest === null ? deadline : Math.min(earliest, deadline),
      null,
    );

  useEffect(() => {
    if (!isOpen || nextCooldownAt === null) return;
    // The server-owned absolute deadline remains the source of truth. This
    // timeout only causes a presentation refresh when that deadline passes; it
    // never delays domain state, sending, or overlay lifecycle.
    const timeout = window.setTimeout(
      () => setCooldownRevision((revision) => revision + 1),
      Math.max(0, nextCooldownAt - Date.now() + 1),
    );
    return () => window.clearTimeout(timeout);
  }, [isOpen, nextCooldownAt]);

  const thinkingCoolingDown = Boolean(
    resolvedThinkingCooldown &&
      resolvedThinkingCooldown.getTime() > cooldownNow,
  );
  const kissCoolingDown = Boolean(
    extendedCooldowns.KISS && extendedCooldowns.KISS.getTime() > cooldownNow,
  );
  const checkInCoolingDown = Boolean(
    extendedCooldowns.CHECK_IN &&
      extendedCooldowns.CHECK_IN.getTime() > cooldownNow,
  );

  // A sent gesture lifts out of the sheet, waits for the server, then the sheet
  // closes and it flies to the partner avatar. Without a flight (reduced
  // motion, no top-layer support) everything stays as it was.
  const flightRef = useRef<GestureFlight | null>(null);
  useEffect(
    () => () => {
      flightRef.current?.cancel();
      flightRef.current = null;
    },
    [],
  );
  const submit = (action: PartnerAction, button?: HTMLElement) => {
    const holder: { flight: GestureFlight | null } = { flight: null };
    const accepted = gesture.send(action, (succeeded) => {
      const flight = holder.flight;
      if (!flight) return;
      if (flightRef.current === flight) flightRef.current = null;
      if (succeeded) {
        close();
        postSnackbar(SENT_SNACKBAR[action]);
      }
      void flight.settle(succeeded);
    });
    const icon = button?.querySelector('.partner-quick-action-icon');
    const avatar = triggerRef.current;
    if (!accepted || !icon || !avatar) return;
    // The partner portrait is the target; with a split trigger the own portrait
    // sits in the neighbouring button of the same stack.
    const partnerPortrait =
      avatar.querySelector('.partner-avatar-secondary') ?? avatar;
    const own =
      avatar.querySelector('.partner-avatar-primary') ??
      avatar
        .closest('.partner-avatar-stack')
        ?.querySelector('.partner-avatar-primary') ??
      null;
    holder.flight = startGestureFlight({
      kind: action,
      source: icon,
      target: partnerPortrait,
      own,
    });
    flightRef.current = holder.flight;
  };

  const navigateToPro = () => {
    if (gesture.isInFlight()) return;
    const destination = proPaywallPath();
    if (!isExpanded && sheetRef.current) {
      sheetRef.current.closeForNavigation(() => navigate(destination));
      return;
    }
    closeExpandedThen(() => navigate(destination));
  };

  const openOnceComposer = () => {
    if (gesture.isInFlight()) return;
    const handoff = () => {
      const taskOriginKey = captureOrigin({
        selectedKey: 'partner-quick-actions',
      });
      void navigate(ONCE_CREATE_ROUTE, {
        state: taskOriginKey ? { taskOriginKey } : undefined,
      });
    };
    if (compactPresent) sheetRef.current?.closeForNavigation(handoff);
    else closeExpandedThen(handoff);
  };

  const hasExtendedCapability = capabilityQuery.data === true;
  const capabilityReady = capabilityQuery.isSuccess;

  const actionList = (
    <div className="partner-quick-actions-content">
      {header}
      {gesture.pendingAction ? (
        <p
          className="partner-quick-actions-pending"
          role="status"
          aria-live="polite"
        >
          {t(
            gesture.pendingAction === 'THINKING'
              ? 'partnerQuickActions.sendingThinking'
              : gesture.pendingAction === 'KISS'
                ? 'partnerQuickActions.sendingKiss'
                : 'partnerQuickActions.sendingCheckIn',
          )}
        </p>
      ) : null}
      <div className="partner-quick-actions-list">
        {partnerPhotoUrl ? (
          <button
            type="button"
            className="partner-quick-action"
            disabled={gesture.isPending}
            onClick={() => {
              if (gesture.isInFlight()) return;
              const showPhoto = () => {
                triggerRef.current?.focus({ preventScroll: true });
                photoRef.current?.open();
              };
              if (compactPresent)
                sheetRef.current?.closeForNavigation(showPhoto);
              else closeExpandedThen(showPhoto);
            }}
          >
            <span className="partner-quick-action-icon" aria-hidden="true">
              <EimirIcon name="expand" />
            </span>
            <span className="partner-quick-action-copy">
              <strong>{t('people.photoAction')}</strong>
            </span>
          </button>
        ) : null}

        <button
          ref={firstActionRef}
          type="button"
          className="partner-quick-action"
          disabled={thinkingCoolingDown}
          aria-disabled={gesture.isPending || undefined}
          onClick={(event) => submit('THINKING', event.currentTarget)}
        >
          <span className="partner-quick-action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20.3 4.7 13A4.8 4.8 0 0 1 11.5 6.2l.5.6.5-.6A4.8 4.8 0 0 1 19.3 13Z" />
            </svg>
          </span>
          <span className="partner-quick-action-copy">
            <strong>{t('partnerQuickActions.thinking')}</strong>
            {thinkingCoolingDown ? (
              <span>{t('partnerQuickActions.cooldown')}</span>
            ) : null}
          </span>
        </button>

        {capabilityQuery.isLoading ? (
          <div className="partner-quick-actions-capability" role="status">
            {t('partnerQuickActions.loadingPremium')}
          </div>
        ) : capabilityQuery.isError || !entitlementApi ? (
          <div className="partner-quick-actions-capability" role="status">
            <span>{t('partnerQuickActions.unavailablePremium')}</span>
            <button
              type="button"
              className="partner-quick-actions-retry"
              onClick={() => void capabilityQuery.refetch()}
            >
              {t('partnerQuickActions.retryPremium')}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="partner-quick-action"
              disabled={hasExtendedCapability && kissCoolingDown}
              aria-disabled={gesture.isPending || undefined}
              onClick={(event) =>
                hasExtendedCapability
                  ? submit('KISS', event.currentTarget)
                  : navigateToPro()
              }
            >
              <span className="partner-quick-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20.3 4.7 13A4.8 4.8 0 0 1 11.5 6.2l.5.6.5-.6A4.8 4.8 0 0 1 19.3 13Z" />
                  <path d="m18.2 3 .5 1.3L20 4.8l-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" />
                </svg>
              </span>
              <span className="partner-quick-action-copy">
                <strong>{t('partnerQuickActions.kiss')}</strong>
                {hasExtendedCapability && kissCoolingDown ? (
                  <span>{t('partnerQuickActions.cooldown')}</span>
                ) : null}
              </span>
              {!hasExtendedCapability ? (
                <ProMark label={t('partnerQuickActions.pro')} />
              ) : null}
            </button>

            <button
              type="button"
              className="partner-quick-action"
              disabled={hasExtendedCapability && checkInCoolingDown}
              aria-disabled={gesture.isPending || undefined}
              onClick={(event) =>
                hasExtendedCapability
                  ? submit('CHECK_IN', event.currentTarget)
                  : navigateToPro()
              }
            >
              <span
                className="partner-quick-action-icon partner-quick-action-icon-checkin"
                aria-hidden="true"
              >
                ?
              </span>
              <span className="partner-quick-action-copy">
                <strong>{t('partnerQuickActions.checkIn')}</strong>
                {hasExtendedCapability && checkInCoolingDown ? (
                  <span>{t('partnerQuickActions.cooldown')}</span>
                ) : null}
              </span>
              {!hasExtendedCapability ? (
                <ProMark label={t('partnerQuickActions.pro')} />
              ) : null}
            </button>
          </>
        )}
        <Link
          className="partner-quick-action"
          to={ONCE_CREATE_ROUTE}
          aria-disabled={gesture.isPending || undefined}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            openOnceComposer();
          }}
        >
          <span className="partner-quick-action-icon" aria-hidden="true">
            <DestinationIcon icon="private" />
          </span>
          <span className="partner-quick-action-copy">
            <strong>{t('onceMessages.title')}</strong>
            <span>{t('onceMessages.singleView')}</span>
          </span>
          <ProMark label={t('partnerQuickActions.pro')} />
        </Link>
      </div>

      {feedback ? (
        <p
          className={`partner-quick-actions-feedback is-${feedback.tone}${
            feedback.tone === 'success' ? ' eimir-motion-success' : ''
          }`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
        >
          {feedback.text}
        </p>
      ) : null}

      {capabilityReady && capabilityQuery.data === false ? (
        <p className="partner-quick-actions-premium-note">
          {t('partnerQuickActions.premiumHint')}{' '}
          <button type="button" onClick={navigateToPro}>
            {t('partnerQuickActions.premiumAction')}
          </button>
        </p>
      ) : null}
    </div>
  );

  // Keep retained presentation authoritative in both breakpoint directions.
  // This mirrors the notification-sheet handoff from #1220: the two surfaces
  // never coexist, and the currently presented surface keeps its stable id
  // until its real completion signal releases ownership.
  const surfaceId = compactPresent
    ? 'partner-quick-actions-sheet'
    : expandedPresent || isExpanded
      ? 'partner-quick-actions-popover'
      : 'partner-quick-actions-sheet';

  const avatarAction: CouplePresenceAvatarAction = {
    onActivate: () => {
      toggle();
    },
    label: t('partnerQuickActions.trigger', { partner: partnerName }),
    ref: triggerRef as RefObject<HTMLButtonElement>,
    expanded: isOpen,
    controls: surfaceId,
    hasPopup: 'dialog',
  };

  const expandedPopover = expandedPresent ? (
    <section
      ref={panelRef as RefObject<HTMLElement>}
      id={surfaceId}
      className="partner-quick-actions-popover"
      data-presence={expandedPresenceState}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onAnimationEnd={(event) => {
        if (
          event.target !== event.currentTarget ||
          expandedPresenceState !== 'exiting'
        )
          return;
        completeExpandedExit();
      }}
    >
      <h2 id={titleId} className="partner-quick-actions-title">
        {t('partnerQuickActions.title', { partner: partnerName })}
      </h2>
      {actionList}
    </section>
  ) : null;

  return (
    <>
      {partnerPhotoUrl ? (
        <AvatarPhoto
          ref={photoRef}
          name={partnerName}
          url={partnerPhotoUrl}
          identity={partnerPhotoIdentity ?? `${spaceId}:partner-photo`}
          renderTrigger={() => null}
        />
      ) : null}
      {children(avatarAction, expandedPopover)}
      <ShortTaskSheet
        ref={sheetRef}
        id={surfaceId}
        open={compactOpen}
        title={t('partnerQuickActions.title', { partner: partnerName })}
        onClose={() => close()}
        initialFocusRef={firstActionRef}
        restoreFocusRef={triggerRef}
        onPresenceChange={setCompactPresent}
        className="partner-quick-actions-sheet"
      >
        {actionList}
      </ShortTaskSheet>
    </>
  );
}
