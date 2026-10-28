import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import de from '../i18n/locales/de';
import m5s5 from '../i18n/locales/m5s5';
import { StoryRetrospective } from './StoryRetrospective';

const loadMemoryImage = async () => 'blob:authorized-preview';

function candidate(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    id: 'lake-memory',
    type: 'MEMORY',
    titleOrText: 'That day by the lake',
    occurredOn: new Date('2025-08-24T00:00:00Z'),
    createdAt: null,
    scheduledAt: null,
    previewAttachmentId: 'ready-lake-image',
    previewIsSensitive: false,
    ...overrides,
  };
}

function renderCard(item: DashboardItem): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StoryRetrospective
        item={item}
        loadMemoryImage={loadMemoryImage}
        onOpen={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('StoryRetrospective #601 / #452', () => {
  it('opens an authorized photo Memory at its canonical route without loading an original', () => {
    const html = renderCard(candidate());
    expect(html).toContain('aria-labelledby="momente-retrospective-heading"');
    expect(html).toContain(de.story.retrospectiveHeading);
    expect(html).toContain(m5s5.today.living.retrospectiveLabel);
    expect(html).toContain('href="/story/memories/lake-memory"');
    expect(html).toContain('momente-retrospective-media');
    expect(html).toContain('data-media-deferred="true"');
    expect(html).not.toContain('blob:authorized-preview');
    expect(html).toContain('2025-08-24');
  });

  it('renders a real text-only historic Memory without an empty image well', () => {
    const html = renderCard(
      candidate({
        id: 'first-evening',
        titleOrText: 'Our first evening by the water',
        previewAttachmentId: null,
        previewIsSensitive: false,
      }),
    );
    expect(html).toContain('Our first evening by the water');
    expect(html).toContain('href="/story/memories/first-evening"');
    expect(html).not.toContain('momente-retrospective-media');
    expect(html).not.toContain('has-media');
  });

  it('handles authorized shared Heart Moments as text-first links', () => {
    const html = renderCard(
      candidate({
        id: 'shared-heart',
        type: 'HEART_MOMENT',
        titleOrText: 'Wir beide',
        previewAttachmentId: 'not-a-memory-image',
        previewIsSensitive: false,
      }),
    );
    expect(html).toContain('href="/story/heart-moments/shared-heart"');
    expect(html).not.toContain('momente-retrospective-media');
  });

  it('does not synthesize dates, media or a title from a missing optional photo', () => {
    const html = renderCard(
      candidate({
        occurredOn: null,
        createdAt: null,
        previewAttachmentId: null,
        previewIsSensitive: false,
        titleOrText: null,
      }),
    );
    expect(html).toContain(m5s5.dashboard.itemFallback);
    expect(html).not.toContain('<time');
    expect(html).not.toContain('momente-retrospective-media');
  });
});
