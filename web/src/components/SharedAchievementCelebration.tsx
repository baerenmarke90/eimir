import type { ReactNode, Ref } from 'react';
import { EimirIcon } from './EimirIcon';
import { usePresentationPresence } from './useOverlayPresence';
import './SharedAchievementCelebration.css';

export function SharedAchievementCelebration({
  title,
  body,
  headingId,
  headingLevel = 2,
  headingRef,
  headingTabIndex,
  centered = false,
  action,
  visible = true,
}: {
  title: string;
  body: string;
  headingId?: string;
  headingLevel?: 2 | 3;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
  centered?: boolean;
  action?: ReactNode;
  visible?: boolean;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const { present, presenceState, completeExit } =
    usePresentationPresence(visible);

  if (!present) return null;

  return (
    <div
      className={`shared-achievement-confirmation${centered ? ' shared-achievement-confirmation-centered' : ''}`}
      data-presence={presenceState}
      role="status"
      aria-atomic="true"
      aria-hidden={presenceState === 'exiting' ? true : undefined}
      inert={presenceState === 'exiting' ? true : undefined}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget || presenceState !== 'exiting')
          return;
        completeExit();
      }}
    >
      <span className="shared-achievement-mark" aria-hidden="true">
        <EimirIcon name="check" />
      </span>
      <div className="shared-achievement-copy">
        <Heading id={headingId} ref={headingRef} tabIndex={headingTabIndex}>
          {title}
        </Heading>
        <p>{body}</p>
      </div>
      {action ? (
        <div className="shared-achievement-action">{action}</div>
      ) : null}
    </div>
  );
}
