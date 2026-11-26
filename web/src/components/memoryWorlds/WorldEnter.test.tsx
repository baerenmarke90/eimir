// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorldEnter } from './WorldEnter';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function Panel({ hidden }: { hidden?: boolean }) {
  return (
    <div data-primary-tab="/story" hidden={hidden}>
      <WorldEnter cover={<p>loading</p>}>
        <p>world</p>
      </WorldEnter>
    </div>
  );
}

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
