// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRouteEntryHandoff } from './routeEntryHandoff';

describe('applyRouteEntryHandoff', () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls to the top of the page when there is no hash', () => {
    applyRouteEntryHandoff('');

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('opens the ancestor <details> and reveals the anchor, without moving focus', () => {
    document.body.innerHTML = `
      <details>
        <summary id="wish-title">Wunsch anlegen</summary>
        <input id="create-wish-title" />
      </details>
    `;
    const scrollIntoViewSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
    const input = document.getElementById(
      'create-wish-title',
    ) as HTMLInputElement;
    const previouslyActive = document.activeElement;

    applyRouteEntryHandoff('#wish-title');

    const details = document.querySelector('details');
    expect(details?.open).toBe(true);
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'start' });
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(previouslyActive);
    expect(document.activeElement).not.toBe(input);
  });

  it('opens every ancestor <details>, not only the closest one', () => {
    document.body.innerHTML = `
      <details id="outer">
        <summary>Outer</summary>
        <details id="inner">
          <summary id="nested-target">Inner</summary>
        </details>
      </details>
    `;
    HTMLElement.prototype.scrollIntoView = vi.fn();

    applyRouteEntryHandoff('#nested-target');

    expect(document.getElementById('outer')).toHaveProperty('open', true);
    expect(document.getElementById('inner')).toHaveProperty('open', true);
  });

  it('does nothing when the hash does not match an existing element', () => {
    document.body.innerHTML = '<div id="present"></div>';

    applyRouteEntryHandoff('#does-not-exist');

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('scrolls the target into view even outside of a <details>', () => {
    document.body.innerHTML = '<h1 id="plain-anchor">Hello</h1>';
    const scrollIntoViewSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    applyRouteEntryHandoff('#plain-anchor');

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'start' });
  });
});
