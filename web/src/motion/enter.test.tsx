// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from './__fixtures__/fakeAnimation';
import { ScreenBudget } from './budget';
import { Choreography, resetChoreographiesForTests } from './choreography';
import { type EnterOptions, staggerDelay, useEnter } from './enter';
import { createSurfaceScope, resetPlayRegistryForTests } from './playRegistry';

function Swapping() {
  const [asButton, setAsButton] = useState(false);
  return (
    <>
      <Entering
        identity="wir.portrait.own"
        options={{ variant: 'rise' }}
        tag={asButton ? 'button' : 'div'}
      />
      <button
        type="button"
        data-testid="swap"
        onClick={() => setAsButton(true)}
      />
    </>
  );
}

let reduced: FakeMediaQuery;
let clearRoles: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = installReducedMotion(false);
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  resetPlayRegistryForTests();
  resetChoreographiesForTests();
});

afterEach(() => {
  vi.useRealTimers();
  reduced.restore();
  clearRoles();
  document.body.innerHTML = '';
});

function Entering({
  identity,
  options,
  tag = 'div',
}: {
  identity: string;
  options: EnterOptions;
  tag?: 'div' | 'button';
}) {
  const enter = useEnter<HTMLElement>(identity, options);
  const Tag = tag;
  return (
    <Tag data-testid="item" ref={enter.ref} {...enter.props}>
      Wie geht's?
    </Tag>
  );
}

function item() {
  return document.querySelector<HTMLElement>('[data-testid="item"]');
}

function animationEvent(
  target: Element,
  type: 'animationend' | 'animationcancel',
) {
  const event = new Event(type, { bubbles: true });
  target.dispatchEvent(event);
}

