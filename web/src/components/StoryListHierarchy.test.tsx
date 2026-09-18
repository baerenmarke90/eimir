import '../i18n';
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { StoryItemFromJSON } from '../api/generated/models/StoryItem';
import { i18n } from '../i18n';
import de from '../i18n/locales/de';
import { StoryList } from './StoryList';

const loadImage = () => new Promise<string>(() => {});
const author = { id: 'author-1', displayName: 'Anna-Katharina Lindqvist' };
const capabilities = { canComment: true, canDelete: true, canEdit: true };
const image = (id: string, position = 0) => ({
  id,
  position,
  status: 'READY',
  mediaType: 'IMAGE',
  mimeType: 'image/jpeg',
  hasThumbnail: true,
  width: 800,
  height: 500,
  size: 1,
});

const memory = StoryItemFromJSON({
  kind: 'MEMORY',
  effectiveDate: '2026-08-26',
  memory: {
    id: 'memory-1',
    title: 'Evening at the lake',
    happenedOn: '2026-08-26',
    createdAt: '2026-08-26T08:00:00Z',
    author,
    capabilities,
    attachments: [image('a-1', 0), image('a-2', 1), image('a-3', 2)],
  },
});
const heartMoment = StoryItemFromJSON({
  kind: 'HEART_MOMENT',
  effectiveDate: '2026-08-24',
  heartMoment: {
    id: 'heart-1',
    text: 'Thanks for the coffee.',
    emotion: 'LOVED',
    happenedOn: '2026-08-24',
    createdAt: '2026-08-24T08:00:00Z',
    author,
    capabilities,
    attachment: null,
    visibility: 'SHARED',
  },
});
const privateHeartMoment = StoryItemFromJSON({
  kind: 'HEART_MOMENT',
  effectiveDate: '2026-08-23',
  heartMoment: {
    id: 'heart-2',
    text: 'Just for me to remember.',
    emotion: 'GRATEFUL',
    happenedOn: '2026-08-23',
    createdAt: '2026-08-23T08:00:00Z',
    author,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    attachment: null,
    visibility: 'PRIVATE',
  },
});
const milestone = StoryItemFromJSON({
  kind: 'MILESTONE',
  effectiveDate: '2026-08-20',
  milestone: {
    id: 'milestone-1',
    title: 'Three years together',
    happenedOn: '2026-08-20',
    createdAt: '2026-08-20T08:00:00Z',
    author,
    capabilities,
  },
});

function renderList(items: StoryItem[]) {
  return render(
    <MemoryRouter>
      <StoryList
        items={items}
        loadMemoryImage={loadImage}
        loadHeartMomentImage={loadImage}
      />
    </MemoryRouter>,
  );
}

function cardFor(name: string): HTMLElement {
  return screen.getByRole('link', { name });
}

