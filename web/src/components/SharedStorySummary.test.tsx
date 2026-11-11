import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { i18n } from '../i18n';
import { onTestFinished } from 'vitest';
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
    expect(html).toContain('5</strong> gemeinsame Erinnerungen');
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
  const summary = { memories: 28, heartMoments: 9, milestones: 5 };
  it.each([
    ['de', 0, '0 Tagen'],
    ['de', 1, '1 Tag'],
    ['de', 2, '2 Tagen'],
    ['de', 31, '1 Monat'],
    ['de', 120, '4 Monaten'],
    ['de', 365, '1 Jahr'],
    ['de', 1096, '3 Jahren'],
    ['en', 1, '1 day'],
    ['en', 2, '2 days'],
    ['en', 31, '1 month'],
    ['en', 120, '4 months'],
    ['en', 365, '1 year'],
    ['en', 1096, '3 years'],
  ])(
    'uses snapshot calendar arithmetic and localized periods: %s %s',
    (locale, daysTogether, period) => {
      const previous = i18n.language;
      void i18n.changeLanguage(locale);
      onTestFinished(() => {
        void i18n.changeLanguage(previous);
      });
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <SharedStorySummary
            summary={summary}
            relationshipDuration={{
              startedOn: new Date('2023-01-01T00:00:00Z'),
              daysTogether,
              displayMode: 'DAYS',
            }}
          />
        </MemoryRouter>,
      );
      expect(html).toContain(
        `42</strong> ${locale === 'de' ? 'Erinnerungen' : 'memories'} in ${period}`,
      );
      expect(html).toContain('style="flex-grow:28"');
      expect(html).toContain('style="flex-grow:9"');
      expect(html).toContain('style="flex-grow:5"');
    },
  );

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
    const live = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 2, heartMoments: 0, milestones: 0 }}
          showEmpty
          includeEmptyCategories={false}
        />
      </MemoryRouter>,
    );
    expect(live).toContain('2</strong> gemeinsame Erinnerungen');
    expect(live.match(/shared-story-summary-metric/g)).toHaveLength(1);
    expect(live).not.toContain('type=HEART_MOMENT');
    expect(live).not.toContain('type=MILESTONE');
  });
  it('formats totals and uses the period-free fallback for unavailable duration', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SharedStorySummary
          summary={{ memories: 1234, heartMoments: 9, milestones: 5 }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('1.248</strong> gemeinsame Erinnerungen');
    expect(html).toContain('aria-label="1234 Momente"');
  });
});
