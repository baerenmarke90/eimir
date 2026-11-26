// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { isVisibleNow, observeVisibility } from './visibility';

afterEach(() => {
  document.body.replaceChildren();
});

function keptView(attributes: Record<string, string> = {}) {
  const panel = document.createElement('div');
  panel.setAttribute('data-primary-tab', '/story/map');
  for (const [name, value] of Object.entries(attributes))
    panel.setAttribute(name, value);
  const element = document.createElement('span');
  panel.append(element);
  document.body.append(panel);
  return { panel, element };
}

it('counts a shown kept view as seen and a parked one as unseen', () => {
  expect(isVisibleNow(keptView().element).keptView).toBe(true);
  expect(isVisibleNow(keptView({ hidden: '' }).element).keptView).toBe(false);
});

it('counts a view prepared before its first visit as unseen, also while it rests', () => {
  expect(
    isVisibleNow(keptView({ 'data-primary-tab-prewarm': 'true' }).element)
      .keptView,
  ).toBe(false);
  expect(
    isVisibleNow(keptView({ 'data-primary-tab-prewarm': 'rested' }).element)
      .keptView,
  ).toBe(false);
});

it('lets motion in a prepared view continue when the view is first visited', async () => {
  const { panel, element } = keptView({ 'data-primary-tab-prewarm': 'rested' });
  const listener = vi.fn();
  const stop = observeVisibility(element, listener, { onScreen: false });
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ keptView: false, visible: false }),
  );

  panel.removeAttribute('data-primary-tab-prewarm');
  await Promise.resolve();
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ keptView: true, visible: true }),
  );
  stop();
});
