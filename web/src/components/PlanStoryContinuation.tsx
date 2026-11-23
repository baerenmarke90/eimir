import { useEffect, useRef, useState } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { usePlanStoryCapture } from '../client/planStoryCapture';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { SharedAchievementCelebration } from './SharedAchievementCelebration';
import { WishJourneyPath } from './WishJourney';
import './PlanStoryContinuation.css';

/**
 * A confirmed Plan result with optional canonical Story continuations.
 * Completion already belongs to PlanProductPage; neither destination can roll
 * it back or make its success ambiguous.
 */
export function PlanStoryContinuation({
  apis: _apis,
  spaceId,
  accountId,
  apiBaseUrl,
  plan,
  focusOnMount = false,
  sharedAchievementEnabled = false,
  justCompleted = true,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  accountId?: string;
  apiBaseUrl?: string;
  plan: PlanDetail;
  focusOnMount?: boolean;
  sharedAchievementEnabled?: boolean;
  justCompleted?: boolean;
}) {
  const { t } = useTranslation();
  const openCanonicalCapture = usePlanStoryCapture({
    planId: plan.id,
    spaceId,
    accountId,
    apiBaseUrl,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!focusOnMount) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: 'center' });
  }, [focusOnMount]);

  function dismissContinuation() {
    const surface =
      headingRef.current?.closest('.product-main') ??
      headingRef.current?.closest('.planning-page');
    const focusTarget = surface?.querySelector<
      HTMLButtonElement | HTMLAnchorElement
    >('.back-link');
    focusTarget?.focus();
    setDismissed(true);
  }

  if (dismissed) return null;
  // #1790 F2: a Plan from a wish closes with the wish fulfilment moment.
  const wishFulfilled = justCompleted && Boolean(plan.sourceWishId);

  return (
    <section
      className={`${justCompleted ? 'plan-completed-celebration' : 'plan-story-saved'} plan-story-continuation${wishFulfilled ? ' plan-wish-fulfilled' : ''}`}
      aria-labelledby="plan-completed-heading"
    >
      {wishFulfilled ? (
        <>
          <h2
            id="plan-completed-heading"
            ref={headingRef}
            tabIndex={focusOnMount ? -1 : undefined}
            className="plan-wish-fulfilled-heading"
          >
            {t('wishJourney.fulfilledTitle')}
            <EimirIcon name="sparkle" />
          </h2>
          <p>{t('wishJourney.fulfilledBody', { title: plan.title })}</p>
          <WishJourneyPath stage="experienced" tone="warm" advancing />
        </>
      ) : sharedAchievementEnabled ? (
        <SharedAchievementCelebration
          title={t('m5s3.plan.sharedAchievementTitle')}
          body={t('m5s3.plan.sharedAchievementBody', { title: plan.title })}
          headingId="plan-completed-heading"
          headingRef={headingRef}
          headingTabIndex={focusOnMount ? -1 : undefined}
        />
      ) : (
        <h2
          id="plan-completed-heading"
          ref={headingRef}
          tabIndex={focusOnMount ? -1 : undefined}
        >
          {t(
            justCompleted
              ? 'm5s3.plan.completedTitle'
              : 'm5s3.planStory.readHeading',
          )}
        </h2>
      )}
      {justCompleted && !wishFulfilled ? (
        <>
          <p>{t('m5s3.plan.completedBody')}</p>
          <p className="plan-completed-intro">{t('m5s3.planStory.intro')}</p>
        </>
      ) : null}
      <div className="plan-story-actions">
        <button type="button" onClick={() => openCanonicalCapture('memory')}>
          {t('m5s3.planStory.memoryAction')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => openCanonicalCapture('heartMoment')}
        >
          {t('m5s3.planStory.heartMomentAction')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => openCanonicalCapture('milestone')}
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
