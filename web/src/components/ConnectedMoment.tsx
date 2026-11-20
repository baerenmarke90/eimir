import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '../motion/haptics';
import { type MomentTicket, startMoment } from '../motion/moment';
import { durationMs } from '../motion/tokens';
import './ConnectedMoment.css';

/** The Moment identity of the connected moment (Motion Contract 4.7). */
export const CONNECTED_MOMENT = 'wir.connected-moment';
/** The one item: the moment plays at most once per app session. */
const CONNECTED_ITEM = 'connected';
let playingTicket: MomentTicket | null = null;

/** The beats end when the words have risen (ConnectedMoment.css). */
function connectedMomentDuration(): number {
  return durationMs('gesture-moment') + durationMs('context');
}

/**
 * Whether the beats play in this mount. They play once per app session as
 * the screen's one emphasized motion, with the Moment's one haptic; a
 * remount or a second render of the same session shows the settled state
 * (M3, M5), and so does a request while another emphasized motion runs.
 */
export function connectedMomentPlays(requested: boolean): boolean {
  if (!requested) return false;
  if (playingTicket) return true;
  const duration = connectedMomentDuration();
  const ticket = startMoment(CONNECTED_MOMENT, CONNECTED_ITEM, {
    visible:
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
    duration,
  });
  if (!ticket) return false;
  if (ticket.delay > 0) {
    ticket.end();
    return false;
  }
  haptic('moment');
  playingTicket = ticket;
  setTimeout(() => {
    playingTicket = null;
    ticket.end();
  }, duration);
  return true;
}

/**
 * The one-time "you are connected" moment under the Wir hero (#1907 I1,
 * #513 section 4). Two person circles glide together and a heart line draws
 * once; on later visits that day only the quiet line remains. Reduced motion
 * shows the settled state with the same text.
 */
export function ConnectedMoment({ playing }: { playing: boolean }) {
  const { t } = useTranslation();
  // The beats are decided once per mount, when the hook first shows the
  // moment. The announcement and `data-playing` (the first showing) do not
  // depend on motion, so reduced motion keeps them (M9).
  const beats = useRef<boolean | null>(null);
  if (playing && beats.current === null)
    beats.current = connectedMomentPlays(true);
  return (
    <section
      className="connected-moment"
      data-playing={playing || undefined}
      data-moment={playing && beats.current === false ? 'final' : undefined}
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
