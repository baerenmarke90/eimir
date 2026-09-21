import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { MEMORY_CREATE_ROUTE, MILESTONE_CREATE_ROUTE } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import './PlanStoryContinuation.css';

/**
 * A confirmed Plan result with optional canonical Story continuations.
 * Completion already belongs to PlanProductPage; neither destination can roll
 * it back or make its success ambiguous.
 */
export function PlanStoryContinuation({
  apis: _apis,
  spaceId: _spaceId,
  plan,
  focusOnMount = false,
  sharedAchievementEnabled = false,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  plan: PlanDetail;
  focusOnMount?: boolean;
  sharedAchievementEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!focusOnMount) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: 'center' });
  }, [focusOnMount]);

  function openCanonicalCapture(to: string) {
    const taskOriginKey = captureOrigin({
      planningSegment: 'plans',
      selectedKey: plan.id,
    });
    void navigate(to, {
      state: taskOriginKey ? { taskOriginKey } : undefined,
    });
  }

  function dismissContinuation() {
    const focusTarget = headingRef.current
      ?.closest('.planning-page')
      ?.querySelector<HTMLButtonElement | HTMLAnchorElement>('.back-link');
    focusTarget?.focus();
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <section
      className="plan-completed-celebration plan-story-continuation eimir-motion-reveal"
      aria-labelledby="plan-completed-heading"
    >
      {sharedAchievementEnabled ? (
        <div
          className="shared-achievement-confirmation"
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
            <h2
              id="plan-completed-heading"
              ref={headingRef}
              tabIndex={focusOnMount ? -1 : undefined}
            >
              {t('m5s3.plan.sharedAchievementTitle')}
            </h2>
            <p>{t('m5s3.plan.sharedAchievementBody', { title: plan.title })}</p>
          </div>
        </div>
      ) : (
        <h2
          id="plan-completed-heading"
          ref={headingRef}
          tabIndex={focusOnMount ? -1 : undefined}
        >
          {t('m5s3.plan.completedTitle')}
        </h2>
      )}
      <p className="plan-completed-intro">{t('m5s3.planStory.intro')}</p>
      <div className="plan-story-actions">
        <button
          type="button"
          onClick={() => openCanonicalCapture(MEMORY_CREATE_ROUTE)}
        >
          {t('m5s3.planStory.memoryAction')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => openCanonicalCapture(MILESTONE_CREATE_ROUTE)}
        >
          {t('m5s3.planStory.milestoneAction')}
        </button>
        <button
          type="button"
          className="tertiary"
          onClick={dismissContinuation}
        >
          {t('m5s3.planStory.later')}
        </button>
      </div>
    </section>
  );
}
