import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { onTestFinished } from 'vitest';
import { i18n } from '../i18n';
import m5s5 from '../i18n/locales/m5s5';
import {
  SharedStorySummary,
  sharedStorySummaryIsEligible,
} from './SharedStorySummary';

describe('SharedStorySummary', () => {
  it('uses the ratified sparse threshold', () => {
    expect(
      sharedStorySummaryIsEligible({
        memories: 4,
        heartMoments: 1,
        milestones: 0,
      }),
    ).toBe(true);
    expect(
      sharedStorySummaryIsEligible({
        memories: 3,
        heartMoments: 1,
        milestones: 0,
      }),
    ).toBe(false);
    expect(
      sharedStorySummaryIsEligible({
        memories: 20,
        heartMoments: 0,
        milestones: 0,
      }),
    ).toBe(false);
  });

  it('renders the two-metric eligible state without placeholder for absent metric', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 4, heartMoments: 1, milestones: 0 }}
        />
      </MemoryRouter>,
    );

    expect(html).toContain(m5s5.dashboard.storySummaryTitle);
    expect(html).toContain(m5s5.dashboard.storySummaryMemories);
    expect(html).toContain(m5s5.dashboard.storySummaryHeartMoments);
    expect(html).not.toContain(m5s5.dashboard.storySummaryMilestones);
    expect(html.indexOf(m5s5.dashboard.storySummaryMemories)).toBeLessThan(
      html.indexOf(m5s5.dashboard.storySummaryHeartMoments),
    );

    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('5</strong> Erinnerungen');
    expect(html).not.toContain('button');

    const metricMatches = html.match(/shared-story-summary-metric/g);
    expect(metricMatches).toHaveLength(2);

    expect(html).toContain('href="/story?tab=timeline&amp;type=MEMORY"');
    expect(html).toContain('href="/story?tab=timeline&amp;type=HEART_MOMENT"');
    expect(html).not.toContain('href="/story?tab=timeline&amp;type=MILESTONE"');
  });

  it('renders all three visible metrics in sequence with category rows and filtered source links', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 10, heartMoments: 1, milestones: 3 }}
        />
      </MemoryRouter>,
    );

    expect(html).toContain(m5s5.dashboard.storySummaryTitle);
    expect(html).toContain(m5s5.dashboard.storySummaryMemories);
    expect(html).toContain(m5s5.dashboard.storySummaryHeartMoments);
    expect(html).toContain(m5s5.dashboard.storySummaryMilestones);

    const posMemories = html.indexOf(m5s5.dashboard.storySummaryMemories);
    const posHeart = html.indexOf(m5s5.dashboard.storySummaryHeartMoments);
    const posMilestones = html.indexOf(m5s5.dashboard.storySummaryMilestones);
    expect(posMemories).toBeLessThan(posHeart);
    expect(posHeart).toBeLessThan(posMilestones);

    const metricMatches = html.match(/shared-story-summary-metric/g);
    expect(metricMatches).toHaveLength(3);

    expect(html).toContain('href="/story?tab=timeline&amp;type=MEMORY"');
    expect(html).toContain('href="/story?tab=timeline&amp;type=HEART_MOMENT"');
    expect(html).toContain('href="/story?tab=timeline&amp;type=MILESTONE"');

    expect(html.match(/eimir-icon/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain('story-badge-motif');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders alternative two-metric state (heartMoments and milestones)', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 0, heartMoments: 3, milestones: 2 }}
        />
      </MemoryRouter>,
    );

    expect(html).not.toContain(m5s5.dashboard.storySummaryMemories);
    expect(html).toContain(m5s5.dashboard.storySummaryHeartMoments);
    expect(html).toContain(m5s5.dashboard.storySummaryMilestones);

    const metricMatches = html.match(/shared-story-summary-metric/g);
    expect(metricMatches).toHaveLength(2);
  });

  it('formats localized singular and plural accessible names for metrics', () => {
    const htmlSingular = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 1, heartMoments: 1, milestones: 3 }}
        />
      </MemoryRouter>,
    );
    expect(htmlSingular).toContain('aria-label="1 Moment"');
    expect(htmlSingular).toContain('aria-label="1 Herzmoment"');
    expect(htmlSingular).toContain('aria-label="3 Meilensteine"');

    const htmlMilestoneSingular = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 4, heartMoments: 2, milestones: 1 }}
        />
      </MemoryRouter>,
    );
    expect(htmlMilestoneSingular).toContain('aria-label="4 Momente"');
    expect(htmlMilestoneSingular).toContain('aria-label="2 Herzmomente"');
    expect(htmlMilestoneSingular).toContain('aria-label="1 Meilenstein"');
  });
});

describe('story composition', () => {
  it.each([
    ['de', m5s5.dashboard.storySummaryIntro, 'Erinnerungen'],
    ['en', 'Your little moments and big ones have a home here.', 'memories'],
  ])('introduces the shared count in %s', async (locale, intro, label) => {
    const previous = i18n.language;
    onTestFinished(async () => {
      await i18n.changeLanguage(previous);
    });
    await i18n.changeLanguage(locale);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 29, heartMoments: 9, milestones: 5 }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain(intro);
    const total = `43</strong> ${label}`;
    expect(html).toContain(total);
    expect(html.indexOf(intro)).toBeLessThan(html.indexOf(total));
    expect(html).toContain('style="flex-grow:29"');
    expect(html).toContain('style="flex-grow:9"');
    expect(html).toContain('style="flex-grow:5"');
  });

  it('keeps the explicit empty preview and the live opt-in distinct', () => {
    const preview = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 0, heartMoments: 0, milestones: 0 }}
          showEmpty
        />
      </MemoryRouter>,
    );
    expect(preview.match(/shared-story-summary-metric/g)).toHaveLength(3);
    expect(preview).not.toContain('shared-story-summary-bar');
    expect(preview).not.toContain(m5s5.dashboard.storySummaryIntro);
    const live = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 1, heartMoments: 0, milestones: 0 }}
          showEmpty
          includeEmptyCategories={false}
        />
      </MemoryRouter>,
    );
    expect(live).toContain('1</strong> Erinnerung</p>');
    expect(live.match(/shared-story-summary-metric/g)).toHaveLength(1);
    expect(live).not.toContain('type=HEART_MOMENT');
    expect(live).not.toContain('type=MILESTONE');
  });
  it('formats large totals for the selected locale', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 1234, heartMoments: 9, milestones: 5 }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('1.248</strong> Erinnerungen');
    expect(html).toContain('aria-label="1234 Momente"');
  });
});
