import '../i18n';
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  isSensitive: false,
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

function renderList(items: StoryItem[], currentAccountId?: string) {
  return render(
    <MemoryRouter>
      <StoryList
        items={items}
        loadMemoryImage={loadImage}
        loadHeartMomentImage={loadImage}
        currentAccountId={currentAccountId}
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

  it('moves happiness identity onto its chronology node while retaining both authored answers', () => {
    if (memory.kind !== 'MEMORY') throw new Error('Expected a Memory fixture');
    const happiness: StoryItem = {
      ...memory,
      memory: {
        ...memory.memory,
        attachments: [],
        experienceKind: 'HAPPINESS',
        experienceAnswers: [
          {
            id: 'answer-1',
            author,
            body: 'Our coffee together.',
            version: 1,
            capabilities,
            attachments: [],
          },
          {
            id: 'answer-2',
            author: { id: 'author-2', displayName: 'Sam' },
            body: 'Your smile this morning.',
            version: 1,
            capabilities,
            attachments: [],
          },
        ],
      },
    };
    const { container } = renderList([happiness]);
    const card = cardFor(
      `${i18n.t('coupleExperiences.sharedHappiness')}: Evening at the lake`,
    );
    expect(
      container.querySelector('.story-timeline-marker .eimir-icon-highlights'),
    ).not.toBeNull();
    expect(card.querySelector('.experience-shared-label')).toBeNull();
    expect(card.querySelector('.eimir-icon-highlights')).toBeNull();
    expect(within(card).getByText('Our coffee together.')).toBeDefined();
    expect(within(card).getByText('Your smile this morning.')).toBeDefined();
    expect(within(card).getByText(author.displayName)).toBeDefined();
    expect(within(card).getByText('Sam')).toBeDefined();
    expect(card.getAttribute('href')).toBe('/story/memories/memory-1');
  });

  it.each(['MEMORY', 'HEART_MOMENT'] as const)(
    'keeps a sensitive %s preview concealed with a direct detail link and no reveal action',
    async (kind) => {
      const item = kind === 'MEMORY' ? memory : heartMoment;
      const attachment = { ...image('sensitive-photo'), isSensitive: true };
      const sensitive =
        item.kind === 'MEMORY'
          ? { ...item, memory: { ...item.memory, attachments: [attachment] } }
          : item.kind === 'HEART_MOMENT'
            ? { ...item, heartMoment: { ...item.heartMoment, attachment } }
            : item;
      const { container } = render(
        <MemoryRouter>
          <StoryList
            items={[sensitive as StoryItem]}
            loadMemoryImage={async () => 'blob:sensitive-preview'}
            loadHeartMomentImage={async () => 'blob:sensitive-preview'}
          />
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(
          container.querySelector('.sensitive-media-blurred img'),
        ).not.toBeNull(),
      );
      expect(screen.queryByRole('button')).toBeNull();
      const preview = container.querySelector('.sensitive-media-preview');
      if (!preview) throw new Error('Expected a sensitive preview');
      expect(within(preview as HTMLElement).queryByRole('img')).toBeNull();
      expect(screen.getByText(i18n.t('sensitiveMedia.label'))).toBeDefined();
      const card = screen.getByRole('link');
      expect(
        card.contains(container.querySelector('.sensitive-media-cover')),
      ).toBe(true);
      fireEvent.mouseEnter(card);
      fireEvent.focus(card);
      expect(container.querySelector('.sensitive-media-cover')).not.toBeNull();
      expect(card.getAttribute('href')).toBe(
        kind === 'MEMORY'
          ? '/story/memories/memory-1'
          : '/story/heart-moments/heart-1',
      );
    },
  );

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

  it('omits the partner avatar from the Diary overview', () => {
    const { container } = renderList([milestone], 'viewer-2');

    expect(container.querySelector('.story-card-author')).toBeNull();
    expect(container.querySelector('.momente-author-meta .sr-only')).toBeNull();
    expect(
      screen.queryByRole('img', { name: 'Anna-Katharina Lindqvist' }),
    ).toBeNull();
    expect(container.textContent).not.toContain(
      i18n.t('story.byAuthor', { author: 'Anna-Katharina' }),
    );
  });

  it('omits the current viewer avatar from the Diary overview', () => {
    const { container } = renderList([milestone], 'author-1');

    expect(container.querySelector('.story-card-author')).toBeNull();
    expect(container.querySelector('.momente-author-meta .sr-only')).toBeNull();
    expect(
      screen.queryByRole('img', { name: 'Anna-Katharina Lindqvist' }),
    ).toBeNull();
    expect(container.textContent).not.toContain(
      i18n.t('story.byAuthor', { author: i18n.t('story.authorSelf') }),
    );
  });

  it('gives titled photo memories the same photo-led hierarchy as untitled entries', () => {
    const { container } = renderList([memory]);
    const link = container.querySelector('.story-card-link');
    expect(link?.classList.contains('story-card-photo-led')).toBe(true);
    expect(
      screen.getByRole('heading', { name: 'Evening at the lake' }),
    ).toBeDefined();
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
