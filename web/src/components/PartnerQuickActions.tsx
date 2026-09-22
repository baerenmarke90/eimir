import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type ReactNode,
  type RefObject,
  useId,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { SupportGestureKind } from '../api/generated/models/SupportGestureKind';
import type { DashboardView } from '../api/generated/models/DashboardView';
import { dashboardQueryKey } from '../client/dashboardQueries';
import {
  loadPartnerQuickActionsCapability,
  PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED,
  partnerQuickActionsEntitlementQueryKey,
} from '../client/partnerQuickActions';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { MORE_PROFILE_ROUTE } from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import { useMediaQuery } from '../client/useMediaQuery';
import type { M4ProductApis } from '../client/m4Product';
import { useTranslation } from '../i18n';
import type { CouplePresenceAvatarAction } from './CouplePresence';
import { ProMark } from './ProMark';
import {
  ShortTaskSheet,
  type ShortTaskSheetHandle,
} from './ShortTaskSheet';
import './PartnerQuickActions.css';

const THINKING_OF_YOU_COOLDOWN_CODE = 'THINKING_OF_YOU_COOLDOWN';
const SUPPORT_GESTURE_COOLDOWN_CODE = 'SUPPORT_GESTURE_COOLDOWN';
const SPACE_MODULE_DISABLED_CODE = 'SPACE_MODULE_DISABLED';
const EXPANDED_QUERY = '(min-width: 840px)';

type PartnerAction = 'THINKING' | 'KISS' | 'CHECK_IN';

type ActionResult =
  | {
      action: 'THINKING';
      availableAt: Date;
    }
  | {
      action: 'KISS' | 'CHECK_IN';
      availableAt: Date;
    };

interface FeedbackState {
  tone: 'success' | 'error';
  text: string;
}

