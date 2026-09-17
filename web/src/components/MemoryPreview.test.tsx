// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryPreview } from './MemoryPreview';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  private readonly callback: IntersectionObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }

  trigger(target: Element) {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal(
    'IntersectionObserver',
    MockIntersectionObserver as unknown as typeof IntersectionObserver,
  );
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MemoryPreview viewport loading', () => {
  it('defers the authenticated loader until media is near the viewport', async () => {
    const loadImage = vi.fn().mockResolvedValue('blob:near-viewport');
    const { container } = render(
      <MemoryPreview
        memoryId="memory-1"
        attachmentId="attachment-1"
        loadImage={loadImage}
        loadingMode="near-viewport"
      />,
    );

    const skeleton = container.querySelector<HTMLElement>(
      '[data-media-deferred="true"]',
    );
    expect(skeleton).not.toBeNull();
    expect(loadImage).not.toHaveBeenCalled();
    expect(MockIntersectionObserver.instances[0].rootMargin).toBe('75% 0px');

    act(() => {
      if (!skeleton) throw new Error('Expected deferred media skeleton.');
      MockIntersectionObserver.instances[0].trigger(skeleton);
    });

    await waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    expect(loadImage).toHaveBeenCalledWith('memory-1', 'attachment-1');
    const image = await screen.findByRole('img');
    expect(image.getAttribute('src')).toBe('blob:near-viewport');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('decoding')).toBe('async');
  });

  it('keeps the existing immediate behavior for non-Timeline consumers', async () => {
    const loadImage = vi.fn().mockResolvedValue('blob:immediate');
    render(
      <MemoryPreview
        memoryId="memory-2"
        attachmentId="attachment-2"
        loadImage={loadImage}
      />,
    );

    await waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });
});
