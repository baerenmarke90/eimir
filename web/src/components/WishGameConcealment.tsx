import './WishGameConcealment.css';
import { Link } from 'react-router-dom';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { GAMES_WISH_DETECTIVE_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

/*
 * #2158 H: the partner's wishes an open Wish detective game hides from the
 * one who guesses. They keep their place in the Wishes tab as quiet
 * placeholders (the number of wishes is no secret), name only who wished
 * them and lead to the game. There is nothing to open or edit.
 */
export function HiddenWishGroup({
  wishes,
}: {
  wishes: readonly Pick<WishDetail, 'id' | 'creator'>[];
}) {
  const { t } = useTranslation();
  if (wishes.length === 0) return null;
  return (
    <section
      className="planen-wish-group wish-game-hidden-group"
      aria-labelledby="wish-game-hidden-title"
    >
      <h2 id="wish-game-hidden-title" className="wish-game-hidden-heading">
        <EimirIcon name="suche" />
        {t('wishConcealment.groupTitle')}
      </h2>
      <p className="wish-game-hidden-intro">
        {t('wishConcealment.groupIntro')}{' '}
        <Link to={GAMES_WISH_DETECTIVE_ROUTE}>
          {t('wishConcealment.toGame')}
        </Link>
      </p>
      <ul className="planen-wish-list">
        {wishes.map((wish) => (
          <li key={wish.id} className="wish-game-hidden-row">
            <span className="planen-wish-copy">
              <strong>
                {t('wishConcealment.rowTitle', {
                  name: wish.creator.displayName,
                })}
              </strong>
              <small>{t('wishConcealment.rowHint')}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The detail of a hidden wish: who wished it and when it is revealed. */
export function HiddenWishNotice({
  wish,
}: {
  wish: Pick<WishDetail, 'creator'>;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="wish-game-hidden-notice"
      aria-labelledby="wish-game-hidden-notice-title"
    >
      <p className="eyebrow wish-game-hidden-heading">
        <EimirIcon name="suche" />
        {t('wishConcealment.detailEyebrow')}
      </p>
      <h2 id="wish-game-hidden-notice-title" className="detail-content-title">
        {t('wishConcealment.detailTitle')}
      </h2>
      <p>
        {t('wishConcealment.detailBody', { name: wish.creator.displayName })}
      </p>
      <Link className="button-link" to={GAMES_WISH_DETECTIVE_ROUTE}>
        {t('wishConcealment.toGame')}
      </Link>
    </section>
  );
}
