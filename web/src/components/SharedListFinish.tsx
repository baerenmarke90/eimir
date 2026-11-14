import type { PartnerShare } from '../client/sharedListSummary';
import { useTranslation } from '../i18n';
import { SharedAchievementCelebration } from './SharedAchievementCelebration';
import './SharedListFinish.css';

/** Why the trip cannot be finished right now; the reason is said, not hidden. */
export type FinishBlock = 'offline' | 'waiting' | null;

/**
 * "Einkauf fertig": ends the trip and empties the cart (#1808). It needs a
 * connection and no waiting changes, because it names the entries the
 * partner may be checking at the same moment.
 */
export function FinishTripButton({
  pending,
  blocked,
  failed,
  onFinish,
}: {
  pending: boolean;
  blocked: FinishBlock;
  failed: boolean;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="shared-list-finish">
      <button
        type="button"
        className="shared-list-finish-button"
        disabled={pending || blocked !== null}
        aria-describedby={blocked ? 'shared-list-finish-reason' : undefined}
        onClick={onFinish}
      >
        {t(
          pending
            ? 'm5s3.collection.finish.pending'
            : 'm5s3.collection.finish.action',
        )}
      </button>
      {blocked ? (
        <small id="shared-list-finish-reason">
          {t(`m5s3.collection.finish.${blocked}`)}
        </small>
      ) : null}
      {failed ? (
        <small role="alert">{t('m5s3.collection.finish.failed')}</small>
      ) : null}
    </div>
  );
}

/** What a finished trip left, shown once until the couple closes it. */
export interface TripEnd {
  finishedCount: number;
  shares: PartnerShare[];
  /** The server confirmed the shared moment: nothing is left to buy. */
  celebrate: boolean;
}

export function SharedListTripEnd({
  end,
  onDismiss,
}: {
  end: TripEnd;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = (
    <button type="button" className="tertiary" onClick={onDismiss}>
      {t('m5s3.collection.endState.dismiss')}
    </button>
  );
  if (end.celebrate) {
    const shares = end.shares
      .map((share) =>
        t('m5s3.collection.endState.share', {
          name: share.displayName,
          count: share.count,
        }),
      )
      .join(', ');
    return (
      <SharedAchievementCelebration
        title={t('m5s3.collection.endState.title')}
        body={
          shares
            ? t('m5s3.collection.endState.bodyShares', { shares })
            : t('m5s3.collection.endState.body')
        }
        headingLevel={3}
        action={dismiss}
      />
    );
  }
  return (
    <p className="shared-list-trip-end" role="status">
      <span>
        {t('m5s3.collection.endState.done', { count: end.finishedCount })}
      </span>
      {dismiss}
    </p>
  );
}
