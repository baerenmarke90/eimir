import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  type BillingChannel,
  type ProPlanId,
  type ProPurchaseOutcome,
  REFERENCE_PRO_PLANS,
  unlocksFeature,
  yearlySavingPercent,
} from '../client/proBilling';
import { useSessionSpaceEntitlement } from '../client/proPresentation';
import {
  LEGAL_PRIVACY_ROUTE,
  MEMORY_MAP_ROUTE,
  MORE_SETTINGS_ROUTE,
  type ProPaywallContext,
  proPaywallContext,
  STORY_RECAPS_ROUTE,
} from '../client/routes';
import { spaceEntitlementQueryKey } from '../client/spaceEntitlement';
import { useBillingChannel } from '../client/storeBilling';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ProFeatureCatalogue } from './ProFeatureCatalogue';
import { TaskBackButton } from './TaskBackButton';
import './ProPaywall.css';

const CONTEXT_ICONS: Record<
  Exclude<ProPaywallContext, 'general'>,
  readonly [EimirIconName, EimirIconName, EimirIconName]
> = {
  dateIdeas: ['sparkle', 'filter', 'planen'],
  recaps: ['erinnerungen', 'notes', 'statistiken'],
  memoryMap: ['orte', 'momente', 'erinnerungen'],
  photoSources: ['photo-library', 'foto', 'video'],
  calendar: ['kalender', 'gemeinsam', 'check'],
  games: ['spiele', 'smile-plus', 'highlights'],
};

/** Safe destination when the paywall was opened without in-app history. */
const CONTEXT_HOME: Record<ProPaywallContext, string> = {
  dateIdeas: '/plan#wishes',
  recaps: STORY_RECAPS_ROUTE,
  memoryMap: MEMORY_MAP_ROUTE,
  photoSources: `${MORE_SETTINGS_ROUTE}/account`,
  calendar: `${MORE_SETTINGS_ROUTE}/calendar`,
  games: '/games',
  general: '/more',
};

const BENEFITS = ['first', 'second', 'third'] as const;

/**
 * The one eimir. Pro paywall for every Pro entry point (#1892). It opens only
 * through a deliberate navigation, reads the session's existing Space
 * entitlement (no extra request) and offers a purchase only when a real
 * billing channel exists: Google Play inside the Android app (#1525), none in
 * the browser or the iOS app yet. Context changes copy and benefits, never
 * access.
 */
