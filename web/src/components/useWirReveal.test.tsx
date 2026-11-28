// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from '../motion/__fixtures__/fakeAnimation';
import { resetChoreographiesForTests } from '../motion/choreography';
import { resetPlayRegistryForTests } from '../motion/playRegistry';
import { resetStagesForTests, useStage, useStageHold } from '../motion/stage';
import { invalidateMotionTokens } from '../motion/tokens';
import { resetWirRevealForTests, useWirReveal } from './useWirReveal';
import { WIR_STAGE, wirModuleSlot } from './wirStageMotion';

function Opening({
  pending,
  duration,
  children,
}: {
  pending: boolean;
  duration: number;
  children: React.ReactNode;
}) {
  const ref = useStage<HTMLDivElement>(WIR_STAGE, { duration, hold: 400 });
  useStageHold(WIR_STAGE, pending);
  return (
    <div>
      <div ref={ref} />
      {children}
    </div>
  );
}

function Module({ className }: { className: string }) {
  const { ref, revealProps } = useWirReveal<HTMLElement>(className);
  return (
    <section ref={ref} className={className} {...revealProps}>
      module
    </section>
  );
}

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

/** An IntersectionObserver the test can fire by hand. */
function installObserver() {
  const callbacks: ObserverCallback[] = [];
  class FakeObserver {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return {
    reach: () =>
      act(async () => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      }),
  };
}

const phases = () =>
  screen
    .getAllByText('module')
    .map((element) => element.getAttribute('data-wir-reveal'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useWirReveal', () => {
  it('keeps a module pending until it is reached, then lets it arrive once and settle', async () => {
    const observer = installObserver();
    render(<Module className="today-section today-section-reveal-once" />);
    expect(phases()).toEqual(['pending']);

    await observer.reach();
    // There are no running animations in jsdom, so the arrival is over at once
    // and the module settles: later additions inside it carry no leftover delay.
    await vi.waitFor(() => expect(phases()).toEqual(['seen']));
  });

  it('shows a module that was already seen in this session as plain content', async () => {
    const observer = installObserver();
    const className = 'today-section today-section-reveal-remount';
    const first = render(<Module className={className} />);
    await observer.reach();
    await vi.waitFor(() => expect(phases()).toEqual(['seen']));
    first.unmount();

    // Returning to Wir rebuilds the page: nothing arrives a second time.
    render(<Module className={className} />);
    expect(phases()).toEqual(['seen']);
  });

  it('lets a module that is new to the session arrive when it is reached', async () => {
    const observer = installObserver();
    render(<Module className="today-section today-section-reveal-known" />);
    await observer.reach();
    await vi.waitFor(() => expect(phases()).toEqual(['seen']));

    render(<Module className="today-section today-section-reveal-new" />);
    expect(phases()).toEqual(['seen', 'pending']);
  });

  it('never hides content when the browser cannot observe visibility', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Module className="today-section today-section-reveal-none" />);
    await vi.waitFor(() => expect(phases()).not.toContain('pending'));
  });
});

describe('useWirReveal on the Wir opening clock (#2147)', () => {
  let clearRoles: () => void;
  let reduced: FakeMediaQuery;

  beforeEach(() => {
    reduced = installReducedMotion(false);
    clearRoles = setMotionRoles(DEFAULT_ROLES);
    invalidateMotionTokens();
    resetStagesForTests();
    resetChoreographiesForTests();
    resetPlayRegistryForTests();
    resetWirRevealForTests();
  });

  afterEach(() => {
    clearRoles();
    reduced.restore();
    invalidateMotionTokens();
  });

  /** Every phase the module showed, in order. */
  function history() {
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      const phase = screen.getByText('module').getAttribute('data-wir-reveal');
      if (phase && seen.at(-1) !== phase) seen.push(phase);
    });
    observer.observe(document.body, { attributes: true, subtree: true });
    return seen;
  }

  const style = (name: string) =>
    screen.getByText('module').style.getPropertyValue(name);

  it('lets a module in view wait for the opening and arrive on its slot', async () => {
    const observer = installObserver();
    const className = 'today-section today-section-clock-slot';
    const view = render(
      <Opening pending duration={3000}>
        <Module className={className} />
      </Opening>,
    );
    await observer.reach();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The opening still waits for its data: the module waits with it.
    expect(phases()).toEqual(['pending']);

    view.rerender(
      <Opening pending={false} duration={3000}>
        <Module className={className} />
      </Opening>,
    );
    await vi.waitFor(() => expect(phases()).not.toContain('pending'));
    const delay = Number.parseFloat(style('--wir-reveal-delay'));
    expect(delay).toBeGreaterThan(wirModuleSlot(0).offset - 100);
    expect(delay).toBeLessThanOrEqual(wirModuleSlot(0).offset);
    expect(style('--wir-reveal-scale')).toBe('1');
  });

  it('joins late in the time that is left of the opening', async () => {
    const observer = installObserver();
    render(
      <Opening pending={false} duration={1400}>
        <Module className="today-section today-section-clock-late" />
      </Opening>,
    );
    // Reached after its slot (1100 ms) began, with 300 ms left.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await observer.reach();
    await vi.waitFor(() => expect(phases()).not.toContain('pending'));
    expect(style('--wir-reveal-delay')).toBe('0ms');
    const scale = Number(style('--wir-reveal-scale'));
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
  });

  it('shows a module that is reached after the opening at rest', async () => {
    const observer = installObserver();
    render(
      <Opening pending={false} duration={60}>
        <Module className="today-section today-section-clock-after" />
      </Opening>,
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    const seen = history();
    await observer.reach();
    await vi.waitFor(() => expect(phases()).toEqual(['seen']));
    expect(seen).not.toContain('shown');
  });

  it('arrives with the short batch when Wir has no opening', async () => {
    const observer = installObserver();
    render(<Module className="today-section today-section-clock-none" />);
    await observer.reach();
    await vi.waitFor(() => expect(phases()).not.toContain('pending'));
    // After the hero has landed: 2.75 opening beats of 440 ms.
    expect(style('--wir-reveal-delay')).toBe('1210ms');
  });

  it('shows a module reached by scrolling at once', async () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 300,
    });
    const observer = installObserver();
    render(
      <Opening pending duration={3000}>
        <Module className="today-section today-section-clock-scrolled" />
      </Opening>,
    );
    await observer.reach();
    await vi.waitFor(() => expect(phases()).not.toContain('pending'), {
      timeout: 200,
    });
    expect(style('--wir-reveal-delay')).toBe('0ms');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
