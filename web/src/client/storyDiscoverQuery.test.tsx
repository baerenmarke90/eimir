// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as stageModule from '../motion/stage';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import type { ReferenceApis } from './referenceFlow';
import { besideMomente, usePrefetchStoryDiscover } from './storyDiscoverQuery';

const selection = {
  items: [],
  lead: null,
  selectionDate: new Date('2026-11-26T00:00:00Z'),
};
let getStoryDiscover: ReturnType<typeof vi.fn>;
let apis: ReferenceApis;
let client: QueryClient;
let release: () => void;

beforeEach(() => {
  getStoryDiscover = vi.fn().mockResolvedValue(selection);
  apis = { story: { getStoryDiscover } } as unknown as ReferenceApis;
  client = new QueryClient();
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(stageModule, 'stagesReleased').mockReturnValue(released);
});

afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('reads Momente ahead once the shown page has its data', async () => {
  renderHook(
    () =>
      usePrefetchStoryDiscover({
        enabled: true,
        apis,
        accountId: 'account',
        spaceId: 'space',
      }),
    { wrapper },
  );
  await act(async () => {});
  // The shown page still waits for its own data: nothing competes with it.
  expect(getStoryDiscover).not.toHaveBeenCalled();

  await act(async () => {
    release();
  });
  await vi.waitFor(() =>
    expect(
      client.getQueryState(authorSummaryQueryKeys.discover('space', 'account'))
        ?.status,
    ).toBe('success'),
  );
  expect(getStoryDiscover).toHaveBeenCalledTimes(1);
  expect(getStoryDiscover).toHaveBeenCalledWith({ spaceId: 'space' });
});

it('reads nothing ahead where it is not enabled', async () => {
  renderHook(
    () =>
      usePrefetchStoryDiscover({
        enabled: false,
        apis,
        accountId: 'account',
        spaceId: 'space',
      }),
    { wrapper },
  );
  await act(async () => {
    release();
  });
  expect(getStoryDiscover).not.toHaveBeenCalled();
});

it('reads ahead only on the tabs a swipe leads to Momente from', () => {
  expect(besideMomente('/today')).toBe(true);
  expect(besideMomente('/plan')).toBe(true);
  expect(besideMomente('/plan/')).toBe(true);
  // Momente itself reads on its own; details and other areas never swipe there.
  expect(besideMomente('/story')).toBe(false);
  expect(besideMomente('/story/memories/memory-1')).toBe(false);
  expect(besideMomente('/more/private/collections/new')).toBe(false);
  expect(besideMomente('/more/collections')).toBe(false);
});
