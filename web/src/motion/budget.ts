/**
 * Per-screen motion budget (Motion Contract M15).
 *
 * - At most one emphasized motion at a time (`--duration-context` or longer,
 *   a Flight or a Moment). A second one waits for the first to end, or shows
 *   its final state when it would wait longer than `--duration-context`.
 * - At most 12 elements animating at once; beyond that the rest show their
 *   final state.
 * - Nothing starts while the person drags or types. Gesture follow and the
 *   Feedback that answers it do not ask the budget.
 *
 * The app shows one screen at a time (kept tabs are hidden), so one shared
 * budget serves it. Tests and isolated surfaces create their own.
 */
import { now as clockNow } from './choreography';
import { durationMs } from './tokens';

export const MAX_ANIMATED_ELEMENTS = 12;

export type InputKind = 'drag' | 'type';

export interface EmphasisTicket {
  /** Wait this long before starting (the previous emphasis is still on). */
  delay: number;
  /** Ends the emphasis early (finished, cancelled or element gone). */
  release(): void;
}

export interface ScreenBudgetOptions {
  maxElements?: number;
  now?: () => number;
  /** The longest wait for a second emphasized motion. */
  maxWait?: () => number;
}

export class ScreenBudget {
  private elements = 0;
  private emphasisEndsAt = 0;
  private emphasisToken: object | null = null;
  private readonly inputs = new Set<InputKind>();
  private readonly maxElements: number;
  private readonly now: () => number;
  private readonly maxWait: () => number;

  constructor(options: ScreenBudgetOptions = {}) {
    this.maxElements = options.maxElements ?? MAX_ANIMATED_ELEMENTS;
    this.now = options.now ?? clockNow;
    this.maxWait = options.maxWait ?? (() => durationMs('context'));
  }

  /** Marks the person as dragging or typing (true) or done (false). */
  setInput(kind: InputKind, active: boolean): void {
    if (active) this.inputs.add(kind);
    else this.inputs.delete(kind);
  }

  get inputActive(): boolean {
    return this.inputs.size > 0;
  }

  /**
   * Reserves up to `count` animating elements; returns how many may animate.
   * The caller releases exactly that many when they end.
   */
  reserveElements(count: number): number {
    if (this.inputActive) return 0;
    const granted = Math.max(
      0,
      Math.min(count, this.maxElements - this.elements),
    );
    this.elements += granted;
    return granted;
  }

  releaseElements(count: number): void {
    this.elements = Math.max(0, this.elements - count);
  }

  get animatingElements(): number {
    return this.elements;
  }

  /**
   * Asks to play an emphasized motion of `duration` ms. Null means: show the
   * final state (input active, or the wait would exceed the limit).
   */
  requestEmphasis(duration: number): EmphasisTicket | null {
    if (this.inputActive) return null;
    const at = this.now();
    const wait = Math.max(0, this.emphasisEndsAt - at);
    if (wait > 0 && wait > this.maxWait()) return null;
    const token = {};
    this.emphasisToken = token;
    this.emphasisEndsAt = at + wait + duration;
    return {
      delay: wait,
      release: () => {
        if (this.emphasisToken === token) {
          this.emphasisToken = null;
          this.emphasisEndsAt = Math.min(this.emphasisEndsAt, this.now());
        }
      },
    };
  }

  /** True while an emphasized motion holds the screen. */
  get emphasisActive(): boolean {
    return this.emphasisEndsAt > this.now();
  }
}

let shared: ScreenBudget | null = null;

/** The app's screen budget. */
export function screenBudget(): ScreenBudget {
  shared ??= new ScreenBudget();
  return shared;
}

/** Test support. */
export function resetScreenBudgetForTests(): void {
  shared = null;
}
