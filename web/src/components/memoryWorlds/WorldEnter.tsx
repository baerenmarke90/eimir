/**
 * The single, visible entrance of a memory world in Momente › Erinnerungen.
 *
 * Measured on Android WebView (cold start, #2283): the first paint of a
 * world takes up to ~370 ms of rasterisation. An element with opacity 0 is
 * not painted at all, so that cost hit exactly when a fade began, and the
 * fade jumped to its end. Here the world is painted right away at a
 * practically invisible opacity on its own layer; the fade only starts once
 * frames flow smoothly again and its images are decoded. The loading card
 * (`cover`) lies over the world until then and cross-fades out, so there is
 * no blank frame. Reduced motion makes the fade instant (motion roles).
 */
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isVisibleNow } from '../../motion/visibility';
import './WorldEnter.css';

/** Frames count as smooth when two in a row arrive within this time. */
const SMOOTH_FRAME_MS = 40;
/** Smooth frames in a row before the fade may start. */
const SMOOTH_FRAMES = 6;
/** Never wait longer than this for smooth frames. */
const MAX_WAIT_MS = 2400;
/** Never wait longer than this for the world's images to decode. */
const DECODE_WAIT_MS = 1200;

/**
 * Whether the world is actually seen yet. While the world is drawn at its
 * practically invisible opacity, its own entrance (prints falling onto the
 * Stapel, notes pinned to the door, the book's invite) must wait, or it plays
 * unseen under the loading card. Outside `WorldEnter` a world counts as seen.
 */
const WorldEnteredContext = createContext(true);

export function useWorldEntered(): boolean {
  return useContext(WorldEnteredContext);
}

export function WorldEnter({
  children,
  cover,
}: {
  children: ReactNode;
  cover?: ReactNode;
}) {
  const [entered, setEntered] = useState(false);
  // A world that enters while its tab is hidden is there at once when the
  // tab is shown: a hidden tab skips its style, so a cross-fade started there
  // would only play on the reveal and show the loading card again.
  const [instant, setInstant] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    const startedAt = performance.now();
    // Images of the world arrive and are decoded a moment later (~0.5 s
    // without a frame on the phone): wait for them as well.
    const decodeImages = async () => {
      const box = boxRef.current;
      if (!box) return;
      const images = Array.from(box.querySelectorAll('img'));
      await Promise.race([
        Promise.all(
          images.map((img) =>
            img.decode
              ? img.decode().catch(() => undefined)
              : Promise.resolve(),
          ),
        ),
        new Promise((resolve) => window.setTimeout(resolve, DECODE_WAIT_MS)),
      ]);
    };
    const waitSmooth = () =>
      new Promise<void>((resolve) => {
        let last = 0;
        let smooth = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          if (last && now - last <= SMOOTH_FRAME_MS) smooth += 1;
          else smooth = 0;
          last = now;
          if (smooth >= SMOOTH_FRAMES || now - startedAt > MAX_WAIT_MS) {
            resolve();
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    void (async () => {
      await waitSmooth();
      await decodeImages();
      await waitSmooth();
      if (cancelled) return;
      const box = boxRef.current;
      setInstant(Boolean(box && !isVisibleNow(box).keptView));
      setEntered(true);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div
      className="memory-world-stage"
      data-entered={entered ? 'true' : 'false'}
      data-enter={instant ? 'instant' : undefined}
    >
      {/* The loading card stays until the world is ready, then cross-fades. */}
      {cover ? (
        <div
          className="memory-world-cover"
          aria-hidden={entered ? true : undefined}
        >
          {cover}
        </div>
      ) : null}
      <div
        ref={boxRef}
        className="memory-world-enter"
        data-entered={entered ? 'true' : 'false'}
      >
        <WorldEnteredContext.Provider value={entered}>
          {children}
        </WorldEnteredContext.Provider>
      </div>
    </div>
  );
}
