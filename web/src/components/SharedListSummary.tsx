import { useTranslation } from '../i18n';
import type { SharedListSummary as Summary } from '../client/sharedListSummary';
import { PartnerMarker } from './PartnerMarker';
import './SharedListSummary.css';

/**
 * The head of a shared list: how many entries are still open, a bar that shows
 * how much of the list is done and by whom, and who did what (#1808). The bar
 * is decoration; the same facts are written out as text next to it.
 */
export function SharedListSummary({
  summary,
  shopping,
}: {
  summary: Summary;
  shopping: boolean;
}) {
  const { t } = useTranslation();
  if (summary.total === 0) return null;
  const prefix = shopping ? 'shopping' : 'generic';
  const complete = summary.open === 0;
  const unattributed =
    summary.done - summary.shares.reduce((sum, share) => sum + share.count, 0);
  return (
    <section
      className="shared-list-summary"
      aria-label={t('m5s3.collection.summary.region')}
    >
      <p className="shared-list-summary-count">
        {complete ? (
          <span className="shared-list-summary-complete">
            {t(`m5s3.collection.summary.${prefix}Complete`)}
          </span>
        ) : (
          <>
            <strong className="shared-list-summary-number">
              {summary.open}
            </strong>{' '}
            <span>
              {t(`m5s3.collection.summary.${prefix}Open`, {
                count: summary.open,
              })}
            </span>
          </>
        )}
      </p>
      <div className="shared-list-summary-bar" aria-hidden="true">
        {summary.shares.map((share) => (
          <span
            key={share.personId}
            className={`shared-list-summary-fill shared-list-summary-fill-${share.tone}`}
            style={{ flexGrow: share.count }}
          />
        ))}
        {unattributed > 0 ? (
          <span
            className="shared-list-summary-fill shared-list-summary-fill-plain"
            style={{ flexGrow: unattributed }}
          />
        ) : null}
        {summary.open > 0 ? (
          <span
            className="shared-list-summary-rest"
            style={{ flexGrow: summary.open }}
          />
        ) : null}
      </div>
      {summary.shares.length > 0 ? (
        <ul className="shared-list-summary-shares">
          {summary.shares.map((share) => (
            <li key={share.personId}>
              <PartnerMarker name={share.displayName} tone={share.tone} />
              <span>
                {t(`m5s3.collection.summary.${prefix}Share`, {
                  name: share.displayName,
                  count: share.count,
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
