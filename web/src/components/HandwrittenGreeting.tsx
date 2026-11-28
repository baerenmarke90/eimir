import { type CSSProperties, useEffect, useState } from 'react';
import { resolvedLocale, useTranslation } from '../i18n';
import { durationMs, startMoment } from '../motion';
import { HANDWRITTEN_GREETINGS } from './handwrittenGreetings';

/** The Moment's identity; each opened message is its own item. */
export const GREETING_MOMENT = 'once.greeting';

type Phase = 'before' | 'playing' | 'final';

/**
 * #2372 (Product Owner, 2026-11-28): when a once message opens, a short
 * handwritten greeting ("for you", `onceMessages.greeting`) writes itself
 * above it, stroke by stroke at one steady pen speed: the joined letters
 * first, then the dots.
 *
 * - The message is readable from the first frame; the greeting is a small
 *   accent and never hides or delays it (M13).
 * - It is a Moment (Motion Contract 4.7) with the opened message as its item:
 *   it plays once, never again on a return or remount, and shows its final
 *   state when another emphasized motion runs, the page is hidden or motion
 *   is reduced. There is no haptic: opening is a quiet, private act.
 * - The strokes are decorative; the localized greeting is the readable text.
 *   A locale without its own strokes shows the readable text only.
 */
export function HandwrittenGreeting({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation();
  const language = resolvedLocale().split('-')[0];
  const greeting = HANDWRITTEN_GREETINGS[language];
  const phase = useGreetingMoment(messageKey, Boolean(greeting));
  const text = t('onceMessages.greeting');
  if (!greeting) return <p className="once-greeting-text">{text}</p>;
  return (
    <p className="once-greeting">
      <span className="sr-only">{text}</span>
      <svg
        className="once-greeting-strokes"
        viewBox={greeting.viewBox}
        aria-hidden="true"
        focusable="false"
        data-phase={phase}
      >
        {greeting.strokes.map((stroke) => (
          <path
            key={stroke.d}
            d={stroke.d}
            pathLength={1}
            style={
              {
                '--stroke-start': stroke.start,
                '--stroke-share': stroke.share,
              } as CSSProperties
            }
          />
        ))}
      </svg>
    </p>
  );
}

function useGreetingMoment(messageKey: string, drawable: boolean): Phase {
  const [phase, setPhase] = useState<Phase>(drawable ? 'before' : 'final');
  useEffect(() => {
    if (!drawable) return;
    const ticket = startMoment(GREETING_MOMENT, messageKey, {
      visible: document.visibilityState !== 'hidden',
      duration: durationMs('handwriting'),
    });
    if (!ticket) {
      setPhase('final');
      return;
    }
    let done: ReturnType<typeof setTimeout> | undefined;
    const begin = setTimeout(() => {
      setPhase('playing');
      done = setTimeout(() => {
        ticket.end();
        setPhase('final');
      }, ticket.duration);
    }, ticket.delay);
    return () => {
      clearTimeout(begin);
      if (done) clearTimeout(done);
      ticket.end();
    };
  }, [messageKey, drawable]);
  return phase;
}
