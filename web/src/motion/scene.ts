/**
 * Scene controller for the bounded Scenes domain (Motion Contract 4.8, M8,
 * M9, M12; #2079).
 *
 * A Scene is an interactive playfield (the garden, the games) whose ambient
 * life may loop while it is seen and in use. The controller decides whether
 * a scene plays:
 *
 * - the page is visible, its kept view is shown and the scene is on screen
 *   (the visibility controller, `observeVisibility`);
 * - the owner says it is in use (`active`, for example not resting);
 * - the person did not ask for reduced motion (the one reduced-motion
 *   source). With reduced motion the scene's loops are absent: their
 *   duration roles are `0ms` and the owner's stylesheet switches them off;
 *   the controller then reports `paused` so nothing is left running.
 *
 * The owner spreads `props` on the scene's root element. While it is paused,
 * `data-motion-scene="paused"` pauses every CSS animation inside it in place
 * (`scenes.css`), so it continues where it paused instead of restarting (M4).
 */
import { type RefObject, useEffect, useState } from 'react';
import { useReducedMotion } from './reducedMotion';
import './scenes.css';
import { isVisibleNow, observeVisibility } from './visibility';

export type ScenePlayState = 'playing' | 'paused';

export interface SceneOptions {
  /** The owner's own "in use" state. Defaults to `true`. */
  active?: boolean;
  /**
   * Whether leaving the viewport pauses the scene (default `true`). A
   * full-screen scene that is always on screen may pass `false`.
   */
  onScreen?: boolean;
}

export interface SceneBinding {
  /** True while the scene's loops run. */
  playing: boolean;
  /** True while the page, kept view and (optionally) viewport show it. */
  visible: boolean;
  props: { 'data-motion-scene': ScenePlayState };
}

/** Whether a scene plays: seen, in use and with motion allowed. */
export function scenePlays({
  visible,
  active,
  reduced,
}: {
  visible: boolean;
  active: boolean;
  reduced: boolean;
}): boolean {
  return visible && active && !reduced;
}

/**
 * React binding of the scene controller. `ref` is the scene's root element;
 * the returned `props` go on that element.
 */
export function useScene(
  ref: RefObject<Element | null>,
  { active = true, onScreen = true }: SceneOptions = {},
): SceneBinding {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    const node = ref.current;
    return node ? isVisibleNow(node).visible : false;
  });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return observeVisibility(node, (state) => setVisible(state.visible), {
      onScreen,
    });
  }, [ref, onScreen]);
  const playing = scenePlays({ visible, active, reduced });
  return {
    playing,
    visible,
    props: { 'data-motion-scene': playing ? 'playing' : 'paused' },
  };
}

function pageShown(): boolean {
  return (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );
}

/**
 * Page visibility alone, for scene logic that is not a CSS loop (timers that
 * spawn ambient effects, a playback clock). Follows `visibilitychange`.
 */
export function usePageVisible(): boolean {
  const [shown, setShown] = useState(pageShown);
  useEffect(() => {
    const update = () => setShown(pageShown());
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return shown;
}
