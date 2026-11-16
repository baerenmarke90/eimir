import { useTranslation } from 'react-i18next';
import './ConnectedMoment.css';

/**
 * The one-time "you are connected" moment under the Wir hero (#1907 I1,
 * #513 section 4). Two person circles glide together and a heart line draws
 * once; on later visits that day only the quiet line remains. Reduced motion
 * shows the settled state with the same text.
 */
export function ConnectedMoment({ playing }: { playing: boolean }) {
  const { t } = useTranslation();
  return (
    <section
      className="connected-moment"
      data-playing={playing || undefined}
      aria-labelledby="connected-moment-title"
    >
      <span className="connected-moment-mark" aria-hidden="true">
        <span className="connected-moment-own" />
        <span className="connected-moment-partner" />
        <svg viewBox="0 0 120 24" focusable="false" aria-hidden="true">
          <path d="M2 14h40l6-8 6 14 6-10 4 4h54" pathLength="1" />
        </svg>
      </span>
      <h2
        id="connected-moment-title"
        className="connected-moment-title"
        aria-live={playing ? 'polite' : undefined}
      >
        {t('quietHints.connected.title')}
      </h2>
      <p className="connected-moment-line">{t('quietHints.connected.since')}</p>
    </section>
  );
}
