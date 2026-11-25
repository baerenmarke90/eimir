import { describe, expect, it, vi } from 'vitest';
import {
  ALBUM_CURVES,
  ALBUM_TURN,
  bezierCurve,
  dragAngle,
  dragGrab,
  nudgeAngle,
  releaseCompletes,
  releaseDuration,
  runAlbumTween,
} from './photoAlbum';

describe('the Fotobuch page turn', () => {
  it('solves cubic Bézier curves through their end points', () => {
    const curve = bezierCurve(0.45, 0.05, 0.35, 1);
    expect(curve(0)).toBeCloseTo(0, 3);
    expect(curve(1)).toBeCloseTo(1, 3);
    expect(curve(0.5)).toBeGreaterThan(0.4);
    expect(ALBUM_CURVES.steady(0.3)).toBe(0.3);
  });

  it('keeps the grabbed point under the finger', () => {
    const forward = { forward: true, rubber: false, grab: 200 };
    expect(dragAngle(forward, 0)).toBeCloseTo(0);
    expect(dragAngle(forward, -200)).toBeCloseTo(90);
    expect(dragAngle(forward, -400)).toBeCloseTo(180);
    // Dragging the wrong way does not turn the page.
    expect(dragAngle(forward, 50)).toBeCloseTo(0);
    const back = { forward: false, rubber: false, grab: 100 };
    expect(dragAngle(back, 0)).toBeCloseTo(180);
    expect(dragAngle(back, 200)).toBeCloseTo(0);
  });

  it('lets the first and last page lift only a little', () => {
    const rubber = { forward: true, rubber: true, grab: 120 };
    expect(dragAngle(rubber, -10_000)).toBeLessThan(ALBUM_TURN.rubber);
    expect(dragAngle(rubber, -60)).toBeGreaterThan(0);
  });

  it('grabs forward turns at least half a page from the spine', () => {
    expect(dragGrab(true, false, 10, 300)).toBe(
      ALBUM_TURN.forwardGrabMin * 300,
    );
    expect(dragGrab(true, false, 280, 300)).toBe(280);
    expect(dragGrab(false, false, 280, 300)).toBe(ALBUM_TURN.backGrab * 300);
  });

  it('lets a fling or the angle reached decide a released turn', () => {
    expect(releaseCompletes(true, 20, -1)).toBe(true);
    expect(releaseCompletes(true, 100, 1)).toBe(false);
    expect(releaseCompletes(true, 70, 0)).toBe(true);
    expect(releaseCompletes(true, 30, 0)).toBe(false);
    expect(releaseCompletes(false, 90, 0)).toBe(true);
    expect(releaseCompletes(false, 150, 0)).toBe(false);
    expect(releaseDuration(0, 180)).toBe(
      ALBUM_TURN.releaseMin + ALBUM_TURN.releaseSpan,
    );
  });

  it('nudges up and falls back', () => {
    expect(nudgeAngle(0)).toBeCloseTo(0);
    expect(nudgeAngle(1)).toBeCloseTo(0);
    expect(nudgeAngle(0.5)).toBeGreaterThan(0);
  });

  it('paints the end at once without a duration', () => {
    const paint = vi.fn();
    const done = vi.fn();
    runAlbumTween(0, 180, 0, ALBUM_CURVES.turn, paint, done);
    expect(paint).toHaveBeenCalledWith(180);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
