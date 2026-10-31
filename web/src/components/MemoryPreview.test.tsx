// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryPreview } from './MemoryPreview';
import { PreviewCardLink } from './PreviewCardLink';
import de from '../i18n/locales/de';

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
        isSensitive={false}
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
    expect(loadImage).toHaveBeenCalledWith(
      'memory-1',
      'attachment-1',
      expect.any(AbortSignal),
    );
    const image = await screen.findByRole('img');
    expect(image.getAttribute('src')).toBe('blob:near-viewport');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('decoding')).toBe('async');
  });

  it('keeps the existing immediate behavior for non-Timeline consumers', async () => {
    const loadImage = vi.fn().mockResolvedValue('blob:immediate');
    render(
      <MemoryPreview
        isSensitive={false}
        memoryId="memory-2"
        attachmentId="attachment-2"
        loadImage={loadImage}
      />,
    );

    await waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });
});

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

describe('sensitive overview previews', () => {
  const loadImage = vi.fn(async () => 'blob:protected');
  function preview(
    isSensitive: boolean | undefined = true,
    resourceScopeKey = 'account:space',
  ) {
    return (
      <MemoryRouter initialEntries={['/today']}>
        <PreviewCardLink to="/story/memories/memory" aria-label="Open memory">
          <MemoryPreview
            memoryId="memory"
            attachmentId="photo"
            isSensitive={isSensitive}
            allowReveal
            resourceScopeKey={resourceScopeKey}
            loadImage={loadImage}
          />
          <h3>Our evening</h3>
        </PreviewCardLink>
        <CurrentPath />
      </MemoryRouter>
    );
  }

  it('blurs before paint and only the independent Privacy button reveals without navigation', async () => {
    const view = render(preview());
    expect(screen.queryByRole('img')).toBeNull();
    const button = screen.getByRole('button', { name: 'Bild anzeigen' });
    expect(button.closest('a')).toBeNull();
    expect(button.querySelector('.eimir-icon-privatsphaere')).not.toBeNull();
    await waitFor(() =>
      expect(
        view.container.querySelector('.sensitive-media-blurred img'),
      ).not.toBeNull(),
    );
    fireEvent.click(
      view.container.querySelector('.sensitive-media-blurred img')!,
    );
    expect(button.getAttribute('aria-pressed')).toBe('false');
    const readsBeforeReveal = loadImage.mock.calls.length;
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('path').textContent).toBe('/today');
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:protected');
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard(' ');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bild anzeigen' })).toBe(button);
    expect(loadImage.mock.calls.length).toBe(readsBeforeReveal);
    fireEvent.click(screen.getByRole('link', { name: 'Open memory' }));
    expect(screen.getByTestId('path').textContent).toBe(
      '/story/memories/memory',
    );
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('conceals on pagehide, native background, scope replacement and reclassification', async () => {
    const view = render(preview());
    await waitFor(() =>
      expect(
        view.container.querySelector('.sensitive-media-blurred img'),
      ).not.toBeNull(),
    );
    const reveal = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
    reveal();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(screen.queryByRole('img')).toBeNull();
    reveal();
    act(() => focusManager.setFocused(false));
    expect(screen.queryByRole('img')).toBeNull();
    act(() => focusManager.setFocused(undefined));
    reveal();
    view.rerender(preview(true, 'other-account:space'));
    expect(screen.queryByRole('img')).toBeNull();
    reveal();
    view.rerender(preview(false, 'other-account:space'));
    view.rerender(preview(true, 'other-account:space'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bild anzeigen' })).toBeTruthy();
  });

  it('never loads or reveals unknown classification, and retains a safe error fallback', async () => {
    loadImage.mockClear();
    const unknown = render(
      <MemoryPreview
        memoryId="unknown"
        attachmentId="unknown"
        allowReveal
        loadImage={loadImage}
      />,
    );
    loadImage.mockClear();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(loadImage).not.toHaveBeenCalled();
    unknown.unmount();
    const error = render(
      <MemoryPreview
        memoryId="failed"
        attachmentId="failed"
        isSensitive
        allowReveal
        loadImage={async () => {
          throw new Error('unavailable');
        }}
      />,
    );
    await waitFor(() =>
      expect(error.container.textContent).toContain(de.media.unavailable),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
    expect(
      error.container.querySelector('.sensitive-media-cover'),
    ).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('defers marked media until its viewport sentinel is reached', async () => {
    loadImage.mockClear();
    const view = render(
      <MemoryPreview
        memoryId="deferred"
        attachmentId="photo"
        isSensitive
        allowReveal
        loadingMode="near-viewport"
        loadImage={loadImage}
      />,
    );
    const sentinel = view.container.querySelector<HTMLElement>(
      '[data-media-deferred="true"]',
    )!;
    expect(loadImage).not.toHaveBeenCalled();
    act(() => MockIntersectionObserver.instances[0].trigger(sentinel));
    await waitFor(() =>
      expect(
        view.container.querySelector('.sensitive-media-blurred img'),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
