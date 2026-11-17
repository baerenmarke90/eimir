import { type MouseEvent, type ReactNode, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import {
  HeartEmotionBadge,
  type HeartEmotionValue,
} from './HeartEmotionVisual';
import './DiscoverKeepsakes.css';

/**
 * Momente > Erinnerungen keepsakes: one visual per rediscovered entry kind
 * (photo print, Heart Moment envelope, milestone stamp, note slip).
 *
 * Each renderer is self-contained and owns only its own box: it does not
 * assume a grid, column count or position. A surrounding layout passes the
 * deterministic `tilt` (see `keepsakeTilt`) and decides placement. Colours
 * come from semantic tokens (`--color-story-paper`, `--color-story-tape`,
 * emotion surfaces); motion is disabled under reduced motion.
 */

type OpenHandler = (event: MouseEvent<HTMLAnchorElement>, to: string) => void;

interface KeepsakeBase {
  /** Detail route of the entry. */
  to: string;
  /** Localized kind, e.g. "Erinnerung"; part of the accessible name. */
  kindLabel: string;
  /** ISO calendar date for `<time dateTime>`. */
  dateTime: string;
  /** Localized, formatted date. */
  dateLabel: string;
  /** Rotation in degrees; use `keepsakeTilt(position)` for a stable value. */
  tilt?: number;
  /** Optional navigation hook, e.g. to capture the task origin. */
  onOpen?: OpenHandler;
  className?: string;
}

const TILTS = [-1.4, 1.8, -2.2, 1.2, -0.8, 2, -1.6, 1.4, -2.4, 1] as const;

/** Deterministic alternating rotation for the n-th keepsake (−2.4°…+2°). */
export function keepsakeTilt(position: number): number {
  const index = Math.abs(Math.trunc(position)) % TILTS.length;
  return TILTS[index];
}

function tiltStyle(tilt: number | undefined) {
  return { '--keepsake-tilt': `${tilt ?? 0}deg` } as Record<string, string>;
}

function classes(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(' ');
}

function useItemName(
  kindLabel: string,
  title: string,
  dateLabel: string,
): string {
  const { t } = useTranslation();
  return t('discoverKeepsakes.itemName', {
    kind: kindLabel,
    title,
    date: dateLabel,
  });
}

/** Memory with a photo: paper print with tape, caption title and date. */
export function KeepsakePrint({
  to,
  kindLabel,
  title,
  dateTime,
  dateLabel,
  tilt,
  onOpen,
  className,
  media,
  mediaShape,
}: KeepsakeBase & {
  title: string;
  /** The authorized photo, e.g. a `MemoryPreview`; the caller owns loading. */
  media: ReactNode;
  mediaShape?: 'landscape' | 'portrait' | 'square' | 'wide';
}) {
  const name = useItemName(kindLabel, title, dateLabel);
  return (
    <Link
      to={to}
      className={classes(
        'momente-keepsake',
        'momente-keepsake-print',
        className,
      )}
      data-keepsake="print"
      data-keepsake-shape={mediaShape}
      style={tiltStyle(tilt)}
      aria-label={name}
      onClick={onOpen ? (event) => onOpen(event, to) : undefined}
    >
      <span className="momente-keepsake-tape" aria-hidden="true" />
      <span className="momente-keepsake-print-photo">{media}</span>
      <span className="momente-keepsake-caption">
        <span className="momente-keepsake-title">{title}</span>
        <time className="momente-keepsake-date" dateTime={dateTime}>
          {dateLabel}
        </time>
      </span>
    </Link>
  );
}

/** Text-only memory: lined note slip with a torn bottom edge. */
export function KeepsakeNoteSlip({
  to,
  kindLabel,
  title,
  excerpt,
  dateTime,
  dateLabel,
  tilt,
  onOpen,
  className,
}: KeepsakeBase & { title: string; excerpt?: string }) {
  const name = useItemName(kindLabel, title, dateLabel);
  return (
    <Link
      to={to}
      className={classes(
        'momente-keepsake',
        'momente-keepsake-slip',
        className,
      )}
      data-keepsake="slip"
      style={tiltStyle(tilt)}
      aria-label={name}
      onClick={onOpen ? (event) => onOpen(event, to) : undefined}
    >
      <span className="momente-keepsake-title">{title}</span>
      {excerpt ? (
        <span className="momente-keepsake-excerpt">{excerpt}</span>
      ) : null}
      <time className="momente-keepsake-date" dateTime={dateTime}>
        {dateLabel}
      </time>
    </Link>
  );
}

/** Milestone: round stamp (dashed ring, inner ring, star), pressed on entry. */
export function KeepsakeStamp({
  to,
  kindLabel,
  title,
  dateTime,
  dateLabel,
  tilt,
  onOpen,
  className,
}: KeepsakeBase & { title: string }) {
  const name = useItemName(kindLabel, title, dateLabel);
  return (
    <Link
      to={to}
      className={classes(
        'momente-keepsake',
        'momente-keepsake-stamp',
        className,
      )}
      data-keepsake="stamp"
      style={tiltStyle(tilt)}
      aria-label={name}
      onClick={onOpen ? (event) => onOpen(event, to) : undefined}
    >
      <svg
        className="momente-keepsake-stamp-mark"
        viewBox="0 0 104 104"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="momente-keepsake-stamp-fill"
          cx="52"
          cy="52"
          r="48"
        />
        <circle
          className="momente-keepsake-stamp-outer"
          cx="52"
          cy="52"
          r="48"
        />
        <circle
          className="momente-keepsake-stamp-inner"
          cx="52"
          cy="52"
          r="38"
        />
        <path
          className="momente-keepsake-stamp-star"
          transform="translate(34 33) scale(1.5)"
          d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z"
        />
      </svg>
      <span className="momente-keepsake-title">{title}</span>
      <time className="momente-keepsake-date" dateTime={dateTime}>
        {dateLabel}
      </time>
    </Link>
  );
}

/**
 * Heart Moment: envelope in its emotion colour with a heart seal. The first
 * activation opens it (an `aria-expanded` disclosure); the letter then shows
 * the text and a separate, visible link to the full Heart Moment.
 */
export function KeepsakeEnvelope({
  to,
  kindLabel,
  authorName,
  emotion,
  text,
  dateTime,
  dateLabel,
  tilt,
  onOpen,
  className,
  defaultOpen = false,
}: KeepsakeBase & {
  authorName: string;
  emotion?: HeartEmotionValue;
  text: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const letterId = useId();
  const emotionLabel = emotion ? t(`heartEmotion.${emotion}`) : '';
  const name = t('discoverKeepsakes.envelopeName', {
    kind: kindLabel,
    name: authorName,
    emotion: emotionLabel,
    date: dateLabel,
  });
  return (
    <div
      className={classes(
        'momente-keepsake',
        'momente-keepsake-envelope',
        className,
      )}
      data-keepsake="envelope"
      data-heart-emotion={emotion}
      data-open={open ? 'true' : 'false'}
      style={tiltStyle(tilt)}
    >
      <button
        type="button"
        className="momente-keepsake-envelope-toggle"
        aria-expanded={open}
        aria-controls={letterId}
        aria-label={name}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="momente-keepsake-envelope-flap" aria-hidden="true" />
        <span className="momente-keepsake-envelope-seal" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </span>
        <span className="momente-keepsake-envelope-front">
          <span className="momente-keepsake-envelope-from">
            {t('discoverKeepsakes.from', { name: authorName })}
          </span>
          {emotion ? <HeartEmotionBadge emotion={emotion} /> : null}
          <time className="momente-keepsake-date" dateTime={dateTime}>
            {dateLabel}
          </time>
        </span>
      </button>
      <div
        id={letterId}
        className="momente-keepsake-envelope-letter"
        hidden={!open}
      >
        <blockquote className="momente-keepsake-envelope-text">
          {text}
        </blockquote>
        <Link
          to={to}
          className="momente-keepsake-envelope-link"
          onClick={onOpen ? (event) => onOpen(event, to) : undefined}
        >
          {t('discoverKeepsakes.openInFull')}
        </Link>
      </div>
    </div>
  );
}
