// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import storyProducts from '../i18n/locales/storyProducts';
import { DiscoverStory } from './DiscoverStory';

const copy = storyProducts.discoverStory;

function memory(id: string, title: string, photo: boolean): StoryItem {
  return {
    kind: 'MEMORY',
    effectiveDate: new Date('2026-08-24T00:00:00Z'),
    memory: {
      id,
      title,
      happenedOn: new Date('2026-08-24T00:00:00Z'),
      author: { id: 'a', displayName: 'Lea Sommer' },
      attachments: photo
        ? [
            {
              id: `${id}-photo`,
              position: 0,
              hasThumbnail: true,
              isSensitive: false,
            },
          ]
        : [],
    },
  } as unknown as StoryItem;
}

function heart(id: string, text: string): StoryItem {
  return {
    kind: 'HEART_MOMENT',
    effectiveDate: new Date('2026-08-12T00:00:00Z'),
    heartMoment: {
      id,
      text,
      emotion: 'GRATEFUL',
      author: { id: 'b', displayName: 'Alex Winter' },
      attachment: null,
      visibility: 'SHARED',
    },
  } as unknown as StoryItem;
}

function milestone(id: string, title: string): StoryItem {
  return {
    kind: 'MILESTONE',
    effectiveDate: new Date('2026-08-01T00:00:00Z'),
    milestone: { id, title, author: { id: 'a', displayName: 'Lea Sommer' } },
  } as unknown as StoryItem;
}

