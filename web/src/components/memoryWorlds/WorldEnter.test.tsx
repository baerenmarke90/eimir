// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorldEntered, WorldEnter } from './WorldEnter';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function Seen() {
  return <p data-testid="seen">{useWorldEntered() ? 'seen' : 'unseen'}</p>;
}

function Panel({ hidden }: { hidden?: boolean }) {
  return (
    <div data-primary-tab="/story" hidden={hidden}>
      <WorldEnter cover={<p>loading</p>}>
        <Seen />
      </WorldEnter>
    </div>
  );
}

const seen = () => document.querySelector('[data-testid="seen"]')?.textContent;
const world = () => document.querySelector<HTMLElement>('.memory-world-enter');

const stage = () => document.querySelector<HTMLElement>('.memory-world-stage');

async function settle() {
  for (let step = 0; step < 300; step += 1)
    await act(() => vi.advanceTimersByTimeAsync(16));
}

it('cross-fades into a world that is shown', async () => {
  render(<Panel />);
  await settle();
  expect(stage()?.dataset.entered).toBe('true');
  expect(stage()?.dataset.enter).toBeUndefined();
});

it('lets a world that enters in a hidden tab be there at once when the tab is shown', async () => {
  // A hidden tab skips its style, so a cross-fade started there would only
  // play when the tab is shown: the loading card would show again.
  render(<Panel hidden />);
  await settle();
  expect(stage()?.dataset.entered).toBe('true');
  expect(stage()?.dataset.enter).toBe('instant');
});

it('starts the own entrance of a world only once it is seen', async () => {
  // A tab built ahead enters its world unseen; the prints of the Stapel must
  // still fall in front of the person, not while the tab is hidden.
  const view = render(<Panel hidden />);
  await settle();
  expect(stage()?.dataset.entered).toBe('true');
  expect(seen()).toBe('unseen');
  expect(world()?.dataset.seen).toBe('false');

  view.rerender(<Panel />);
  await act(() => vi.advanceTimersByTimeAsync(16));
  expect(seen()).toBe('seen');
  expect(world()?.dataset.seen).toBe('true');
});

it('counts a world that enters while shown as seen', async () => {
  render(<Panel />);
  await settle();
  expect(seen()).toBe('seen');
});
