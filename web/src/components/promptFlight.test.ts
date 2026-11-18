// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { startPromptFlight } from './promptFlight';

function box(width: number, height: number): HTMLElement {
  const element = document.createElement('span');
  element.getBoundingClientRect = () =>
    ({
      left: 10,
      top: 10,
      width,
      height,
      right: 10 + width,
      bottom: 10 + height,
    }) as DOMRect;
  document.body.append(element);
  return element;
}

describe('startPromptFlight', () => {
  it('does not fly where animation or the top layer is unavailable', () => {
    // jsdom has no Web Animations or popover support, like a reduced-motion
    // setup: the caller simply retires the line without a flight.
    expect(startPromptFlight(box(100, 28), box(30, 30))).toBeNull();
  });

  it('does not fly to a target without a size', () => {
    expect(startPromptFlight(box(100, 28), box(0, 0))).toBeNull();
  });
});