describe('StoryList card hierarchy (#969)', () => {
  afterEach(() => cleanup());

  it('renders no visible kind or shared pill for any kind', () => {
    const { container } = renderList([memory, heartMoment, milestone]);

    expect(container.querySelector('.kind-badge')).toBeNull();
    expect(container.querySelector('.shared-badge')).toBeNull();
    expect(container.querySelector('.story-card-meta')).toBeNull();
    expect(container.querySelector('.visibility-badge')).toBeNull();
    for (const label of [
      de.story.kind.memory,
      de.story.kind.heartMoment,
      de.story.kind.milestone,
      de.story.shared,
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('keeps the kind in each card link name and marks it on the Timeline node', () => {
    const { container } = renderList([memory, heartMoment, milestone]);

    expect(
      cardFor(`${de.story.kind.memory}: Evening at the lake`),
    ).toBeDefined();
    expect(
      cardFor(
        `${de.story.kind.heartMoment}: Thanks for the coffee. Gefühl: Geliebt`,
      ),
    ).toBeDefined();
    expect(
      cardFor(`${de.story.kind.milestone}: Three years together`),
    ).toBeDefined();

    const markers = Array.from(
      container.querySelectorAll('.story-timeline-marker'),
    );
    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(marker.getAttribute('aria-hidden')).toBe('true');
    }
    // Default Memory: a plain dot. Special kinds: a distinct shape.
    expect(markers[0].className).toBe('story-timeline-marker');
    expect(markers[0].querySelector('svg')).toBeNull();
    expect(markers[1].classList).toContain(
      'story-timeline-marker-heart-moment',
    );
    expect(markers[1].querySelector('svg')).not.toBeNull();
    expect(markers[2].classList).toContain('story-timeline-marker-milestone');
    expect(markers[2].querySelector('svg')).not.toBeNull();
  });

  it('describes each card with its footer metadata', () => {
    renderList([memory, heartMoment]);

    const memoryLink = cardFor(`${de.story.kind.memory}: Evening at the lake`);
    const footerId = memoryLink.getAttribute('aria-describedby');
    expect(footerId).toBeTruthy();
    const footer = document.getElementById(footerId ?? '');
    expect(footer?.classList).toContain('story-card-footer');
    expect(memoryLink.contains(footer)).toBe(true);

    const heartFooterId = cardFor(
      `${de.story.kind.heartMoment}: Thanks for the coffee. Gefühl: Geliebt`,
    ).getAttribute('aria-describedby');
    expect(heartFooterId).not.toBe(footerId);
  });

  it('shows photo count and shared visibility as named icon metadata', () => {
    renderList([memory, heartMoment, milestone]);

    const memoryFooter = within(
      cardFor(`${de.story.kind.memory}: Evening at the lake`),
    );
    const photos = memoryFooter.getByRole('img', { name: '3 Fotos' });
    expect(photos.textContent).toBe('3');
    // Memories are shared by construction; no repeated visibility marker.
    expect(
      memoryFooter.queryByRole('img', { name: de.story.shared }),
    ).toBeNull();

    const heartFooter = within(
      cardFor(
        `${de.story.kind.heartMoment}: Thanks for the coffee. Gefühl: Geliebt`,
      ),
    );
    const shared = heartFooter.getByRole('img', { name: de.story.shared });
    expect(shared.classList).toContain('story-card-visibility-shared');
    expect(shared.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(heartFooter.queryByRole('img', { name: /Foto/ })).toBeNull();

    const milestoneFooter = within(
      cardFor(`${de.story.kind.milestone}: Three years together`),
    );
    expect(
      milestoneFooter.queryByRole('img', { name: de.story.shared }),
    ).toBeNull();
  });

  it("marks the caller's own private HeartMoment with the quiet lock glyph, not a warning pill (#1021)", () => {
    renderList([privateHeartMoment]);

    const privateLabel = i18n.t('visibilityPrivate');
    const footer = within(
      cardFor(
        `${de.story.kind.heartMoment}: Just for me to remember. Gefühl: Dankbar`,
      ),
    );
    const marker = footer.getByRole('img', { name: privateLabel });
    expect(marker.classList).toContain('story-card-visibility-private');
    expect(marker.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    // The card content stays primary; no separate warning/pill element.
    expect(footer.queryByText(privateLabel)).toBeNull();
  });

  it('names the author by first name next to the avatar, without prose', () => {
    const { container } = renderList([milestone]);

    const name = container.querySelector('.story-card-author');
    expect(name?.textContent).toBe('Anna-Katharina');
    // The avatar carries the accessible author name; the visible first
    // name is not read twice.
    expect(name?.getAttribute('aria-hidden')).toBe('true');
    expect(
      screen.getByRole('img', { name: 'Anna-Katharina Lindqvist' }),
    ).toBeDefined();
    expect(container.textContent).not.toContain(
      de.story.byAuthor.replace('{{author}}', 'Anna-Katharina'),
    );
  });

  it('starts every card with its content, not a metadata row', () => {
    const { container } = renderList([memory, heartMoment, milestone]);

    const firstChildren = Array.from(
      container.querySelectorAll('.story-card'),
    ).map((card) => card.firstElementChild);
    expect(firstChildren[0]?.classList).toContain('story-media-skeleton');
    expect(firstChildren[1]?.tagName).toBe('H4');
    expect(firstChildren[2]?.tagName).toBe('H4');
  });
});
