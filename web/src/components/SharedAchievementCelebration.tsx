import type { ReactNode, Ref } from 'react';
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
}: {
  title: string;
  body: string;
  headingId?: string;
  headingLevel?: 2 | 3;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
  centered?: boolean;
  action?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <div
      className={`shared-achievement-confirmation${centered ? ' shared-achievement-confirmation-centered' : ''}`}
      role="status"
      aria-atomic="true"
    >
      <span className="shared-achievement-mark" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12 4 4L19 6" />
        </svg>
      </span>
      <div className="shared-achievement-copy">
        <Heading id={headingId} ref={headingRef} tabIndex={headingTabIndex}>
          {title}
        </Heading>
        <p>{body}</p>
      </div>
      {action ? <div className="shared-achievement-action">{action}</div> : null}
    </div>
  );
}
