import { useCallback, useEffect, useRef, useState } from 'react';
import { firstNameFromDisplayName } from '../client/personalName';
import { useTranslation } from 'react-i18next';
import './ThinkingOfYouButton.css';

const COOLDOWN_TICK_MS = 30_000;
/** Brief post-send confirmation before the persistent cooldown display takes over. */
const CONFIRMATION_MS = 2500;

export interface ThinkingOfYouButtonProps {
  partnerName?: string;
  onSend?: () => Promise<void> | void;
  variant?: 'compact' | 'full';
  disabled?: boolean;
  className?: string;
  /**
   * Server-authoritative instant this control becomes available again, or
   * `null`/`undefined` when available now. The caller owns this state (e.g.
   * from `Dashboard.thinkingOfYouAvailableAt`, reconciled after a successful
   * send) — the button itself never invents or persists cooldown timing.
   */
  cooldownUntil?: Date | null;
}

function remainingMinutes(cooldownUntil: Date, now: number): number {
  const remainingMs = cooldownUntil.getTime() - now;
  return Math.max(1, Math.ceil(remainingMs / 60_000));
}

export function ThinkingOfYouButton({
  partnerName,
  onSend,
  variant = 'full',
  disabled = false,
  className = '',
  cooldownUntil = null,
}: ThinkingOfYouButtonProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [now, setNow] = useState(() => Date.now());
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const scheduleIdleReset = useCallback((delayMs: number) => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      if (mountedRef.current) setState('idle');
    }, delayMs);
  }, []);

  const isCoolingDown = cooldownUntil != null && cooldownUntil.getTime() > now;

  // Keep the remaining-minutes display fresh, and let expiry restore the
  // normal action on its own without a page reload.
  useEffect(() => {
    if (!cooldownUntil) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), COOLDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const handleClick = useCallback(async () => {
    if (state !== 'idle' || disabled || isCoolingDown) return;
    setState('sending');
    try {
      if (onSend) {
        await onSend();
      }
      if (!mountedRef.current) return;
      setState('sent');
      scheduleIdleReset(CONFIRMATION_MS);
    } catch {
      if (!mountedRef.current) return;
      setState('error');
      scheduleIdleReset(4000);
    }
  }, [state, disabled, isCoolingDown, onSend, scheduleIdleReset]);

  const personalPartnerName = partnerName
    ? firstNameFromDisplayName(partnerName, '')
    : '';
  const targetLabel = personalPartnerName
    ? t('thinkingOfYouSendToPartner').replace(
        '{{partner}}',
        personalPartnerName,
      )
    : t('thinkingOfYouAction');

  const cooldownLabel =
    cooldownUntil && isCoolingDown
      ? t('thinkingOfYouCooldown').replace(
          '{{minutes}}',
          String(remainingMinutes(cooldownUntil, now)),
        )
      : '';

  const visualState =
    state === 'sending'
      ? 'sending'
      : state === 'sent'
        ? 'sent'
        : state === 'error'
          ? 'error'
          : isCoolingDown
            ? 'cooldown'
            : 'idle';

  const currentAccessibleName =
    visualState === 'sent'
      ? t('thinkingOfYouSent')
      : visualState === 'sending'
        ? t('thinkingOfYouSending')
        : visualState === 'error'
          ? t('thinkingOfYouError')
          : visualState === 'cooldown'
            ? cooldownLabel
            : targetLabel;

  const isDisabled = disabled || state === 'sending' || isCoolingDown;

  return (
    <button
      type="button"
      className={`thinking-of-you-btn thinking-of-you-${variant} state-${visualState} ${className}`}
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={state === 'sending' ? true : undefined}
      aria-label={currentAccessibleName}
      aria-live="polite"
      title={currentAccessibleName}
    >
      <span className="thinking-of-you-icon-wrapper" aria-hidden="true">
        {visualState === 'sent' ? (
          <svg
            aria-hidden="true"
            className="thinking-of-you-icon sent-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : visualState === 'error' ? (
          <svg
            aria-hidden="true"
            className="thinking-of-you-icon error-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="thinking-of-you-icon heart-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        )}
      </span>

      {variant === 'full' && (
        <span className="thinking-of-you-label" aria-hidden="true">
          {visualState === 'sent'
            ? t('thinkingOfYouSent')
            : visualState === 'sending'
              ? t('thinkingOfYouSending')
              : visualState === 'error'
                ? t('thinkingOfYouError')
                : visualState === 'cooldown'
                  ? cooldownLabel
                  : t('thinkingOfYouAction')}
        </span>
      )}
    </button>
  );
}
