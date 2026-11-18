import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EimirIcon } from './EimirIcon';
import { TaskOriginLink } from './TodayDestinationLink';
import './QuietHint.css';

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
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const timer = window.setTimeout(onDismiss, reduced ? 0 : 240);
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
      aria-label={t(
        tone === 'new' ? 'quietHints.newLabel' : 'quietHints.tipLabel',
      )}
    >
      <div className="quiet-hint-body">
        <EimirIcon
          name={tone === 'new' ? 'sparkle' : 'hilfe'}
          className="quiet-hint-icon"
        />
        <div className="quiet-hint-copy">
          {tone === 'new' ? (
            <span className="quiet-hint-tag">{t('quietHints.newTag')}</span>
          ) : null}
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
