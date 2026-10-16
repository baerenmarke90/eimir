import { useQuery } from '@tanstack/react-query';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import {
  loadPartnerQuickActionsCapability,
  PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED,
  partnerQuickActionsEntitlementQueryKey,
} from '../client/partnerQuickActions';
import { ClientProblemError } from '../client/problemDetails';
import { MORE_PROFILE_ROUTE } from '../client/routes';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import { useMediaQuery } from '../client/useMediaQuery';
import type { M4ProductApis } from '../client/m4Product';
import { useTranslation } from '../i18n';
import type { CouplePresenceAvatarAction } from './CouplePresence';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { usePresentationPresence } from './useOverlayPresence';
import {
  isGestureCooldown,
  usePartnerGesture,
  type PartnerAction,
} from './usePartnerGesture';
import './PartnerQuickActions.css';

const EXPANDED_QUERY = '(min-width: 840px)';

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
  thinkingOfYouAvailableAt: Date | null;
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
  children,
}: PartnerQuickActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isExpanded = useMediaQuery(EXPANDED_QUERY);
  const firstActionRef = useRef<HTMLButtonElement>(null);
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
  const {
    present: expandedPresent,
    presenceState: expandedPresenceState,
    completeExit: completeExpandedExit,
  } = usePresentationPresence(desiredExpandedOpen);
  const compactOpen = isOpen && !isExpanded && !expandedPresent;

  const capabilityQuery = useQuery({
    queryKey: partnerQuickActionsEntitlementQueryKey(accountId, spaceId),
    queryFn: ({ signal }) => {
      if (!entitlementApi) {
        throw new ClientProblemError(
          'server',
          undefined,
          'ENTITLEMENT_API_UNAVAILABLE',
        );
      }
      return loadPartnerQuickActionsCapability(entitlementApi, spaceId, signal);
    },
    enabled: isOpen,
    retry: false,
    staleTime: 60_000,
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

  const submit = (action: PartnerAction) => gesture.send(action);

  const navigateToPro = () => {
    if (gesture.isInFlight()) return;
    const destination = `${MORE_PROFILE_ROUTE}#profile-premium`;
    if (!isExpanded && sheetRef.current) {
      sheetRef.current.closeForNavigation(() => navigate(destination));
      return;
    }
    close();
    navigate(destination);
  };

  const hasExtendedCapability = capabilityQuery.data === true;
  const capabilityReady = capabilityQuery.isSuccess;

  const actionList = (
    <div className="partner-quick-actions-content">
      <p className="partner-quick-actions-intro">
        {t('partnerQuickActions.intro')}
      </p>
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
        <button
          ref={firstActionRef}
          type="button"
          className="partner-quick-action"
          disabled={thinkingCoolingDown}
          aria-disabled={gesture.isPending || undefined}
          onClick={() => void submit('THINKING')}
        >
          <span className="partner-quick-action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20.3 4.7 13A4.8 4.8 0 0 1 11.5 6.2l.5.6.5-.6A4.8 4.8 0 0 1 19.3 13Z" />
            </svg>
          </span>
          <span className="partner-quick-action-copy">
            <strong>{t('partnerQuickActions.thinking')}</strong>
            <span>
              {thinkingCoolingDown
                ? t('partnerQuickActions.cooldown')
                : t('partnerQuickActions.thinkingHint')}
            </span>
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
              onClick={() =>
                hasExtendedCapability ? void submit('KISS') : navigateToPro()
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
                <span>
                  {hasExtendedCapability && kissCoolingDown
                    ? t('partnerQuickActions.cooldown')
                    : t('partnerQuickActions.kissHint')}
                </span>
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
              onClick={() =>
                hasExtendedCapability
                  ? void submit('CHECK_IN')
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
                <span>
                  {hasExtendedCapability && checkInCoolingDown
                    ? t('partnerQuickActions.cooldown')
                    : t('partnerQuickActions.checkInHint')}
                </span>
              </span>
              {!hasExtendedCapability ? (
                <ProMark label={t('partnerQuickActions.pro')} />
              ) : null}
            </button>
          </>
        )}
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
