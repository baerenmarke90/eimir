import { useEffect, useId } from 'react';
import { useLocation } from 'react-router-dom';
import { PRIVATE_NOTES_PATH } from '../client/privateArea';
import {
  type ProductTourTopic,
  productTourTopicKey,
  useProductTour,
} from '../client/productTour';
import {
  type AppRouteIcon,
  appRoutePath,
  PRODUCT_TOUR_ROUTE,
} from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { MoreDestinationRow } from './MoreOverviewPage';
import { PageHeader } from './PageHeader';
import { TaskOriginLink } from './TodayDestinationLink';
import '../client/productTour.css';

const topics: readonly {
  id: ProductTourTopic;
  path: string;
  icon: AppRouteIcon;
  titleKey: string;
}[] = [
  {
    id: 'today',
    path: appRoutePath('today'),
    icon: 'today',
    titleKey: 'navigation.today',
  },
  {
    id: 'story',
    path: `${appRoutePath('story')}?tab=discover`,
    icon: 'story',
    titleKey: 'navigation.story',
  },
  {
    id: 'plan',
    path: `${appRoutePath('plan')}#wishes`,
    icon: 'plan',
    titleKey: 'navigation.plan',
  },
  {
    id: 'private',
    path: PRIVATE_NOTES_PATH,
    icon: 'private',
    titleKey: 'more.private.title',
  },
];

export function ProductTourPage() {
  const { t } = useTranslation();
  const { hideOffer } = useProductTour();

  useEffect(() => hideOffer(true), [hideOffer]);

  return (
    <div className="page product-tour-page">
      <PageHeader
        title={t('productTour.replay')}
        description={t('productTour.description')}
      />
      <ul className="more-destinations" aria-label={t('productTour.topics')}>
        {topics.map((topic) => (
          <MoreDestinationRow
            key={topic.id}
            destination={{
              ...topic,
              selectedKey: productTourTopicKey(topic.id),
            }}
            subtitle={t(`productTour.${topic.id}.summary`)}
            showChevron
          />
        ))}
      </ul>
    </div>
  );
}

export function ProductTourOffer() {
  const { t } = useTranslation();
  const { offerVisible, hideOffer } = useProductTour();
  const headingId = useId();
  if (!offerVisible) return null;

  function dismiss(permanently: boolean) {
    hideOffer(permanently);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }

  return (
    <section className="product-tour-offer" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('productTour.replay')}</h2>
      <div className="product-tour-offer-actions">
        <TaskOriginLink
          to={PRODUCT_TOUR_ROUTE}
          className="button-link secondary-link"
        >
          {t('productTour.start')}
        </TaskOriginLink>
        <button
          className="button tertiary"
          type="button"
          onClick={() => dismiss(false)}
        >
          {t('productTour.later')}
        </button>
        <button
          className="button tertiary"
          type="button"
          onClick={() => dismiss(true)}
        >
          {t('productTour.dismiss')}
        </button>
      </div>
    </section>
  );
}

export function ProductTourCue({
  topic,
  message,
}: {
  topic: ProductTourTopic;
  message?: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { resolveOrigin, requestReturn } = useTaskOrigin();
  const { arrivalKey } = useProductTour();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const origin = resolveOrigin(originKey);
  if (
    origin?.to !== PRODUCT_TOUR_ROUTE ||
    origin.selectedKey !== productTourTopicKey(topic)
  ) {
    return null;
  }

  return (
    <aside
      className="product-tour-cue"
      aria-label={t('productTour.replay')}
      data-tour-arrival={arrivalKey === location.key ? 'true' : undefined}
    >
      <p>{message ?? t(`productTour.${topic}.hint`)}</p>
      {topic !== 'private' ? (
        <button
          type="button"
          className="button tertiary"
          onClick={() => requestReturn(originKey, PRODUCT_TOUR_ROUTE)}
        >
          {t('productTour.back')}
        </button>
      ) : null}
    </aside>
  );
}
