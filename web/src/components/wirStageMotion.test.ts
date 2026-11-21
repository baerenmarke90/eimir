// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLES,
  setMotionRoles,
} from '../motion/__fixtures__/fakeAnimation';
import { invalidateMotionTokens, MOTION_CONSTANTS } from '../motion/tokens';
import {
  WIR_STAGE_BEATS,
  wirIntroBeat,
  wirModuleSlot,
  wirStageDuration,
  wirStageHold,
} from './wirStageMotion';

const heroCss = readFileSync(join(__dirname, 'WirHeroStage.css'), 'utf8');
const motionCss = readFileSync(join(__dirname, 'WirMotion.css'), 'utf8');

let clearRoles: () => void;

beforeEach(() => {
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  invalidateMotionTokens();
});

afterEach(() => {
  clearRoles();
  invalidateMotionTokens();
});

/** `calc(var(--wir-intro-beat) * n)` as the CSS writes a beat count. */
const beats = (count: number) =>
  count === 1
    ? 'var(--wir-intro-beat)'
    : `calc(var(--wir-intro-beat) * ${count})`;
const css = (text: string) => text.replace(/\s+/g, ' ');

describe('the Wir opening on one clock (#2147)', () => {
  it('fits the data hold and the whole opening into the opening budget', () => {
    const { dataHoldMs, openingBudgetMs } = MOTION_CONSTANTS.stage;
    expect(wirStageHold()).toBe(dataHoldMs);
    expect(dataHoldMs + wirStageDuration()).toBeLessThanOrEqual(
      openingBudgetMs,
    );
  });

  it('ends every slot within the opening', () => {
    const beat = wirIntroBeat();
    const end = wirStageDuration();
    for (const [name, slot] of Object.entries(WIR_STAGE_BEATS)) {
      if (!('length' in slot)) continue;
      const lead = 'partnerLead' in slot ? slot.partnerLead : 0;
      expect(
        beat * (slot.start + lead + slot.length),
        `${name} ends inside the opening`,
      ).toBeLessThanOrEqual(end);
    }
    // The latest staggered module too.
    const last = wirModuleSlot(99);
    expect(last.offset + last.length).toBeLessThanOrEqual(end + 0.001);
  });

  it('keeps the CSS beats in step with the slots', () => {
    const motion = css(motionCss);
    const hero = css(heroCss);
    const { portraits, arms, heart, checkIn, bridge, wiggle, quote } =
      WIR_STAGE_BEATS;
    expect(motion).toContain(
      `eimir-motion-stage-fade ${beats(portraits.length)}`,
    );
    expect(motion).toContain(
      `animation-delay: ${beats(portraits.partnerLead)}`,
    );
    expect(motion).toContain(
      `${beats(checkIn.length)} var(--easing-travel) ${beats(checkIn.start)}`,
    );
    expect(motion).toContain(
      `${beats(bridge.length)} var(--easing-travel) ${beats(bridge.start)}`,
    );
    expect(motion).toContain(
      `var(--duration-gesture-moment) var(--easing-standard) ${beats(wiggle.start)}`,
    );
    expect(motion).toContain(
      `${beats(quote.length)} var(--easing-travel) ${beats(quote.start)}`,
    );
    expect(hero).toContain(
      `eimir-motion-stage-reach ${beats(arms.length)} var(--easing-standard) ${beats(arms.start)}`,
    );
    expect(hero).toContain(
      `eimir-motion-stage-trace ${beats(heart.length)} var(--easing-standard) ${beats(heart.start)}`,
    );
  });

  it('never scales the portrait columns or their thin rings (M7)', () => {
    const motion = css(motionCss);
    expect(motion).not.toContain('eimir-motion-stage-settle');
    expect(motion).not.toContain('eimir-motion-stage-land');
    expect(motion).not.toMatch(
      /partner-avatar-stack > \*::before \{ animation/,
    );
  });

  it('places the modules in reading order, one stagger step apart, capped', () => {
    const beat = wirIntroBeat();
    expect(wirModuleSlot(0).offset).toBe(beat * WIR_STAGE_BEATS.modules.start);
    expect(wirModuleSlot(1).offset - wirModuleSlot(0).offset).toBe(60);
    expect(wirModuleSlot(3).offset).toBe(wirModuleSlot(9).offset);
  });
});