describe('useEnter', () => {
  it('ends on its own animationend, never on a re-render', () => {
    const { rerender } = render(
      <Entering identity="wir.stage" options={{ variant: 'rise' }} />,
    );
    expect(item()?.dataset.motionEnter).toBe('rise');
    rerender(<Entering identity="wir.stage" options={{ variant: 'rise' }} />);
    rerender(<Entering identity="wir.stage" options={{ variant: 'rise' }} />);
    expect(item()?.dataset.motionEnter).toBe('rise');

    // A child's animation does not end the entrance.
    const child = document.createElement('span');
    item()?.append(child);
    act(() => animationEvent(child, 'animationend'));
    expect(item()?.dataset.motionEnter).toBe('rise');

    act(() => animationEvent(item() as Element, 'animationend'));
    expect(item()?.dataset.motionEnter).toBeUndefined();
    expect(item()?.textContent).toBe("Wie geht's?");
  });

  it('ends at its token deadline when no animation event arrives', () => {
    render(<Entering identity="today.quote" options={{ variant: 'fade' }} />);
    expect(item()?.dataset.motionEnter).toBe('fade');
    act(() => vi.advanceTimersByTime(279));
    expect(item()?.dataset.motionEnter).toBe('fade');
    act(() => vi.advanceTimersByTime(100));
    expect(item()?.dataset.motionEnter).toBeUndefined();
  });

  it('plays once per identity and scope', () => {
    const first = render(
      <Entering identity="wir.module.planning" options={{ variant: 'rise' }} />,
    );
    act(() => animationEvent(item() as Element, 'animationend'));
    first.unmount();

    render(
      <Entering identity="wir.module.planning" options={{ variant: 'rise' }} />,
    );
    expect(item()?.dataset.motionEnter).toBeUndefined();
  });

  it('keeps separate surface scopes apart and forgets a disposed one', () => {
    const sheetA = createSurfaceScope();
    const sheetB = createSurfaceScope();
    const a = render(
      <Entering
        identity="sheet.body"
        options={{ variant: 'surface', surface: sheetA }}
      />,
    );
    act(() => animationEvent(item() as Element, 'animationend'));
    a.unmount();
    render(
      <Entering
        identity="sheet.body"
        options={{ variant: 'surface', surface: sheetB }}
      />,
    );
    expect(item()?.dataset.motionEnter).toBe('surface');
  });

  it('remounts in its final state in the first frame, without restart or flash', () => {
    render(<Swapping />);
    expect(item()?.dataset.motionEnter).toBe('rise');
    // The span becomes a button mid-entrance (a new element, same identity).
    act(() =>
      document.querySelector<HTMLElement>('[data-testid="swap"]')?.click(),
    );
    expect(item()?.tagName).toBe('BUTTON');
    expect(item()?.dataset.motionEnter).toBeUndefined();
    expect(item()?.style.getPropertyValue('--motion-enter-delay')).toBe('');
  });

  it('does not replay when a kept tab is hidden and shown again', () => {
    const panel = document.createElement('section');
    panel.dataset.primaryTab = '/wir';
    document.body.append(panel);
    render(<Entering identity="wir.modules" options={{ variant: 'rise' }} />, {
      container: panel,
    });
    expect(item()?.dataset.motionEnter).toBe('rise');
    // Hiding the tab mid-entrance cancels the CSS animation.
    panel.hidden = true;
    act(() => animationEvent(item() as Element, 'animationcancel'));
    expect(item()?.dataset.motionEnter).toBeUndefined();
    panel.hidden = false;
    expect(item()?.dataset.motionEnter).toBeUndefined();
  });

  it('shows the final state when it mounts in a hidden kept tab', () => {
    const panel = document.createElement('section');
    panel.dataset.primaryTab = '/planen';
    panel.hidden = true;
    document.body.append(panel);
    render(<Entering identity="planen.panel" options={{ variant: 'fade' }} />, {
      container: panel,
    });
    expect(item()?.dataset.motionEnter).toBeUndefined();
  });

  it('shows the final state with reduced motion, and follows a runtime change', () => {
    reduced.set(true);
    const first = render(
      <Entering identity="a" options={{ variant: 'fade' }} />,
    );
    expect(item()?.dataset.motionEnter).toBeUndefined();
    first.unmount();
    reduced.set(false);
    render(<Entering identity="b" options={{ variant: 'fade' }} />);
    expect(item()?.dataset.motionEnter).toBe('fade');
  });

  it('aligns a late or remounted choreography member to the shared clock', () => {
    const clock = new Choreography('wir.opening');
    clock.start(1000);
    vi.spyOn(clock, 'timing').mockImplementation((slot) =>
      Choreography.prototype.timing.call(clock, slot, 1150),
    );
    render(
      <Entering
        identity="wir.caption"
        options={{ variant: 'stage', choreography: clock, offset: 200 }}
      />,
    );
    // Mounted 150 ms into the choreography: its 200 ms slot starts in 50 ms.
    expect(item()?.style.getPropertyValue('--motion-enter-delay')).toBe('50ms');
  });

  it('starts a member part-way through when it remounts during its slot', () => {
    const clock = new Choreography('wir.opening');
    clock.start(1000);
    vi.spyOn(clock, 'timing').mockImplementation((slot) =>
      Choreography.prototype.timing.call(clock, slot, 1300),
    );
    render(
      <Entering
        identity="wir.heart-line"
        options={{ variant: 'stage', choreography: clock, offset: 200 }}
      />,
    );
    expect(item()?.style.getPropertyValue('--motion-enter-delay')).toBe(
      '-100ms',
    );
  });

  it('shows the final state for a member whose slot passed', () => {
    const clock = new Choreography('wir.opening');
    clock.start(1000);
    vi.spyOn(clock, 'timing').mockImplementation((slot) =>
      Choreography.prototype.timing.call(clock, slot, 5000),
    );
    render(
      <Entering
        identity="wir.late"
        options={{ variant: 'stage', choreography: clock, offset: 200 }}
      />,
    );
    expect(item()?.dataset.motionEnter).toBeUndefined();
  });

  it('shows the final state beyond the per-screen element budget', () => {
    const budget = new ScreenBudget({ maxElements: 1 });
    render(
      <>
        <Entering identity="one" options={{ variant: 'fade', budget }} />
        <Entering identity="two" options={{ variant: 'fade', budget }} />
      </>,
    );
    const states = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="item"]'),
    ].map((node) => node.dataset.motionEnter ?? 'final');
    expect(states).toEqual(['fade', 'final']);
  });
});

describe('staggerDelay', () => {
  it('steps per sibling and caps at the token limit', () => {
    expect([0, 1, 2, 3, 4, 9].map((index) => staggerDelay(index))).toEqual([
      0, 60, 120, 180, 180, 180,
    ]);
    expect(staggerDelay(2, 'module')).toBe(440);
  });

  it('is zero with reduced motion (stagger roles resolve to 0ms)', () => {
    clearRoles();
    clearRoles = setMotionRoles({
      ...DEFAULT_ROLES,
      '--duration-stagger-item': '0ms',
      '--duration-stagger-module': '0ms',
    });
    expect(staggerDelay(3)).toBe(0);
    expect(staggerDelay(3, 'module')).toBe(0);
  });
});
