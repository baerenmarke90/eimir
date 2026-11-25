import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import { MemoryPreview } from '../MemoryPreview';
import type { LoadMemoryImage, MemoryWorldEntry } from './model';
import '../HeartEmotionVisual.css';
import '../../motion/story-playback.css';
import './MemoryWorld.css';

/** The cover photo of an entry; sensitive covers stay covered (no reveal here). */
export function MemoryPhoto({
  entry,
  loadMemoryImage,
  develop,
}: {
  entry: MemoryWorldEntry;
  loadMemoryImage: LoadMemoryImage;
  /** Plays the instant-film develop once the photo arrives. */
  develop?: boolean;
}) {
  if (!entry.cover) return null;
  return (
    <div
      className={
        develop
          ? 'memory-world-photo memory-world-develop'
          : 'memory-world-photo'
      }
    >
      <MemoryPreview
        memoryId={entry.memoryId}
        attachmentId={entry.cover.id}
        hasThumbnail={entry.cover.hasThumbnail}
        isSensitive={entry.cover.isSensitive}
        loadImage={loadMemoryImage}
        loadingMode="immediate"
      />
    </div>
  );
}

const HEART_PATH =
  'M12 21C5 15.5 2 12 2 8A5 5 0 0 1 12 6A5 5 0 0 1 22 8C22 12 19 15.5 12 21Z';

/**
 * An entry as a physical keepsake: a print with its caption, a heart moment
 * card coloured by its feeling, a milestone stamp card or a note slip.
 * Decorative structure only; the caller owns the link and its name.
 */
export function Keepsake({
  entry,
  loadMemoryImage,
  develop,
  kicker,
  size = 'large',
}: {
  entry: MemoryWorldEntry;
  loadMemoryImage: LoadMemoryImage;
  develop?: boolean;
  kicker?: string;
  size?: 'large' | 'small';
}) {
  const date = <time dateTime={entry.dateTime}>{entry.dateLabel}</time>;
  const kickerLine = kicker ? (
    <span className="memory-world-kicker">{kicker}</span>
  ) : null;
  switch (entry.kind) {
    case 'photo':
      return (
        <div className="memory-world-print" data-size={size}>
          <span className="memory-world-tape" aria-hidden="true" />
          <MemoryPhoto
            entry={entry}
            loadMemoryImage={loadMemoryImage}
            develop={develop}
          />
          {size === 'large' ? (
            <div className="memory-world-caption">
              {kickerLine}
              <strong>{entry.title}</strong>
              <span>{date}</span>
            </div>
          ) : null}
        </div>
      );
    case 'heart':
      return (
        <div
          className="memory-world-heart-card"
          data-size={size}
          data-heart-emotion={entry.emotion}
        >
          {kickerLine}
          <svg
            className="memory-world-heart-card-glyph"
            viewBox="0 0 24 22"
            aria-hidden="true"
            focusable="false"
          >
            <path d={HEART_PATH} />
          </svg>
          <q>{entry.title}</q>
          <span className="memory-world-heart-card-from">{entry.author}</span>
          {size === 'large' ? (
            <span className="memory-world-date">{date}</span>
          ) : null}
        </div>
      );
    case 'milestone':
      return (
        <div className="memory-world-stamp-card" data-size={size}>
          {kickerLine}
          <KeepsakeStampMark className="memory-world-stamp" pressed={develop} />
          <strong>{entry.title}</strong>
          {size === 'large' ? (
            <span className="memory-world-date">{date}</span>
          ) : null}
        </div>
      );
    case 'words':
      return (
        <div className="memory-world-slip" data-size={size}>
          {kickerLine}
          <strong>{entry.title}</strong>
          {size === 'large' ? (
            <span className="memory-world-date">{date}</span>
          ) : null}
        </div>
      );
  }
}
