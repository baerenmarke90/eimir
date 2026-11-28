import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  durationMs,
  MOTION_CONSTANTS,
  type MomentTicket,
  startMoment,
} from '../motion';
import { layoutHandwriting, SYMBOL_SIZE } from './handwritingLayout';

/** The Moment's identity; each opened message is its own item. */
export const HANDWRITING_MOMENT = 'once.handwriting';

/** The handwriting's em in root font sizes, so it follows the text size. */
const EM_IN_ROOT = 2;
/** Lead-in strokes and flourishes reach past the letters' advance widths. */
const FLOURISH_ROOM = 400;

type Phase = 'before' | 'playing' | 'final';

/**
 * #2372 (Product Owner, 2026-11-28): an opened once message writes itself
 * in handwriting, stroke by stroke at one steady pen speed, the way the
 * partner might have written it by hand.
 *
 * - Pacing: the pen speed is `motion.handwriting.penSpeed`, and the writing
 *   time is capped at `--duration-handwriting`, so a longer message writes
 *   faster. A tap shows the finished words at once.
 * - It is a Moment (Motion Contract 4.7) with the message as its item: it
 *   plays once and is finished on a return or remount, with reduced motion,
 *   on a hidden page or beside another emphasized motion. No haptic.
 * - The words are readable text for assistive technology from the start
 *   (the strokes are decorative). Showing them only as they are written is
 *   the Product Owner's recorded exception to M13 for this Moment.
 * - Emoji and other symbols keep their own form and appear in place as the
 *   pen reaches them. Letters of other scripts and very long messages keep
 *   the normal type.
 */
export function HandwrittenMessage({
  text,
  messageKey,
}: {
  text: string;
  messageKey: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; em: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const root =
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        ) || 16;
      setFrame({ width: element.clientWidth, em: root * EM_IN_ROOT });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () =>
      frame && frame.width > 0
        ? layoutHandwriting(
            text,
            (frame.width / frame.em) * 1000 - FLOURISH_ROOM,
          )
        : null,
    [frame, text],
  );
  const writing = layout
    ? Math.min(
        durationMs('handwriting'),
        layout.length / MOTION_CONSTANTS.handwriting.penSpeedUnitsPerMs,
      )
    : 0;
  const [phase, finish] = useHandwritingMoment(
    messageKey,
    Boolean(layout),
    writing,
  );

  // A new layout while writing (rotation, resize) shows the finished words.
  const shownLayout = useRef(layout);
  useEffect(() => {
    if (shownLayout.current !== layout && phase === 'playing') finish();
    shownLayout.current = layout;
  }, [layout, phase, finish]);

  return (
    <div ref={box} className="once-handwriting">
      {layout && frame ? (
        <>
          <p className="sr-only">{text}</p>
          {/* A tap only skips the decorative writing; keyboard and assistive
              technology already have the words as text. */}
          <svg
            className="once-handwriting-strokes"
            viewBox={layout.viewBox}
            aria-hidden="true"
            focusable="false"
            data-phase={phase}
            onClick={phase === 'playing' ? finish : undefined}
            style={
              {
                inlineSize: `${(layout.width / 1000) * frame.em}px`,
                '--handwriting-total': `${writing}ms`,
              } as CSSProperties
            }
          >
            {layout.strokes.map((stroke, index) => (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: strokes of one fixed layout, in pen order
                key={index}
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
            {layout.symbols.map((symbol, index) => (
              <text
                // biome-ignore lint/suspicious/noArrayIndexKey: symbols of one fixed layout, in pen order
                key={index}
                className="once-handwriting-symbol"
                x={symbol.x}
                y={symbol.y}
                fontSize={SYMBOL_SIZE}
                style={
                  {
                    '--stroke-start': symbol.start,
                    '--stroke-share': symbol.share,
                  } as CSSProperties
                }
              >
                {symbol.text}
              </text>
            ))}
          </svg>
        </>
      ) : (
        <p className="once-words">{text}</p>
      )}
    </div>
  );
}

function useHandwritingMoment(
  messageKey: string,
  drawable: boolean,
  duration: number,
): [Phase, () => void] {
  const [phase, setPhase] = useState<Phase>('before');
  const ticket = useRef<MomentTicket | null>(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const finish = useCallback(() => {
    ticket.current?.end();
    ticket.current = null;
    setPhase('final');
  }, []);
  useEffect(() => {
    if (!drawable) return;
    const granted = startMoment(HANDWRITING_MOMENT, messageKey, {
      visible: document.visibilityState !== 'hidden',
      duration: durationRef.current,
    });
    if (!granted) {
      setPhase('final');
      return;
    }
    ticket.current = granted;
    let done: ReturnType<typeof setTimeout> | undefined;
    const begin = setTimeout(() => {
      setPhase('playing');
      done = setTimeout(finish, granted.duration);
    }, granted.delay);
    return () => {
      clearTimeout(begin);
      if (done) clearTimeout(done);
      ticket.current?.end();
      ticket.current = null;
    };
  }, [messageKey, drawable, finish]);
  return [phase, finish];
}
