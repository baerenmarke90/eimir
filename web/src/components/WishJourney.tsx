import type { ReactNode } from 'react';
import {
  WISH_JOURNEY_STAGES,
  type WishJourneyStage,
  wishJourneyIndex,
} from '../client/wishJourney';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './WishJourney.css';

/**
 * #1790 F2: the quiet four-step path of a wish (wished, planned, experienced,
 * remembered). It replaces a bare status word; it is never a progress bar and
 * never accepts input. `advancing` animates the arrival at the current step.
 */
export function WishJourneyPath({
  stage,
  tone = 'brand',
  advancing = false,
  className,
}: {
  stage: WishJourneyStage;
  tone?: 'brand' | 'warm';
  advancing?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const current = wishJourneyIndex(stage);
  return (
    <div className={`wish-journey${className ? ` ${className}` : ''}`}>
      <ol
        className={`wish-journey-path wish-journey-tone-${tone}`}
        aria-label={t('wishJourney.pathLabel')}
        data-advancing={advancing || undefined}
      >
        {WISH_JOURNEY_STAGES.map((step, index) => (
          <li
            key={step}
            className={`wish-journey-step${index <= current ? ' is-reached' : ''}${index === current ? ' is-current' : ''}`}
            aria-current={index === current ? 'step' : undefined}
          >
            <span className="wish-journey-dot" aria-hidden="true" />
            <span className="wish-journey-label">
              {t(`wishJourney.stages.${step}`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The small warm "from a wish" line; the sparkle is the shared icon. */
export function WishOriginMark({
  children,
  trailing = false,
}: {
  children: ReactNode;
  trailing?: boolean;
}) {
  return (
    <span className="wish-origin-mark">
      <EimirIcon name="sparkle" />
      <span>{children}</span>
      {trailing ? <EimirIcon name="chevron-right" /> : null}
    </span>
  );
}
