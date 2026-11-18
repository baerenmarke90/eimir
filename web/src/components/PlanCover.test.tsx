// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { PlanCover } from './PlanCover';

vi.mock('../client/storyMediaLoader', () => ({
  loadAuthorizedStoryImageResource: vi.fn(async () => ({
    url: 'blob:plan-preview',
    dispose: vi.fn(),
  })),
}));

let admit: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();
const plan = {
  id: 'plan-1',
  title: 'Our concert',
  coverAttachment: {
    id: 'photo-1',
    hasThumbnail: true,
    isSensitive: false,
    width: 600,
    height: 900,
  },
} as PlanDetail;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        admit = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    'URL',
    class extends URL {
      static revokeObjectURL = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Plan cover admission', () => {
  it('defers authorized preview bytes until near the viewport and keeps the parent scope', async () => {
    const { container } = render(
      <PlanCover
        plan={plan}
        spaceId="space-1"
        apiBaseUrl="https://eimir.test"
        accessToken="token"
        presentation="preview"
      />,
    );
    const preview = container.querySelector('[data-media-deferred="true"]');
    expect(preview).not.toBeNull();
    expect(observe).toHaveBeenCalledWith(preview);
    expect(loadAuthorizedStoryImageResource).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    act(() =>
      admit(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    await screen.findByRole('img', { name: plan.title });
    expect(loadAuthorizedStoryImageResource).toHaveBeenCalledWith(
      expect.anything(),
      'space-1',
      'PLAN',
      plan.id,
      'photo-1',
      { signal: expect.any(AbortSignal), variant: 'thumbnail' },
    );
    expect(disconnect).toHaveBeenCalled();
  });

  it('loads a detail cover immediately using the original variant', async () => {
    render(
      <PlanCover
        plan={plan}
        spaceId="space-1"
        apiBaseUrl="https://eimir.test"
        accessToken="token"
      />,
    );
    await waitFor(() =>
      expect(loadAuthorizedStoryImageResource).toHaveBeenCalledTimes(1),
    );
    expect(observe).not.toHaveBeenCalled();
    expect(
      vi.mocked(loadAuthorizedStoryImageResource).mock.calls[0][5]?.variant,
    ).toBe('original');
  });
});
