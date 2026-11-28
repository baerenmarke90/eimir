// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PrimaryTabActiveContext,
  usePrimaryTabReturn,
} from './primaryTabActive';

afterEach(() => {
  cleanup();
});

function Probe({ onReturn }: { onReturn: () => void }) {
  usePrimaryTabReturn(onReturn);
  return null;
}

function renderTab(active: boolean, onReturn: () => void) {
  return (
    <PrimaryTabActiveContext.Provider value={active}>
      <Probe onReturn={onReturn} />
    </PrimaryTabActiveContext.Provider>
  );
}

it('calls back each time a parked tab is shown again, never on its first view (#2345)', () => {
  const onReturn = vi.fn();
  const view = render(renderTab(true, onReturn));
  expect(onReturn).not.toHaveBeenCalled();
  view.rerender(renderTab(false, onReturn));
  expect(onReturn).not.toHaveBeenCalled();
  view.rerender(renderTab(true, onReturn));
  expect(onReturn).toHaveBeenCalledTimes(1);
  view.rerender(renderTab(true, onReturn));
  expect(onReturn).toHaveBeenCalledTimes(1);
  view.rerender(renderTab(false, onReturn));
  view.rerender(renderTab(true, onReturn));
  expect(onReturn).toHaveBeenCalledTimes(2);
});

it('waits for a tab that is first built parked until it is shown', () => {
  const onReturn = vi.fn();
  const view = render(renderTab(false, onReturn));
  view.rerender(renderTab(true, onReturn));
  expect(onReturn).toHaveBeenCalledTimes(1);
});
