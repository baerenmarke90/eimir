import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { TaskOriginLink } from './TodayDestinationLink';
import './QuietHint.css';
import '../motion/motion.css';
import { attentionScheduler } from '../motion/attention';
import { durationMs } from '../motion/tokens';
import { isVisibleNow } from '../motion/visibility';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Leave the dismissed hint for the next control instead of the page body. */
function focusAfter(element: HTMLElement) {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE));
  const next = all.find(
    (candidate) =>
      !element.contains(candidate) &&
      element.compareDocumentPosition(candidate) &
        Node.DOCUMENT_POSITION_FOLLOWING,
  );
  next?.focus({ preventScroll: true });
}

/**
 * One quiet, dismissible hint at the place it explains (#1907 I1).
 * `tone="new"` marks a "New in eimir." note. Nothing here blocks the page.
 */
export function QuietHint({
  tone = 'tip',
  children,
  action,
  dismissLabel,
  icon,
  onDismiss,
}: {
  tone?: 'tip' | 'new';
  children: ReactNode;
  /** A link to the place it explains, or an in-place button. */
  action?:
    | { to: string; label: string; selectedKey?: string }
    | { onClick: () => void; label: string; disabled?: boolean };
  /** Replaces the default "Verstanden"/"Ausblenden" wording. */
  dismissLabel?: string;
  /** Replaces the tone's default icon when the hint has its own subject. */
  icon?: EimirIconName;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const [leaving, setLeaving] = useState(false);
  // Attention priority 4 (Motion Contract 4.9): the hint rises in only when
  // nothing more important moves, at most once per interval; otherwise it is
  // simply there. The attribute goes once it arrived, so a kept tab that is
  // shown again does not replay it (M4).
  const [arriving, setArriving] = useState(false);
  const arrival = useRef<{ release(): void } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || durationMs('transition') <= 0) return;
    const ticket = attentionScheduler().request('hint', {
      visible: isVisibleNow(element).visible,
      onPreempt: () => setArriving(false),
    });
    if (!ticket) return;
    arrival.current = ticket;
    setArriving(true);
    const deadline = window.setTimeout(
      () => setArriving(false),
      durationMs('context'),
    );
    return () => {
      window.clearTimeout(deadline);
      ticket.release();
      arrival.current = null;
    };
  }, []);

  useEffect(() => {
    if (arriving) return;
    arrival.current?.release();
    arrival.current = null;
  }, [arriving]);

  useEffect(() => {
    if (!leaving) return;
    // The fold-away is a `--duration-transition` transition; the hint leaves
    // once it has closed (at once with reduced motion).
    const timer = window.setTimeout(onDismiss, durationMs('context'));
    return () => window.clearTimeout(timer);
  }, [leaving, onDismiss]);

  function dismiss() {
    if (ref.current) focusAfter(ref.current);
    setLeaving(true);
  }

  return (
    <aside
      ref={ref}
      className="quiet-hint"
      data-tone={tone}
      data-leaving={leaving || undefined}
      data-arriving={arriving || undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setArriving(false);
      }}
      aria-label={t(
        tone === 'new' ? 'quietHints.newLabel' : 'quietHints.tipLabel',
      )}
    >
      <div className="quiet-hint-body">
        <EimirIcon
          name={icon ?? (tone === 'new' ? 'sparkle' : 'hilfe')}
          className="quiet-hint-icon"
        />
        <div className="quiet-hint-copy">
          <p>{children}</p>
          <div className="quiet-hint-actions">
            {action && 'onClick' in action ? (
              <button
                type="button"
                className="quiet-hint-action"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ) : action ? (
              <TaskOriginLink
                to={action.to}
                selectedKey={action.selectedKey}
                className="quiet-hint-action"
                onFollow={onDismiss}
              >
                {action.label}
              </TaskOriginLink>
            ) : null}
            <button
              type="button"
              className="quiet-hint-dismiss"
              onClick={dismiss}
            >
              {dismissLabel ??
                t(tone === 'new' ? 'quietHints.hide' : 'quietHints.gotIt')}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