export function ProPaywallPage({
  billingChannel,
}: {
  /** Injected only by tests; production uses the runtime channel. */
  billingChannel?: BillingChannel;
} = {}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const context = proPaywallContext(location.search);
  const { channel, retry: retryChannel } = useBillingChannel(billingChannel);
  const { query, accountId, spaceId } = useSessionSpaceEntitlement();
  // Until the store answers, the target prices stay visible as product
  // information; only live store offers come with a purchase action.
  const offers =
    channel.kind === 'available' ? channel.offers : REFERENCE_PRO_PLANS;
  const [plan, setPlan] = useState<ProPlanId>('yearly');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<ProPurchaseOutcome | null>(null);
  const plansId = useId();
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const locale = resolvedLocale();
  const price = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
      amount,
    );
  const saving = yearlySavingPercent(offers);
  const active = query.data?.tier === 'PREMIUM';

  // Cancel and confirmed unlock both return to the originating view: Back in
  // history when the app opened the paywall, else the context's home.
  const returnToOrigin = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof index === 'number' && index > 0) void navigate(-1);
    else void navigate(CONTEXT_HOME[context], { replace: true });
  };

  const settle = async (result: ProPurchaseOutcome) => {
    setOutcome(result);
    window.requestAnimationFrame(() => outcomeRef.current?.focus());
    if (unlocksFeature(result) && accountId && spaceId) {
      // The backend reconciled the grant; renew the session read once.
      await client.invalidateQueries({
        queryKey: spaceEntitlementQueryKey(accountId, spaceId),
      });
      returnToOrigin();
    }
  };

  const run = async (action: () => Promise<ProPurchaseOutcome>) => {
    if (pending) return;
    setPending(true);
    try {
      await settle(await action());
    } catch {
      await settle('network');
    } finally {
      setPending(false);
    }
  };

  const contextKey = `proPaywall.contexts.${context}`;
  const contextIcons = context === 'general' ? null : CONTEXT_ICONS[context];
  const selected = offers.find((offer) => offer.id === plan) ?? offers[0];

  return (
    <div className="page pro-paywall" data-context={context}>
      <TaskBackButton onClick={returnToOrigin} />
      <div className="pro-paywall-hero" aria-hidden="true">
        <span className="pro-paywall-hero-circle is-first" />
        <span className="pro-paywall-hero-circle is-second" />
        <EimirIcon
          name={contextIcons?.[0] ?? 'sparkle'}
          className="pro-paywall-hero-icon"
        />
      </div>
      <header className="pro-paywall-heading">
        <p className="pro-paywall-eyebrow">{t('proPaywall.eyebrow')}</p>
        <h1>{t(`${contextKey}.title`)}</h1>
        <p>{t(`${contextKey}.description`)}</p>
      </header>

      {contextIcons ? (
        <ul
          className="pro-paywall-benefits"
          aria-label={t('proPaywall.benefitsLabel')}
        >
          {BENEFITS.map((benefit, index) => (
            <li key={benefit}>
              <EimirIcon name={contextIcons[index]} />
              <div>
                <strong>{t(`${contextKey}.benefits.${benefit}.title`)}</strong>
                <p>{t(`${contextKey}.benefits.${benefit}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {active ? (
        <section className="pro-paywall-active" aria-live="polite">
          <h2>{t('proPaywall.active.title')}</h2>
          <p>{t('proPaywall.active.body')}</p>
          <button type="button" onClick={returnToOrigin}>
            {t('proPaywall.active.continue')}
          </button>
          {channel.kind === 'available' && channel.manage ? (
            <button
              type="button"
              className="tertiary"
              onClick={() => void channel.manage?.()}
            >
              {t('proPaywall.manage')}
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <fieldset
            className="pro-paywall-plans"
            aria-describedby={`${plansId}-both`}
          >
            <legend>{t('proPaywall.plansLegend')}</legend>
            {offers.map((offer) => (
              <label
                key={offer.id}
                className="pro-paywall-plan"
                data-selected={plan === offer.id || undefined}
              >
                <input
                  type="radio"
                  name={plansId}
                  value={offer.id}
                  checked={plan === offer.id}
                  onChange={() => setPlan(offer.id)}
                />
                <span className="pro-paywall-plan-text">
                  <span className="pro-paywall-plan-name">
                    {t(`proPaywall.plans.${offer.id}.name`)}
                    {offer.id === 'yearly' && saving > 0 ? (
                      <span className="pro-paywall-saving">
                        {t('proPaywall.plans.yearly.saving', {
                          percent: saving,
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className="pro-paywall-plan-price">
                    {t(`proPaywall.plans.${offer.id}.price`, {
                      price: price(offer.amount, offer.currency),
                    })}
                  </span>
                  {offer.trial ? (
                    <span className="pro-paywall-plan-trial">
                      {t(`proPaywall.plans.trial.${offer.trial.unit}`, {
                        count: offer.trial.count,
                      })}
                    </span>
                  ) : null}
                  {offer.id === 'yearly' ? (
                    <span className="pro-paywall-plan-hint">
                      {t('proPaywall.plans.yearly.perMonth', {
                        price: price(
                          // Round up so the monthly equivalent never understates.
                          Math.ceil((offer.amount / 12) * 100) / 100,
                          offer.currency,
                        ),
                      })}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="pro-paywall-both" id={`${plansId}-both`}>
            <EimirIcon name="gemeinsam" />
            <div>
              <strong>{t('proPaywall.forBoth')}</strong>
              <p>{t('proPaywall.forBothBody')}</p>
            </div>
          </div>
          {query.error ? (
            <div className="pro-paywall-status">
              <p>{t('proPaywall.statusUnknown')}</p>
              <button
                type="button"
                className="tertiary"
                onClick={() => void query.refetch()}
              >
                {t('proPaywall.statusRetry')}
              </button>
            </div>
          ) : null}
          {channel.kind === 'available' ? (
            <div className="pro-paywall-actions">
              <button
                type="button"
                className="pro-paywall-purchase"
                aria-busy={pending || undefined}
                disabled={pending || !query.data}
                onClick={() => void run(() => channel.purchase(plan))}
              >
                {pending
                  ? t('proPaywall.purchasing')
                  : t(`proPaywall.purchase.${selected.id}`)}
              </button>
              <button
                type="button"
                className="tertiary"
                disabled={pending}
                onClick={() => void run(channel.restore)}
              >
                {t('proPaywall.restore')}
              </button>
              <p className="pro-paywall-store-note">
                {t('proPaywall.storeNote')}
              </p>
            </div>
          ) : channel.kind === 'loading' ? (
            <p className="pro-paywall-loading" role="status">
              {t('proPaywall.loadingOffers')}
            </p>
          ) : channel.reason === 'store' ? (
            <section className="pro-paywall-unavailable" role="note">
              <h2>{t('proPaywall.storeUnavailableTitle')}</h2>
              <p>{t('proPaywall.storeUnavailableBody')}</p>
              <button type="button" className="tertiary" onClick={retryChannel}>
                {t('proPaywall.statusRetry')}
              </button>
            </section>
          ) : (
            <section className="pro-paywall-unavailable" role="note">
              <h2>{t('proPaywall.unavailableTitle')}</h2>
              <p>
                {t(
                  channel.platform === 'web'
                    ? 'proPaywall.webUnavailableBody'
                    : 'proPaywall.unavailableBody',
                )}
              </p>
            </section>
          )}
          {outcome ? (
            <p
              ref={outcomeRef}
              tabIndex={-1}
              className="pro-paywall-outcome"
              data-outcome={outcome}
              role={unlocksFeature(outcome) ? 'status' : 'alert'}
            >
              {t(`proPaywall.outcomes.${outcome}`)}
            </p>
          ) : null}
        </>
      )}

      {context === 'general' ? <ProFeatureCatalogue /> : null}
      <p className="pro-paywall-free">{t('proPaywall.free')}</p>
      <section
        className="pro-paywall-terms"
        aria-labelledby={`${plansId}-terms`}
      >
        <h2 id={`${plansId}-terms`}>{t('proPaywall.termsTitle')}</h2>
        <dl>
          {(['renewal', 'cancellation', 'privacy'] as const).map((term) => (
            <div key={term}>
              <dt>{t(`proPaywall.terms.${term}.title`)}</dt>
              <dd>
                {t(`proPaywall.terms.${term}.body`)}
                {term === 'privacy' ? (
                  <>
                    {' '}
                    <Link to={LEGAL_PRIVACY_ROUTE}>
                      {t('proPaywall.terms.privacy.link')}
                    </Link>
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
