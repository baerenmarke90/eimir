/**
 * The eimir. motion layer (Motion Contract, `docs/product/design/
 * motion-contract.md`, section 5): the public API in one list.
 *
 * Feature code asks this layer for a primitive. It does not write
 * `@keyframes` or call `Element.animate()` itself (M14);
 * `scripts/check-motion-layer.mjs` enforces that with a ratchet allowlist.
 *
 * Feature modules import the primitive's own module (for example
 * `../motion/presence`), not this index, so a lazy route only loads the
 * parts it uses and the entry chunk stays within its budget.
 */

export {
  AMBIENT_KEYFRAMES,
  type AmbientHandle,
  type AmbientKind,
  type AmbientOptions,
  ambient,
} from './ambient';
export { useAmbientRest } from './ambientRest';
export {
  ATTENTION_PRIORITY,
  type AttentionKind,
  AttentionScheduler,
  type AttentionTicket,
  attentionScheduler,
} from './attention';
export {
  type EmphasisTicket,
  type InputKind,
  MAX_ANIMATED_ELEMENTS,
  ScreenBudget,
  screenBudget,
} from './budget';
export {
  alignCssAnimations,
  Choreography,
  choreography,
  type MemberSlot,
  type MemberTiming,
} from './choreography';
export { type DepartingEntry, useDepartingItems } from './departing';
export {
  ENTER_DEFAULT_SCOPE,
  type EnterBinding,
  type EnterOptions,
  type EnterState,
  type EnterVariant,
  enterDuration,
  staggerDelay,
  useEnter,
} from './enter';
export { type FeedbackKind, feedback } from './feedback';
export {
  ARC_RISE,
  arcPoint,
  centre,
  type FlightLayer,
  flightKeyframes,
  landingScale,
  type MotionRoles,
  openFlightLayer,
  type Point,
  pulseRing,
  readMotionRoles,
  scatterDots,
} from './flight';
export {
  attachGestureFollow,
  type CommitPreset,
  type CommitSide,
  type CommitThreshold,
  commitDistance,
  decideRelease,
  GESTURE,
  type GestureAxis,
  type GestureFollow,
  type GestureFollowConfig,
  resolveOwnership,
  rubberBand,
} from './gesture/follow';
export { SETTLE_SPRING, sampleSpring, springDuration } from './gesture/spring';
export { VelocityTracker } from './gesture/velocity';
export {
  HAPTICS_SETTING_KEY,
  type HapticKind,
  type HapticsBackend,
  haptic,
  hapticsAvailable,
  hapticsEnabled,
  registerHapticsBackend,
  setHapticsEnabled,
} from './haptics';
export {
  isMediaShown,
  type MediaReveal,
  markMediaShown,
  mediaRevealMode,
  revealMedia,
  useMediaReveal,
} from './mediaReveal';
export { type MomentTicket, startMoment } from './moment';
export {
  claimPlay,
  createSurfaceScope,
  hasPlayed,
  markPlayed,
  type PlayScope,
  resetMotionSession,
  type SurfaceScope,
  useSurfaceScope,
} from './playRegistry';
export {
  type OverlayPresenceState,
  type PresentationPresenceState,
  useOverlayPresence,
  usePresentationPresence,
} from './presence';
export {
  prefersReducedMotion,
  subscribeReducedMotion,
  useReducedMotion,
} from './reducedMotion';
export {
  captureLayout,
  crossfade,
  disclose,
  type LayoutSnapshot,
  type NavigateDirection,
  navigate,
  reorder,
  ScrollState,
  valueChange,
} from './replace';
export {
  canAnimate,
  interruptChannel,
  type RunOptions,
  run,
  runningOn,
} from './run';
export {
  type SceneBinding,
  type SceneOptions,
  type ScenePlayState,
  scenePlays,
  usePageVisible,
  useScene,
} from './scene';
export {
  type CountRole,
  type DurationRole,
  durationMs,
  type EasingRole,
  easing,
  invalidateMotionTokens,
  MOTION_CONSTANTS,
  motionCount,
} from './tokens';
export {
  isVisibleNow,
  observeVisibility,
  type VisibilityState,
} from './visibility';
