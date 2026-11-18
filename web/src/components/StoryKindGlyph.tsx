import type { LifelineKind } from '../client/storyLifeline';
import './StoryKindGlyph.css';

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const STAR_PATH =
  'M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z';

/**
 * The shape of a shared Story kind, in the language of the timeline markers
 * (#969): a filled circle for a Memory, a heart for a Heart Moment and a star
 * for a Milestone. The shape carries the meaning, so it survives forced
 * colours; the kind colour only reinforces it.
 */
export function StoryKindGlyph({
  kind,
  className,
}: {
  kind: LifelineKind;
  className?: string;
}) {
  return (
    <svg
      className={`story-kind-glyph story-kind-${kind}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'memories' ? (
        <circle cx="12" cy="12" r="9" />
      ) : (
        <path d={kind === 'heartMoments' ? HEART_PATH : STAR_PATH} />
      )}
    </svg>
  );
}
