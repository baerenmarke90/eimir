import './DiscoverKeepsakes.css';

/**
 * Momente > Erinnerungen keepsake visuals that a surrounding layout places
 * (currently the Fotostory slides): the milestone stamp and lined note paper.
 * They are decorative; the caller owns names, links and placement. Colours
 * come from semantic tokens (`--color-story-milestone`, `--color-story-paper`,
 * `--color-story-paper-line`); the stamp press collapses under reduced motion.
 */

/** Round milestone stamp: dashed outer ring, inner ring and star. */
export function KeepsakeStampMark({
  className,
  pressed = false,
}: {
  className?: string;
  /** Plays the one-time press animation when motion is allowed. */
  pressed?: boolean;
}) {
  return (
    <svg
      data-pressed={pressed || undefined}
      className={['momente-keepsake-stamp-mark', className]
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 104 104"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="momente-keepsake-stamp-fill" cx="52" cy="52" r="48" />
      <circle className="momente-keepsake-stamp-outer" cx="52" cy="52" r="48" />
      <circle className="momente-keepsake-stamp-inner" cx="52" cy="52" r="38" />
      <path
        className="momente-keepsake-stamp-star"
        transform="translate(34 33) scale(1.5)"
        d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z"
      />
    </svg>
  );
}

/** Class for a surface ruled like a note slip; set `--paper-line` to size it. */
export const KEEPSAKE_PAPER_CLASS = 'momente-keepsake-paper';
