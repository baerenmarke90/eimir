import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import de from '../i18n/locales/de';
import { StoryBrowseLayer } from './StoryBrowseLayer';

describe('StoryBrowseLayer', () => {
  it('exposes the three structural destinations as navigation, not primary tabs', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoryBrowseLayer />
      </MemoryRouter>,
    );

    expect(html).toContain('momente-browse-layer');
    expect(html).toContain(de.story.browseTitle);
    expect(html).toContain(de.story.browseMilestones);
    expect(html).toContain(de.story.browseChapters);
    expect(html).toContain(de.story.browseYears);
    expect(html).toContain('href="/story?tab=timeline&amp;type=MILESTONE"');
    expect(html).toContain('href="/story/chapters"');
    expect(html).toContain('href="/story/years"');
    expect(html).not.toContain('role="tab"');
  });
});
