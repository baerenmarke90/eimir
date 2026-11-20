/**
 * Release velocity estimator for Gesture follow (Motion Contract 4.6; tuned in
 * #2073 after the gesture test #2071 read about 20 % high).
 *
 * The acceptance metric is the measured finger velocity of #2071: the
 * pointer's travel from the first sample within the 100 ms before the release
 * up to the release, divided by that time.
 *
 * Why the #2071 tracker read high: it ignored the release. It measured from
 * the newest move back to the first sample at least 100 ms older (in a short
 * flick, the press origin) and stopped at the last move. The time between the
 * last move and the release, during which the finger no longer travels, was
 * left out, and the window could reach past 100 ms. Replaying #2071's own
 * pointer scripts reproduces +17 % to +44 % (see `velocity.test.ts`).
 *
 * This estimator:
 *
 * - takes the release (`pointerup`, with its position) as the last sample and
 *   anchors the 100 ms window there;
 * - returns the travel from the first sample in that window to the release,
 *   divided by the time: the same quantity as the acceptance metric, so it has
 *   no systematic bias. A least-squares slope was evaluated and rejected: it
 *   reads about 7 % high whenever the finger pauses briefly before lifting;
 * - ignores samples before a pause of more than `STOP_GAP_MS` (40 ms) between
 *   samples, so a hold-then-flick measures the flick, not the hold, and reads
 *   0 when the finger rested for that long before lifting;
 * - takes every coalesced sample (`PointerEvent.getCoalescedEvents()`), keeps
 *   samples in time order when a late one arrives, and lets a sample with an
 *   already known timestamp replace the earlier position.
 *
 * Positions are CSS px and times are `PointerEvent.timeStamp` ms, so the
 * result is px/ms.
 */

/** The window of recent movement that decides the release velocity. */
export const HORIZON_MS = 100;
/** A pause between moves longer than this means the finger stopped. */
export const STOP_GAP_MS = 40;
const MAX_SAMPLES = 64;

export interface PointerSample {
  t: number;
  /** Position on the tracked axis, CSS px. */
  p: number;
}

export class VelocityTracker {
  private samples: PointerSample[] = [];

  reset(): void {
    this.samples = [];
  }

  /** Adds one position. Out-of-order samples are inserted in time order. */
  add(t: number, p: number): void {
    if (!Number.isFinite(t) || !Number.isFinite(p)) return;
    const samples = this.samples;
    let index = samples.length;
    while (index > 0 && samples[index - 1].t > t) index -= 1;
    if (index > 0 && samples[index - 1].t === t) samples[index - 1] = { t, p };
    else samples.splice(index, 0, { t, p });
    if (samples.length > MAX_SAMPLES)
      samples.splice(0, samples.length - MAX_SAMPLES);
  }

  /** Adds an event and its coalesced samples on one axis. */
  addEvent(event: PointerEvent, axis: 'x' | 'y'): void {
    const coalesced =
      typeof event.getCoalescedEvents === 'function'
        ? event.getCoalescedEvents()
        : [];
    const list = coalesced.length > 0 ? coalesced : [event];
    for (const sample of list)
      this.add(
        sample.timeStamp,
        axis === 'x' ? sample.clientX : sample.clientY,
      );
  }

  /**
   * Velocity in px/ms at the release. Pass the release sample (the
   * `pointerup` time and position); without it the newest sample is the
   * release. Positive values move toward larger coordinates.
   */
  velocity(release?: PointerSample): number {
    const samples = [...this.samples];
    if (release && Number.isFinite(release.t) && Number.isFinite(release.p)) {
      const newest = samples[samples.length - 1];
      if (!newest || release.t > newest.t) samples.push(release);
      else if (release.t === newest.t) samples[samples.length - 1] = release;
    }
    if (samples.length < 2) return 0;
    const end = samples[samples.length - 1];
    let first = samples.length - 1;
    while (first > 0) {
      const previous = samples[first - 1];
      if (end.t - previous.t > HORIZON_MS) break;
      if (samples[first].t - previous.t > STOP_GAP_MS) break;
      first -= 1;
    }
    if (first === samples.length - 1) return 0;
    const start = samples[first];
    return (end.p - start.p) / (end.t - start.t);
  }
}
