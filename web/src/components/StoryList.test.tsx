import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { StoryItemFromJSON } from '../api/generated/models/StoryItem';
import { StoryList } from './StoryList';

const loadMemoryImage = async () => 'blob:test-image';
const loadHeartMomentImage = async () => 'blob:test-heart-image';

describe('StoryList', () => {
  it('renders a generated MEMORY discriminator with semantic list markup', () => {
    const item = StoryItemFromJSON({
      kind: 'MEMORY',
      effectiveDate: '2026-08-26',
      memory: {
        attachments: [],
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'A',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: '2026-08-26T08:00:00Z',
        happenedOn: '2026-08-26',
        id: '00000000-0000-0000-0000-000000000002',
        title: 'Am See',
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[item]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('<ol');
    expect(html).toContain('aria-label="Gemeinsame Story"');
    expect(html).toContain('Erinnerung');
    expect(html).toContain('Am See');
    expect(html).toContain('<time');
    expect(html).toContain('class="story-card-link"');
    expect(html).toContain(
      'href="/story/memories/00000000-0000-0000-0000-000000000002"',
    );
    expect(html).toContain('aria-label="Erinnerung: Am See"');
    expect(html).not.toContain('Erinnerung öffnen');
  });

  it('uses the whole HeartMoment and Milestone card as the deep link', () => {
    const heartMoment = {
      kind: 'HEART_MOMENT',
      effectiveDate: new Date('2026-08-26T00:00:00Z'),
      heartMoment: {
        id: 'heart-1',
        text: 'Thanks for today.',
        emotion: 'GRATEFUL',
        author: { id: 'author-1', displayName: 'A' },
        attachment: null,
        visibility: 'SHARED',
      },
    } as unknown as StoryItem;
    const milestone = {
      kind: 'MILESTONE',
      effectiveDate: new Date('2026-08-25T00:00:00Z'),
      milestone: {
        id: 'milestone-1',
        title: 'First apartment',
        body: null,
        author: { id: 'author-2', displayName: 'B' },
      },
    } as unknown as StoryItem;

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[heartMoment, milestone]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('href="/story/heart-moments/heart-1"');
    expect(html).toContain(
      'aria-label="Herzmoment: Thanks for today. Gefühl: Dankbar"',
    );
    expect(html).toContain('href="/story/milestones/milestone-1"');
    expect(html).toContain('aria-label="Meilenstein: First apartment"');
    expect(html).not.toContain('Herzmoment öffnen');
    expect(html).not.toContain('Meilenstein öffnen');
  });

  it('renders date and author together in the shared card footer', () => {
    const item = StoryItemFromJSON({
      kind: 'MEMORY',
      effectiveDate: '2026-08-26',
      memory: {
        attachments: [],
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'Alex',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: '2026-08-26T08:00:00Z',
        happenedOn: '2026-08-26',
        id: '00000000-0000-0000-0000-000000000002',
        title: 'Strandspaziergang',
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[item]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('class="story-card-footer"');
    expect(html).toContain('<time');
    expect(html).toContain('story-card-footer-author');
    // #969 keeps the visible row compact; #1019 gives the same metadata an
    // explicit accessible attribution.
    expect(html).toContain('>Alex</span>');
    expect(html).toContain('aria-label="von Alex"');
    expect(html).not.toContain('>von Alex</span>');
  });

  it('shows only the first name in Timeline attribution, never the full display name (#791 second follow-up)', () => {
    const item = StoryItemFromJSON({
      kind: 'MEMORY',
      effectiveDate: '2026-08-26',
      memory: {
        attachments: [],
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'Alex Winter',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: '2026-08-26T08:00:00Z',
        happenedOn: '2026-08-26',
        id: '00000000-0000-0000-0000-000000000002',
        title: 'Strandspaziergang',
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[item]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );

    // The visible byAuthor attribution text is first-name-only. (The
    // avatar's own aria-label is a separate, pre-existing accessibility
    // label unrelated to this fix and out of #791's scope, which is why
    // this doesn't assert on "Alex Winter" absence overall.)
    expect(html).toContain('>Alex</span>');
    expect(html).not.toContain('>Alex Winter</span>');
  });

  it('renders large image-led card when attachment exists and text-first card when absent (#860)', () => {
    const memoryWithImage = StoryItemFromJSON({
      kind: 'MEMORY',
      effectiveDate: '2026-08-26',
      memory: {
        attachments: [
          {
            id: 'att-1',
            position: 0,
            status: 'READY',
            mediaType: 'IMAGE',
            mimeType: 'image/jpeg',
            hasThumbnail: true,
            width: 800,
            height: 800,
            size: 1024,
          },
        ],
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'A',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: '2026-08-26T08:00:00Z',
        happenedOn: '2026-08-26',
        id: '00000000-0000-0000-0000-000000000002',
        title: 'With Image',
      },
    });

    const memoryWithoutImage = StoryItemFromJSON({
      kind: 'MEMORY',
      effectiveDate: '2026-08-25',
      memory: {
        attachments: [],
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'A',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: '2026-08-25T08:00:00Z',
        happenedOn: '2026-08-25',
        id: '00000000-0000-0000-0000-000000000003',
        title: 'Without Image',
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[memoryWithImage, memoryWithoutImage]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('story-card-memory has-image');
    expect(html).toContain('story-card-memory no-image');
    expect(html).toContain('story-timeline-marker');
    expect(html).not.toContain('marker-berry');
    expect(html).not.toContain('marker-teal');
    expect(html).not.toContain('story-card-thumb');
    expect(html).not.toContain('story-card-reference');
  });

  it('keeps a Heart Moment with a real attachment image-led', () => {
    const heartMoment = StoryItemFromJSON({
      kind: 'HEART_MOMENT',
      effectiveDate: '2026-08-24',
      heartMoment: {
        id: '00000000-0000-0000-0000-000000000010',
        text: 'A small note with a photo',
        emotion: 'LOVED',
        happenedOn: '2026-08-24',
        createdAt: '2026-08-24T08:00:00Z',
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'A',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        attachment: {
          id: 'att-heart-1',
          status: 'READY',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          hasThumbnail: true,
          width: 800,
          height: 800,
          size: 1024,
        },
        visibility: 'SHARED',
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[heartMoment]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('story-card-heart-moment has-image');
    expect(html).toContain('story-media-skeleton');
    expect(html).toContain('A small note with a photo');
  });

  it('opts Timeline rendering into one-time reveal and deferred media without changing shared list defaults', () => {
    const item = StoryItemFromJSON({
      kind: 'MEMORY',
      effectiveDate: '2026-08-26',
      memory: {
        attachments: [
          {
            id: 'att-progressive',
            position: 0,
            status: 'READY',
            mediaType: 'IMAGE',
            mimeType: 'image/jpeg',
            hasThumbnail: true,
            width: 800,
            height: 800,
            size: 1024,
          },
        ],
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'A',
        },
        capabilities: { canComment: true, canDelete: true, canEdit: true },
        createdAt: '2026-08-26T08:00:00Z',
        happenedOn: '2026-08-26',
        id: '00000000-0000-0000-0000-000000000099',
        title: 'Progressive memory',
      },
    });

    const progressiveHtml = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[item]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
          progressiveReveal
        />
      </MemoryRouter>,
    );
    const sharedHtml = renderToStaticMarkup(
      <MemoryRouter>
        <StoryList
          items={[item]}
          loadMemoryImage={loadMemoryImage}
          loadHeartMomentImage={loadHeartMomentImage}
        />
      </MemoryRouter>,
    );

    expect(progressiveHtml).toContain('story-timeline-progressive-reveal');
    expect(progressiveHtml).toContain('data-timeline-reveal-key="item:');
    expect(progressiveHtml).toContain('data-media-deferred="true"');
    expect(sharedHtml).not.toContain('story-timeline-progressive-reveal');
    expect(sharedHtml).not.toContain('data-media-deferred="true"');
  });

  it('announces an empty story as a status', () => {
    const html = renderToStaticMarkup(
      <StoryList
        items={[]}
        loadMemoryImage={loadMemoryImage}
        loadHeartMomentImage={loadHeartMomentImage}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Eure Story beginnt hier.');
  });
});
