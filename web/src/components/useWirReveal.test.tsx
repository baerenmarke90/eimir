// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWirReveal } from './useWirReveal';

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