// Canonical order of the curated selection (deliberately mixed).
const ITEMS = [
  heart('h-1', 'Thank you for yesterday'),
  memory('m-1', 'Am See', true),
  milestone('s-1', 'Eingezogen'),
  memory('m-2', 'Konzertabend', true),
  memory('m-3', 'Filmabend', false),
];

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function renderStory(items = ITEMS) {
  const onOpen = vi.fn();
  const loadMemoryImage = vi.fn(
    () => new Promise<never>(() => {}),
  ) as unknown as Parameters<typeof DiscoverStory>[0]['loadMemoryImage'];
  const view = render(
    <MemoryRouter>
      <DiscoverStory
        items={items}
        loadMemoryImage={loadMemoryImage}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  return { ...view, onOpen, loadMemoryImage };
}

function openLink() {
  return screen.getByRole('link', { name: new RegExp(`^${copy.open}:`) });
}

/** jsdom has no AnimationEvent; React then listens to the prefixed name. */
function endProgress(container: HTMLElement) {
  const fill = currentFill(container);
  fireEvent.animationEnd(fill);
  fireEvent(fill, new Event('webkitAnimationEnd', { bubbles: true }));
}

function currentFill(container: HTMLElement) {
  const fill = container.querySelector(
    '.momente-story-segment[data-state="current"] .momente-story-segment-fill',
  );
  if (!fill) throw new Error('No current progress segment.');
  return fill;
}

beforeEach(() => {
  mockReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('DiscoverStory', () => {
  it('builds themed bubbles and starts with the first photo', () => {
    const { container } = renderStory();
    const themes = screen.getByRole('list', { name: copy.themesLabel });
    const bubbles = within(themes).getAllByRole('button');
    expect(
      bubbles.map(
        (bubble) =>
          bubble.querySelector('.momente-story-bubble-label')?.textContent,
      ),
    ).toEqual([
      `${copy.theme.photos}, 2 Momente`,
      `${copy.theme.heartMoments}, 1 Moment`,
      `${copy.theme.milestones}, 1 Moment`,
      `${copy.theme.words}, 1 Moment`,
    ]);
    expect(bubbles[0].getAttribute('aria-current')).toBe('true');
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-1');
    expect(container.querySelectorAll('.momente-story-segment')).toHaveLength(
      2,
    );
    // Only the visible and the next slide are mounted.
    const slides = container.querySelectorAll('.momente-story-slide');
    expect(
      Array.from(slides, (slide) => slide.getAttribute('data-state')),
    ).toEqual(['current', 'upcoming']);
    expect(slides[1].hasAttribute('inert')).toBe(true);
    expect(slides[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('pages with the tap zones and continues with the next theme', () => {
    renderStory();
    const next = screen.getByRole('button', { name: copy.next });
    const previous = screen.getByRole('button', { name: copy.previous });
    const visited = [openLink().getAttribute('href')];
    for (let index = 0; index < 4; index++) {
      fireEvent.click(next);
      visited.push(openLink().getAttribute('href'));
    }
    expect(visited).toEqual([
      '/story/memories/m-1',
      '/story/memories/m-2',
      '/story/heart-moments/h-1',
      '/story/milestones/s-1',
      '/story/memories/m-3',
    ]);
    fireEvent.click(previous);
    expect(openLink().getAttribute('href')).toBe('/story/milestones/s-1');
    // An explicit "next" on the very last slide starts over.
    fireEvent.click(next);
    fireEvent.click(next);
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-1');
  });

  it('pages with ArrowLeft and ArrowRight while the viewer has focus', () => {
    const { container } = renderStory();
    const viewer = container.querySelector('.momente-story-viewer');
    if (!(viewer instanceof HTMLElement)) throw new Error('No viewer.');
    viewer.focus();
    fireEvent.keyDown(viewer, { key: 'ArrowRight' });
    fireEvent.keyDown(viewer, { key: 'ArrowRight' });
    expect(openLink().getAttribute('href')).toBe('/story/heart-moments/h-1');
    expect(viewer.getAttribute('aria-label')).toBe(copy.theme.heartMoments);
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' });
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-2');
  });

  it('opens a theme from its bubble and mutes the ring of seen themes', () => {
    renderStory();
    const bubbles = within(
      screen.getByRole('list', { name: copy.themesLabel }),
    ).getAllByRole('button');
    fireEvent.click(bubbles[2]);
    expect(openLink().getAttribute('href')).toBe('/story/milestones/s-1');
    expect(bubbles[2].getAttribute('aria-current')).toBe('true');
    expect(bubbles[0].getAttribute('data-seen')).toBe('true');
    expect(bubbles[0].textContent).toContain(copy.themeSeen);
    expect(bubbles[1].hasAttribute('data-seen')).toBe(false);
  });

  it('keeps link semantics and passes navigation to the caller', () => {
    const { onOpen } = renderStory();
    fireEvent.click(openLink());
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/m-1',
    );
  });

  it('advances when the progress animation ends and honours the pause toggle', () => {
    const { container } = renderStory();
    const story = container.querySelector('.momente-story');
    expect(story?.getAttribute('data-autoplay')).toBe('true');
    expect(story?.getAttribute('data-playing')).toBe('true');
    endProgress(container);
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-2');

    fireEvent.click(screen.getByRole('button', { name: copy.pause }));
    expect(story?.getAttribute('data-playing')).toBe('false');
    endProgress(container);
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-2');

    fireEvent.click(screen.getByRole('button', { name: copy.play }));
    expect(story?.getAttribute('data-playing')).toBe('true');
    endProgress(container);
    expect(openLink().getAttribute('href')).toBe('/story/heart-moments/h-1');
  });

  it('stops autoplay after the last slide and plays again from the start', () => {
    const { container } = renderStory([heart('h-1', 'Danke')]);
    endProgress(container);
    expect(
      container.querySelector('.momente-story')?.getAttribute('data-playing'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: copy.play }));
    expect(screen.getByRole('button', { name: copy.pause })).toBeTruthy();
  });

  it('pauses while pressed and treats a long press as no tap', () => {
    vi.useFakeTimers();
    const { container } = renderStory();
    const story = container.querySelector('.momente-story');
    const next = screen.getByRole('button', { name: copy.next });
    fireEvent.pointerDown(next, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(story?.getAttribute('data-playing')).toBe('false');
    fireEvent.pointerUp(next, { button: 0 });
    fireEvent.click(next);
    expect(story?.getAttribute('data-playing')).toBe('true');
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-1');
    // A quick tap pages without pausing.
    fireEvent.pointerDown(next, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.pointerUp(next, { button: 0 });
    fireEvent.click(next);
    expect(story?.getAttribute('data-playing')).toBe('true');
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-2');
    // No hold timer is left behind; only the resting-controls timer runs,
    // and it ends on its own.
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses while the document is hidden', () => {
    const { container } = renderStory();
    const story = container.querySelector('.momente-story');
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(story?.getAttribute('data-playing')).toBe('false');
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(story?.getAttribute('data-playing')).toBe('true');
    visibility.mockRestore();
  });

  it('has no autoplay, timer or pause toggle under reduced motion', () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const { container } = renderStory();
    const story = container.querySelector('.momente-story');
    expect(story?.getAttribute('data-autoplay')).toBe('false');
    expect(story?.getAttribute('data-playing')).toBe('false');
    expect(screen.queryByRole('button', { name: copy.pause })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.play })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    endProgress(container);
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-1');
    expect(vi.getTimerCount()).toBe(0);
    // Manual paging still works.
    fireEvent.click(screen.getByRole('button', { name: copy.next }));
    expect(openLink().getAttribute('href')).toBe('/story/memories/m-2');
  });

  it('starts again from the first theme when the selection changes', () => {
    const { rerender } = renderStory();
    fireEvent.click(screen.getByRole('button', { name: copy.next }));
    fireEvent.click(screen.getByRole('button', { name: copy.next }));
    expect(openLink().getAttribute('href')).toBe('/story/heart-moments/h-1');
    rerender(
      <MemoryRouter>
        <DiscoverStory
          items={[milestone('s-9', 'Neu'), heart('h-9', 'Hallo')]}
          loadMemoryImage={vi.fn() as never}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(openLink().getAttribute('href')).toBe('/story/heart-moments/h-9');
  });

  it('renders nothing for an empty selection', () => {
    const { container } = renderStory([]);
    expect(container.querySelector('.momente-story')).toBeNull();
  });

  describe('resting controls', () => {
    function viewerOf(container: HTMLElement) {
      const viewer = container.querySelector('.momente-story-viewer');
      if (!(viewer instanceof HTMLElement)) throw new Error('No viewer.');
      return viewer;
    }

    it('fades the controls after a quiet moment and wakes them on a touch', () => {
      vi.useFakeTimers();
      const { container } = renderStory();
      const viewer = viewerOf(container);
      expect(viewer.hasAttribute('data-controls')).toBe(false);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(viewer.getAttribute('data-controls')).toBe('quiet');
      // The controls stay in the document for assistive technology.
      expect(openLink()).toBeTruthy();
      fireEvent.pointerDown(viewer, { button: 0 });
      expect(viewer.hasAttribute('data-controls')).toBe(false);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(viewer.getAttribute('data-controls')).toBe('quiet');
      fireEvent.focus(viewer);
      expect(viewer.hasAttribute('data-controls')).toBe(false);
    });

    it('keeps the controls while the story is paused', () => {
      vi.useFakeTimers();
      const { container } = renderStory();
      const viewer = viewerOf(container);
      fireEvent.click(screen.getByRole('button', { name: copy.pause }));
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(viewer.hasAttribute('data-controls')).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: copy.play }));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(viewer.getAttribute('data-controls')).toBe('quiet');
    });
  });

  describe('with the "Wisst ihr noch?" lead', () => {
    const lead = {
      key: 'MEMORY:lead-1',
      path: '/story/memories/lead-1',
      kindLabel: 'Special moment',
      title: 'That day at the lake',
      content: <p className="lead-content">That day at the lake</p>,
      face: <span className="lead-face" />,
    };

    function renderWithLead(items = ITEMS) {
      const onOpen = vi.fn();
      const view = render(
        <MemoryRouter>
          <DiscoverStory
            lead={lead}
            items={items}
            loadMemoryImage={vi.fn() as never}
            onOpen={onOpen}
          />
        </MemoryRouter>,
      );
      return { ...view, onOpen };
    }

    it('plays the lead as the first slide in a theme of its own', () => {
      const { container } = renderWithLead();
      const bubbles = within(
        screen.getByRole('list', { name: copy.themesLabel }),
      ).getAllByRole('button');
      expect(bubbles.map((bubble) => bubble.dataset.storyTheme)).toEqual([
        'remember',
        'photos',
        'heartMoments',
        'milestones',
        'words',
      ]);
      expect(bubbles[0].getAttribute('aria-current')).toBe('true');
      expect(bubbles[0].textContent).toContain(copy.theme.remember);
      expect(bubbles[0].querySelector('.lead-face')).not.toBeNull();

      const viewer = container.querySelector('.momente-story-viewer');
      expect(viewer?.getAttribute('data-story-theme')).toBe('remember');
      expect(viewer?.getAttribute('aria-label')).toBe(copy.theme.remember);
      expect(container.querySelectorAll('.momente-story-segment')).toHaveLength(
        1,
      );
      const current = container.querySelector(
        '.momente-story-slide[data-state="current"]',
      );
      expect(current?.getAttribute('data-story-slide')).toBe('lead');
      expect(current?.querySelector('.lead-content')).not.toBeNull();
      // The composition holds no link; the story's open action opens it.
      expect(current?.querySelector('a')).toBeNull();
      expect(openLink().getAttribute('href')).toBe('/story/memories/lead-1');
      expect(openLink().getAttribute('aria-label')).toBe(
        copy.openName
          .replace('{{kind}}', 'Special moment')
          .replace('{{title}}', 'That day at the lake'),
      );
    });

    it('continues with the curated themes and returns to the lead', () => {
      const { onOpen } = renderWithLead();
      const next = screen.getByRole('button', { name: copy.next });
      fireEvent.click(next);
      expect(openLink().getAttribute('href')).toBe('/story/memories/m-1');
      fireEvent.click(screen.getByRole('button', { name: copy.previous }));
      expect(openLink().getAttribute('href')).toBe('/story/memories/lead-1');
      fireEvent.click(openLink());
      expect(onOpen).toHaveBeenCalledWith(
        expect.anything(),
        '/story/memories/lead-1',
      );
    });

    it('advances from the lead when its progress ends', () => {
      const { container } = renderWithLead();
      endProgress(container);
      expect(openLink().getAttribute('href')).toBe('/story/memories/m-1');
    });

    it('plays the lead alone when the curated selection is empty', () => {
      const { container } = renderWithLead([]);
      expect(container.querySelector('.momente-story')).not.toBeNull();
      expect(container.querySelectorAll('.momente-story-bubble')).toHaveLength(
        1,
      );
      expect(openLink().getAttribute('href')).toBe('/story/memories/lead-1');
    });
  });
});
