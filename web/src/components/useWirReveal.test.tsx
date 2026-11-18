// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetWirStageSettleForTests, useWirReveal } from './useWirReveal';

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

describe('useWirReveal waits for the hero and the quote to settle', () => {
  function addStage(quoteLoading: boolean) {
    const stage = document.createElement('div');
    stage.className = 'wir-stage';
    const quote = document.createElement('section');
    quote.className = 'daily-quote-card';
    if (quoteLoading) {
      const line = document.createElement('p');
      line.className = 'is-loading';
      quote.append(line);
    }
    document.body.append(stage, quote);
    return { stage, quote };
  }

  afterEach(() => {
    for (const element of document.querySelectorAll(
      '.wir-stage, .daily-quote-card',
    ))
      element.remove();
    resetWirStageSettleForTests();
  });

  it('shows the module a moment after the stage has stopped changing', async () => {
    resetWirStageSettleForTests();
    addStage(false);
    const observer = installObserver();
    render(<Module className="today-section today-section-settle-quiet" />);
    await observer.reach();
    // Reached, but it still waits for a quiet stage.
    expect(phases()).toEqual(['pending']);
    await vi.waitFor(() => expect(phases()).not.toContain('pending'), {
      timeout: 1500,
    });
  });

  it('keeps the module hidden while the quote is loading and shows it once it is known', async () => {
    resetWirStageSettleForTests();
    const { quote } = addStage(true);
    const observer = installObserver();
    render(<Module className="today-section today-section-settle-loading" />);
    await observer.reach();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(phases()).toEqual(['pending']);

    quote.querySelector('.is-loading')?.remove();
    await vi.waitFor(() => expect(phases()).not.toContain('pending'), {
      timeout: 1500,
    });
  });

  it('never hides the module longer than the cap when the quote does not arrive', async () => {
    resetWirStageSettleForTests();
    addStage(true);
    const observer = installObserver();
    render(<Module className="today-section today-section-settle-cap" />);
    await observer.reach();
    await vi.waitFor(() => expect(phases()).not.toContain('pending'), {
      timeout: 3500,
    });
  });

  it('shows a module reached by scrolling at once', async () => {
    resetWirStageSettleForTests();
    addStage(true);
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 300,
    });
    const observer = installObserver();
    render(<Module className="today-section today-section-settle-scrolled" />);
    await observer.reach();
    await vi.waitFor(() => expect(phases()).not.toContain('pending'), {
      timeout: 500,
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
