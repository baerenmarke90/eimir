/**
 * Attention scheduler for unprompted motion (Motion Contract 4.9, M16).
 *
 * Priority, highest first: a Moment for a received partner gesture or
 * message, a partner arrival Flight, an Enter for new content in view, a
 * quiet hint.
 *
 * - At most one unprompted motion at a time per screen. A higher kind may
 *   take over from a lower one (the lower one is told to show its final
 *   state); a lower or equal kind that cannot play is dropped.
 * - The same kind plays at most once per `motion.attention.sameKindInterval`
 *   (30 s) per screen.
 * - Dropped, never queued: a request that cannot play now returns null, and
 *   the caller simply shows the content.
 * - Never while the page or view is hidden, while the person drags or types,
 *   while a sheet is open, or while a Moment the person opened runs.
 */
import { type ScreenBudget, screenBudget } from './budget';
import { now as clockNow } from './choreography';
import { MOTION_CONSTANTS } from './tokens';

export type AttentionKind = 'moment' | 'arrival' | 'enter' | 'hint';

export const ATTENTION_PRIORITY: Record<AttentionKind, number> = {
  moment: 4,
  arrival: 3,
  enter: 2,
  hint: 1,
};

export interface AttentionTicket {
  kind: AttentionKind;
  /** Ends the motion (finished, cancelled, element gone). */
  release(): void;
}

export interface AttentionRequest {
  /** Called when a higher kind takes over: show the final state now. */
  onPreempt?: () => void;
  /** False when the target is not visible (page, kept view, off screen). */
  visible?: boolean;
}

export interface AttentionOptions {
  budget?: ScreenBudget;
  now?: () => number;
  sameKindInterval?: number;
}

export class AttentionScheduler {
  private active: {
    kind: AttentionKind;
    token: object;
    onPreempt?: () => void;
  } | null = null;
  private readonly lastPlayed = new Map<AttentionKind, number>();
  private sheets = 0;
  private readonly budget: () => ScreenBudget;
  private readonly now: () => number;
  private readonly interval: number;

  constructor(options: AttentionOptions = {}) {
    const budget = options.budget;
    this.budget = budget ? () => budget : screenBudget;
    this.now = options.now ?? clockNow;
    this.interval =
      options.sameKindInterval ?? MOTION_CONSTANTS.attention.sameKindIntervalMs;
  }

  /** An open sheet blocks unprompted motion (M16). */
  setSheetOpen(open: boolean): void {
    this.sheets = Math.max(0, this.sheets + (open ? 1 : -1));
  }

  request(
    kind: AttentionKind,
    request: AttentionRequest = {},
  ): AttentionTicket | null {
    if (request.visible === false) return null;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    )
      return null;
    if (this.sheets > 0 || this.budget().inputActive) return null;
    const at = this.now();
    const last = this.lastPlayed.get(kind);
    if (last !== undefined && at - last < this.interval) return null;
    if (this.active) {
      if (ATTENTION_PRIORITY[kind] <= ATTENTION_PRIORITY[this.active.kind])
        return null;
      const preempted = this.active;
      this.active = null;
      preempted.onPreempt?.();
    }
    const token = {};
    this.active = { kind, token, onPreempt: request.onPreempt };
    this.lastPlayed.set(kind, at);
    return {
      kind,
      release: () => {
        if (this.active?.token === token) this.active = null;
      },
    };
  }

  get activeKind(): AttentionKind | null {
    return this.active?.kind ?? null;
  }
}

let shared: AttentionScheduler | null = null;

export function attentionScheduler(): AttentionScheduler {
  shared ??= new AttentionScheduler();
  return shared;
}

/** Test support. */
export function resetAttentionForTests(): void {
  shared = null;
}
