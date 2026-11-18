import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

/** How long a photograph stays before the next picture takes over. */
export const MOMENT_PHOTO_DWELL_MS = 8000;
/** The longest a clip plays before the next picture takes over. */
export const MOMENT_CLIP_MAX_MS = 10_000;
/** Presentation cleanup after a picture has faded out (a bit over the slow cross-fade). */
const LEAVING_CLEANUP_MS = 2000;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  // Old WebViews and test environments may not know media queries at all.
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/** Data Saver asks for stills: clips then show their poster only. */
export function prefersReducedData(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  return connection?.saveData === true;
}

interface Position {
  index: number;
  /** The picture that is fading out, while it still is. */
  previous: number | null;
}

/**
 * The rotation of the shared moment through its pictures.
 *
 * It only runs while it can be seen and nobody is looking at one picture: it
 * pauses while the page is hidden, while Wir is off screen and while a pointer
 * rests on it or focus is inside it. With reduced motion it never starts and
 * the first picture simply stays. There is deliberately no control on the
 * picture itself (Product Owner decision): nothing sits over the photograph.
 */
export function useMomentRotation(
  count: number,
  isClip: (index: number) => boolean,
) {
  const frameRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [position, setPosition] = useState<Position>({
    index: 0,
    previous: null,
  });
  const [engaged, setEngaged] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  const rotates = count > 1 && !reducedMotion;
  const running = rotates && !engaged && inView && pageVisible;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !rotates || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.5 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [rotates]);

  useEffect(() => {
    const onVisibility = () =>
      setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const advance = useCallback(
    () =>
      setPosition((current) => ({
        index: (current.index + 1) % count,
        previous: current.index,
      })),
    [count],
  );

  const dwellMs = isClip(position.index)
    ? MOMENT_CLIP_MAX_MS
    : MOMENT_PHOTO_DWELL_MS;
  // biome-ignore lint/correctness/useExhaustiveDependencies: The dwell restarts for every picture, so the index is the trigger.
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(advance, dwellMs);
    return () => window.clearTimeout(timer);
  }, [running, position.index, dwellMs, advance]);

  useEffect(() => {
    if (position.previous === null) return;
    const timer = window.setTimeout(
      () =>
        setPosition((current) =>
          current.previous === null ? current : { ...current, previous: null },
        ),
      LEAVING_CLEANUP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [position.previous]);

  return {
    frameRef,
    index: position.index,
    previous: position.previous,
    rotates,
    running,
    advance,
    // A resting mouse or focus inside holds the picture; a touch does not.
    engagement: {
      onPointerEnter: (event: ReactPointerEvent) => {
        if (event.pointerType === 'mouse') setEngaged(true);
      },
      onPointerLeave: () => setEngaged(false),
      onFocus: () => setEngaged(true),
      onBlur: () => setEngaged(false),
    },
  };
}
