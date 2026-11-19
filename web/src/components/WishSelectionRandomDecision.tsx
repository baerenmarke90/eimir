import type { WishSelectionDecisionUpdateActionEnum } from '../api/generated/models/WishSelectionDecisionUpdate';
import type { WishSelectionView } from '../api/generated/models/WishSelectionView';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

export function WishSelectionRandomDecision({
  randomPool,
  randomRequest,
  partnerLabel,
  busy,
  decide,
  editOwn,
}: {
  randomPool: WishSelectionView['randomPool'];
  randomRequest: WishSelectionView['randomRequest'];
  partnerLabel: string;
  busy: boolean;
  decide: (action: WishSelectionDecisionUpdateActionEnum) => void;
  editOwn: () => void;
}) {
  const { t } = useTranslation();
  const poolText = t(
    randomPool === 'COMMON'
      ? 'wishSelection.randomPoolCommon'
      : randomPool === 'FAVORITES'
        ? 'wishSelection.randomPoolFavorites'
        : 'wishSelection.randomPoolAll',
  );
  if (randomRequest && !randomRequest.declined && randomRequest.mine)
    return (
      <section className="wish-selection-random" aria-live="polite">
        <div className="wish-selection-ask">
          <EimirIcon name="sparkle" className="wish-selection-ask-icon" />
          <div>
            <strong>
              {t('wishSelection.randomAskedTitle', { name: partnerLabel })}
            </strong>
            <p>{t('wishSelection.randomAskedBody')}</p>
          </div>
        </div>
        <button
          type="button"
          className="tertiary"
          disabled={busy}
          onClick={() => decide('WITHDRAW_RANDOM')}
        >
          {t('wishSelection.randomWithdraw')}
        </button>
      </section>
    );
  if (randomRequest && !randomRequest.declined)
    return (
      <section className="wish-selection-random" aria-live="polite">
        <div className="wish-selection-ask is-incoming">
          <EimirIcon name="sparkle" className="wish-selection-ask-icon" />
          <div>
            <strong>
              {t('wishSelection.randomIncomingTitle', {
                name: partnerLabel,
              })}
            </strong>
            <p>
              {poolText}
              {randomPool === 'FAVORITES'
                ? ` ${t('wishSelection.randomOnlyOne')}`
                : null}
            </p>
          </div>
        </div>
        <div className="wish-selection-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('ACCEPT_RANDOM')}
          >
            {t('wishSelection.randomAccept')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={editOwn}
          >
            {t('wishSelection.randomChangeFirst')}
          </button>
          <button
            type="button"
            className="tertiary"
            disabled={busy}
            onClick={() => decide('DECLINE_RANDOM')}
          >
            {t('wishSelection.randomDecline')}
          </button>
        </div>
      </section>
    );
  return (
    <section className="wish-selection-random" aria-live="polite">
      {randomRequest?.declined ? (
        <p className="wish-selection-support" role="status">
          {t(
            randomRequest.mine
              ? 'wishSelection.randomDeclinedByPartner'
              : 'wishSelection.randomDeclinedByMe',
            { name: partnerLabel },
          )}
        </p>
      ) : null}
      <button
        type="button"
        className="wish-selection-random-propose"
        disabled={busy}
        onClick={() => decide('REQUEST_RANDOM')}
      >
        <EimirIcon name="sparkle" />
        {t('wishSelection.randomPropose')}
      </button>
      <p className="wish-selection-support">
        {poolText} {t('wishSelection.randomConsent', { name: partnerLabel })}
      </p>
    </section>
  );
}