async function normalizeCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
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
  const queryClient = useQueryClient();
  const isExpanded = useMediaQuery(EXPANDED_QUERY);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  const inFlightRef = useRef(false);
  const titleId = useId();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [localThinkingCooldown, setLocalThinkingCooldown] =
    useState<Date | null>(null);
  const [extendedCooldowns, setExtendedCooldowns] = useState<
    Partial<Record<'KISS' | 'CHECK_IN', Date>>
  >({});

  const { isOpen, close, toggle, triggerRef, panelRef } =
    useDismissiblePopover({
      restoreFocusOnEscape: isExpanded,
      dismissOnOutsidePointerDown: isExpanded,
      dismissOnEscape: isExpanded,
    });

  const capabilityQuery = useQuery({
    queryKey: partnerQuickActionsEntitlementQueryKey(accountId, spaceId),
    queryFn: ({ signal }) => {
      if (!entitlementApi) {
        throw new ClientProblemError('server', undefined, 'ENTITLEMENT_API_UNAVAILABLE');
      }
      return loadPartnerQuickActionsCapability(entitlementApi, spaceId, signal);
    },
    enabled: isOpen,
    retry: false,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (action: PartnerAction): Promise<ActionResult> => {
      if (action === 'THINKING') {
        const accepted = await normalizeCall(() =>
          apis.notifications.sendThinkingOfYou({
            spaceId,
            thinkingOfYouCreate: { clientRequestId: crypto.randomUUID() },
          }),
        );
        return {
          action,
          availableAt: accepted.thinkingOfYouAvailableAt,
        };
      }

      const accepted = await normalizeCall(() =>
        apis.notifications.sendPartnerQuickAction({
          spaceId,
          partnerQuickActionCreate: {
            kind:
              action === 'KISS'
                ? SupportGestureKind.KISS
                : SupportGestureKind.CHECK_IN,
            clientRequestId: crypto.randomUUID(),
          },
        }),
      );
      return { action, availableAt: accepted.availableAt };
    },
    onSuccess: (result) => {
      if (result.action === 'THINKING') {
        setLocalThinkingCooldown(result.availableAt);
        queryClient.setQueryData<DashboardView>(
          dashboardQueryKey(spaceId),
          (old) =>
            old
              ? {
                  ...old,
                  thinkingOfYouAvailableAt: result.availableAt,
                }
              : old,
        );
        setFeedback({
          tone: 'success',
          text: t('partnerQuickActions.sentThinking'),
        });
        postSnackbar('snackbar.partnerQuickActionThinkingSent');
        return;
      }

      setExtendedCooldowns((current) => ({
        ...current,
        [result.action]: result.availableAt,
      }));
      if (result.action === 'KISS') {
        setFeedback({
          tone: 'success',
          text: t('partnerQuickActions.sentKiss'),
        });
        postSnackbar('snackbar.partnerQuickActionKissSent');
      } else {
        setFeedback({
          tone: 'success',
          text: t('partnerQuickActions.sentCheckIn'),
        });
        postSnackbar('snackbar.partnerQuickActionCheckInSent');
      }
    },
    onError: (error) => {
      if (
        error instanceof ClientProblemError &&
        error.code === SPACE_MODULE_DISABLED_CODE
      ) {
        postSnackbar('snackbar.supportGesturesModuleDisabled');
        void refreshSpaceConfiguration(queryClient, accountId, spaceId);
        close();
        return;
      }

      if (
        error instanceof ClientProblemError &&
        (error.code === THINKING_OF_YOU_COOLDOWN_CODE ||
          error.code === SUPPORT_GESTURE_COOLDOWN_CODE)
      ) {
        setFeedback({
          tone: 'error',
          text: t('partnerQuickActions.cooldown'),
        });
        postSnackbar('snackbar.partnerQuickActionCooldown');
        return;
      }

      if (
        error instanceof ClientProblemError &&
        error.code === PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED
      ) {
        void queryClient.invalidateQueries({
          queryKey: partnerQuickActionsEntitlementQueryKey(accountId, spaceId),
        });
        setFeedback({
          tone: 'error',
          text: t('partnerQuickActions.premiumHint'),
        });
        return;
      }

      setFeedback({
        tone: 'error',
        text: t('partnerQuickActions.sendError'),
      });
    },
  });

  const resolvedThinkingCooldown =
    localThinkingCooldown ?? thinkingOfYouAvailableAt;
  const thinkingCoolingDown = Boolean(
    resolvedThinkingCooldown &&
      resolvedThinkingCooldown.getTime() > Date.now(),
  );
  const kissCoolingDown = Boolean(
    extendedCooldowns.KISS &&
      extendedCooldowns.KISS.getTime() > Date.now(),
  );
  const checkInCoolingDown = Boolean(
    extendedCooldowns.CHECK_IN &&
      extendedCooldowns.CHECK_IN.getTime() > Date.now(),
  );

  const submit = async (action: PartnerAction) => {
    if (inFlightRef.current || mutation.isPending) return;
    inFlightRef.current = true;
    setFeedback(null);
    try {
      await mutation.mutateAsync(action);
    } catch {
      // Mutation callbacks own all user-visible error semantics.
    } finally {
      inFlightRef.current = false;
    }
  };

  const navigateToPro = () => {
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
      <div className="partner-quick-actions-list">
        <button
          ref={firstActionRef}
          type="button"
          className="partner-quick-action"
          disabled={mutation.isPending || thinkingCoolingDown}
          onClick={() => void submit('THINKING')}
        >
          <span className="partner-quick-action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
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
              disabled={
                mutation.isPending || (hasExtendedCapability && kissCoolingDown)
              }
              onClick={() =>
                hasExtendedCapability
                  ? void submit('KISS')
                  : navigateToPro()
              }
            >
              <span className="partner-quick-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
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
              disabled={
                mutation.isPending ||
                (hasExtendedCapability && checkInCoolingDown)
              }
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
          className={`partner-quick-actions-feedback is-${feedback.tone}`}
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

  const surfaceId = isExpanded
    ? 'partner-quick-actions-popover'
    : 'partner-quick-actions-sheet';

  const avatarAction: CouplePresenceAvatarAction = {
    onActivate: () => {
      setFeedback(null);
      toggle();
    },
    label: t('partnerQuickActions.trigger', { partner: partnerName }),
    ref: triggerRef as RefObject<HTMLButtonElement>,
    expanded: isOpen,
    controls: surfaceId,
    hasPopup: 'dialog',
  };

  const expandedPopover =
    isExpanded && isOpen ? (
      <section
        ref={panelRef as RefObject<HTMLElement>}
        id={surfaceId}
        className="partner-quick-actions-popover"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
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
        open={isOpen && !isExpanded}
        title={t('partnerQuickActions.title', { partner: partnerName })}
        onClose={() => close()}
        initialFocusRef={firstActionRef}
        restoreFocusRef={triggerRef}
        className="partner-quick-actions-sheet"
      >
        {actionList}
      </ShortTaskSheet>
    </>
  );
}
