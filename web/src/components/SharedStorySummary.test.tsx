// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { StoryLifelineEntriesView } from '../api/generated/models/StoryLifelineEntriesView';
import type { StoryLifelineView } from '../api/generated/models/StoryLifelineView';
import { i18n } from '../i18n';
import m5s5 from '../i18n/locales/m5s5';
import {
  SharedStorySummary,
  type SharedStorySummaryVariant,
} from './SharedStorySummary';

const fillCopy = (template: string, values: Record<string, string | number>) =>
  template.replace(/{{(\w+)}}/g, (_, key: string) => String(values[key]));
const positionOf = (position: number, total: number) =>
  fillCopy(m5s5.dashboard.storyLifelinePosition, { position, total });
const entryOf = (position: number, total: number) =>
  fillCopy(m5s5.dashboard.storyLifelineEntryLabel, { position, total });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const copy = m5s5.dashboard;
/** The lifeline slider value text, composed from the locale templates. */
function lifelineValue(
  date: string,
  count: number,
  title: string,
  kind: string = copy.storyLifelineKindMemory,
  position?: [number, number],
): string {
  return (position ? copy.storyLifelineValuePosition : copy.storyLifelineValue)
    .replace('{{period}}', copy.storyLifelineWeekOf.replace('{{date}}', date))
    .replace(
      '{{entries}}',
      copy.storyLifelineEntries_other.replace('{{count}}', String(count)),
    )
    .replace('{{kind}}', kind)
    .replace('{{title}}', title)
    .replace('{{position}}', String(position?.[0]))
    .replace('{{total}}', String(position?.[1]));
}

const day = (value: string) => new Date(`${value}T00:00:00Z`);

function highlight(
  id: string,
  title: string,
  type: DashboardItem['type'] = 'MEMORY',
): DashboardItem {
  return {
    type,
    id,
    titleOrText: title,
    occurredOn: day('2026-07-19'),
    scheduledAt: null,
    createdAt: null,
    previewAttachmentId: null,
    previewIsSensitive: false,
    previewHasThumbnail: false,
  };
}

// 29 memories, 9 heart moments and 5 milestones between May and November.
const LIFELINE: StoryLifelineView = {
  startsOn: day('2026-05-13'),
  today: day('2026-11-10'),
  weeks: [
    {
      weekStart: day('2026-05-11'),
      memories: 9,
      heartMoments: 3,
      milestones: 2,
      highlight: highlight('first', 'Our first walk'),
    },
    {
      weekStart: day('2026-07-13'),
      memories: 10,
      heartMoments: 4,
      milestones: 1,
      highlight: highlight('picnic', 'Picnic at the lake'),
    },
    {
      weekStart: day('2026-11-09'),
      memories: 10,
      heartMoments: 2,
      milestones: 2,
      highlight: highlight('latest', 'An ordinary Tuesday'),
    },
  ],
};

// Entries of the latest week (9 to 16 November), oldest first.
const LATEST_ENTRIES: StoryLifelineEntriesView = {
  total: 4,
  items: [
    highlight('m1', 'Morning coffee'),
    highlight('ms1', 'Moved in together', 'MILESTONE'),
    highlight('latest', 'An ordinary Tuesday'),
    highlight('h1', 'Thank you for today', 'HEART_MOMENT'),
  ],
};

type EntriesReader = (request: {
  spaceId: string;
  from: Date;
  to: Date;
}) => Promise<StoryLifelineEntriesView>;

function renderSummary(
  getStoryLifeline: () => Promise<StoryLifelineView>,
  summary = { memories: 29, heartMoments: 9, milestones: 5 },
  {
    variant,
    getStoryLifelineEntries = () => new Promise(() => {}),
  }: {
    variant?: SharedStorySummaryVariant;
    getStoryLifelineEntries?: EntriesReader;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const dashboardApi = {
    getStoryLifeline,
    getStoryLifelineEntries,
  } as unknown as DashboardApi;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SharedStorySummary
          summary={summary}
          accountId="account-a"
          spaceId="space-a"
          dashboardApi={dashboardApi}
          variant={variant}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function stubBandWidth() {
  const band = screen.getByRole('slider');
  band.getBoundingClientRect = () =>
    ({ left: 0, width: 300, top: 0, height: 92 }) as DOMRect;
  return band;
}

describe('SharedStorySummary lifeline', () => {
  it('shows the dashboard totals with matching parts before the lifeline arrives', () => {
    renderSummary(() => new Promise(() => {}), {
      memories: 4,
      heartMoments: 0,
      milestones: 1,
    });
    expect(
      screen.getByRole('heading', { name: 'Eure Geschichte' }),
    ).toBeDefined();
    // "Momente" is the umbrella; "Erinnerungen" is one of its kinds.
    expect(screen.getByText('5 festgehaltene Momente')).toBeDefined();
    expect(
      screen.getByRole('link', { name: '4 Erinnerungen' }).getAttribute('href'),
    ).toBe('/story?tab=timeline&type=MEMORY');
    expect(screen.getByRole('link', { name: '1 Meilenstein' })).toBeDefined();
    expect(screen.queryByRole('link', { name: /Herzmoment/ })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('draws the lifeline with a total that equals its three parts', async () => {
    renderSummary(async () => LIFELINE);
    expect(
      await screen.findByText('43 festgehaltene Momente seit Mai'),
    ).toBeDefined();
    const legend = screen.getAllByRole('link');
    expect(legend.map((link) => link.getAttribute('aria-label'))).toEqual([
      '29 Erinnerungen',
      '9 Herzmomente',
      '5 Meilensteine',
    ]);
    const band = screen.getByRole('slider', {
      name: copy.storyLifelineAria,
    });
    expect(band.getAttribute('aria-valuemax')).toBe('2');
    expect(band.getAttribute('aria-valuetext')).toBe(
      lifelineValue('9. November', 14, 'An ordinary Tuesday'),
    );
    expect(screen.getByText('Heute')).toBeDefined();
    expect(screen.getByText(copy.storyLifelineHint)).toBeDefined();
    // Each kind keeps its own shape in the band and in the legend.
    expect(
      document.querySelectorAll(
        '.shared-story-lifeline-dot.story-kind-memories circle',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        '.shared-story-lifeline-dot.story-kind-heartMoments path',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('.shared-story-summary-row .story-kind-glyph'),
    ).toHaveLength(3);
  });

  it('steps through weeks by keyboard and opens a preview of each', async () => {
    renderSummary(async () => LIFELINE);
    const band = await screen.findByRole('slider');
    band.focus();
    fireEvent.keyDown(band, { key: 'ArrowLeft' });
    const preview = screen.getByRole('link', { name: /An ordinary Tuesday/ });
    expect(preview.getAttribute('href')).toBe('/story/memories/latest');
    fireEvent.keyDown(band, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    expect(band.getAttribute('aria-valuetext')).toBe(
      lifelineValue('13. Juli', 15, 'Picnic at the lake'),
    );
    fireEvent.keyDown(band, { key: 'Home' });
    expect(screen.getByRole('link', { name: /Our first walk/ })).toBeDefined();
    fireEvent.keyDown(band, { key: 'Escape' });
    expect(screen.queryByRole('link', { name: /Our first walk/ })).toBeNull();
    // Choosing periods alone keeps the hint for single entries.
    expect(screen.getByText(copy.storyLifelineHint)).toBeDefined();
    expect(window.localStorage.getItem('eimir-story-lifeline-hint-v2')).toBe(
      null,
    );
  });

  it('scrubs with a finger and keeps the last week until clicking elsewhere', async () => {
    renderSummary(async () => LIFELINE);
    await screen.findByRole('slider');
    const band = stubBandWidth();
    fireEvent.pointerDown(band, {
      pointerType: 'touch',
      clientX: 2,
      clientY: 30,
    });
    fireEvent.pointerMove(band, {
      pointerType: 'touch',
      clientX: 2,
      clientY: 70,
    });
    fireEvent.pointerCancel(band, { pointerType: 'touch' });
    expect(screen.queryByRole('link', { name: /Our first walk/ })).toBeNull();
    fireEvent.pointerDown(band, { pointerType: 'touch', clientX: 2 });
    fireEvent.pointerUp(band, { pointerType: 'touch', clientX: 2 });
    expect(screen.getByRole('link', { name: /Our first walk/ })).toBeDefined();
    fireEvent.pointerDown(band, { pointerType: 'touch', clientX: 2 });
    fireEvent.pointerMove(band, { pointerType: 'touch', clientX: 120 });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    fireEvent.pointerUp(band, { pointerType: 'touch', clientX: 120 });
    fireEvent.pointerMove(band, { pointerType: 'touch', clientX: 298 });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    // A press elsewhere keeps the preview; the click that follows closes it.
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    act(() => {
      fireEvent.click(document.body);
    });
    expect(
      screen.queryByRole('link', { name: /Picnic at the lake/ }),
    ).toBeNull();
  });

  it('keeps the dashboard totals when the lifeline cannot be read', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    renderSummary(failing);
    await vi.waitFor(() => expect(failing).toHaveBeenCalled());
    expect(screen.getByText('43 festgehaltene Momente')).toBeDefined();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('invites the first memories when nothing is shared yet', () => {
    renderSummary(() => new Promise(() => {}), {
      memories: 0,
      heartMoments: 0,
      milestones: 0,
    });
    expect(screen.getByText(copy.storyLifelineEmpty)).toBeDefined();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('formats the caption and counts for the selected locale', async () => {
    const previous = i18n.language;
    onTestFinished(async () => {
      await i18n.changeLanguage(previous);
    });
    await i18n.changeLanguage('en');
    renderSummary(async () => ({
      ...LIFELINE,
      startsOn: day('2025-05-13'),
      weeks: [
        { ...LIFELINE.weeks[0], weekStart: day('2025-05-12'), memories: 1209 },
        ...LIFELINE.weeks.slice(1),
      ],
    }));
    expect(
      await screen.findByText('1,243 captured moments since May 2025'),
    ).toBeDefined();
    const legend = screen.getAllByRole('link');
    expect(within(legend[0]).getByText('1,229')).toBeDefined();
    expect(legend[0].getAttribute('aria-label')).toBe('1229 memories');
  });

  it('chooses single entries of a period by keyboard and reads them lazily', async () => {
    const getStoryLifelineEntries = vi.fn<EntriesReader>(
      async () => LATEST_ENTRIES,
    );
    renderSummary(async () => LIFELINE, undefined, {
      getStoryLifelineEntries,
    });
    const band = await screen.findByRole('slider');
    band.focus();
    expect(getStoryLifelineEntries).not.toHaveBeenCalled();
    fireEvent.keyDown(band, { key: 'ArrowRight' });
    // The period's highlight shows at once; its entries follow.
    expect(
      screen.getByRole('link', { name: /An ordinary Tuesday/ }),
    ).toBeDefined();
    await vi.waitFor(() =>
      expect(band.getAttribute('aria-valuetext')).toBe(
        lifelineValue(
          '9. November',
          14,
          'An ordinary Tuesday',
          copy.storyLifelineKindMemory,
          [3, 4],
        ),
      ),
    );
    expect(getStoryLifelineEntries).toHaveBeenCalledWith(
      { spaceId: 'space-a', from: day('2026-11-09'), to: day('2026-11-16') },
      expect.anything(),
    );
    fireEvent.keyDown(band, { key: 'ArrowDown' });
    expect(band.getAttribute('aria-valuetext')).toBe(
      lifelineValue(
        '9. November',
        14,
        'Moved in together',
        copy.storyLifelineKindMilestone,
        [2, 4],
      ),
    );
    const preview = screen.getByRole('link', { name: /Moved in together/ });
    expect(preview.getAttribute('href')).toBe('/story/milestones/ms1');
    expect(preview.className).toContain('is-from-left');
    expect(preview.textContent).toContain(copy.storyLifelineKindMilestone);
    // The chosen entry's dot stands out in its column.
    const chosen = document.querySelector(
      '.shared-story-lifeline-dot.is-selected',
    );
    expect(chosen?.classList.contains('story-kind-milestones')).toBe(true);
    fireEvent.keyDown(band, { key: 'ArrowUp' });
    fireEvent.keyDown(band, { key: 'ArrowUp' });
    expect(
      screen.getByRole('link', { name: /Thank you for today/ }).className,
    ).toContain('is-from-right');
    expect(
      screen
        .getByRole('button', { name: entryOf(4, 4) })
        .getAttribute('aria-current'),
    ).toBe('true');
    // Moving to another period starts again from its highlight.
    fireEvent.keyDown(band, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    // Choosing a single entry retires the hint, also next time.
    expect(screen.queryByText(copy.storyLifelineHint)).toBeNull();
    expect(screen.queryByText(copy.storyLifelineEntryHint)).toBeNull();
    expect(window.localStorage.getItem('eimir-story-lifeline-hint-v2')).toBe(
      'seen',
    );
  });

  it('moves through a period by swipe, keys and pagination dots in the preview', async () => {
    renderSummary(async () => LIFELINE, undefined, {
      getStoryLifelineEntries: async () => LATEST_ENTRIES,
    });
    const band = await screen.findByRole('slider');
    fireEvent.keyDown(band, { key: 'End' });
    const pager = await screen.findByRole('group', { name: positionOf(3, 4) });
    const dots = within(pager).getAllByRole('button');
    expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
      entryOf(1, 4),
      entryOf(2, 4),
      entryOf(3, 4),
      entryOf(4, 4),
    ]);
    expect(dots[2].getAttribute('aria-current')).toBe('true');
    // A dot is the non-gesture way to any entry; the preview stays open.
    fireEvent.click(dots[0]);
    const first = screen.getByRole('link', { name: /Morning coffee/ });
    expect(first.className).toContain('is-from-left');
    expect(dots[0].getAttribute('aria-current')).toBe('true');
    // A left swipe past the threshold brings the next entry and does not
    // open the one under the finger.
    const card = first.closest(
      '.shared-story-lifeline-preview-card',
    ) as HTMLElement;
    fireEvent.pointerDown(first, {
      pointerType: 'touch',
      pointerId: 7,
      clientX: 200,
      clientY: 20,
    });
    fireEvent.pointerMove(first, {
      pointerType: 'touch',
      pointerId: 7,
      clientX: 150,
      clientY: 22,
    });
    fireEvent.pointerUp(first, {
      pointerType: 'touch',
      pointerId: 7,
      clientX: 150,
      clientY: 22,
    });
    // With the pointer captured, the click that ends the swipe reaches the
    // card, which swallows it.
    expect(fireEvent.click(card)).toBe(false);
    expect(fireEvent.click(card)).toBe(true);
    const second = screen.getByRole('link', { name: /Moved in together/ });
    expect(second.className).toContain('is-from-right');
    // A short swipe snaps back without changing the entry.
    fireEvent.pointerDown(second, {
      pointerType: 'touch',
      pointerId: 8,
      clientX: 100,
      clientY: 20,
    });
    fireEvent.pointerMove(second, {
      pointerType: 'touch',
      pointerId: 8,
      clientX: 125,
      clientY: 20,
    });
    fireEvent.pointerUp(second, {
      pointerType: 'touch',
      pointerId: 8,
      clientX: 125,
      clientY: 20,
    });
    expect(screen.getByRole('link', { name: /Moved in together/ })).toBe(
      second,
    );
    // Left and Right inside the card step too and keep focus on the card.
    second.focus();
    fireEvent.keyDown(second, { key: 'ArrowRight' });
    const third = screen.getByRole('link', { name: /An ordinary Tuesday/ });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(card, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('link', { name: /Moved in together/ }),
    ).toBeDefined();
    // Compact keeps only the floating preview, no list below the band.
    expect(document.querySelector('.shared-story-lifeline-fan')).toBeNull();
  });

  it('chooses the entry of a tapped dot and of a vertical drag', async () => {
    renderSummary(async () => LIFELINE, undefined, {
      getStoryLifelineEntries: async () => LATEST_ENTRIES,
    });
    await screen.findByRole('slider');
    const band = stubBandWidth();
    fireEvent.pointerDown(band, { pointerType: 'touch', clientX: 298 });
    fireEvent.pointerUp(band, { pointerType: 'touch', clientX: 298 });
    await vi.waitFor(() =>
      expect(band.getAttribute('aria-valuetext')).toContain(positionOf(3, 4)),
    );
    const dots = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-lifeline-column="2"] [data-lifeline-dot]',
      ),
    ];
    dots.forEach((dot, index) => {
      dot.getBoundingClientRect = () =>
        ({ left: 290, width: 12, top: 60 - index * 14, height: 12 }) as DOMRect;
    });
    const heart = dots.findIndex((dot) =>
      dot.classList.contains('story-kind-heartMoments'),
    );
    expect(heart).toBeGreaterThan(-1);
    const tapY = 66 - heart * 14;
    fireEvent.pointerDown(band, {
      pointerType: 'touch',
      clientX: 296,
      clientY: tapY,
    });
    fireEvent.pointerUp(band, {
      pointerType: 'touch',
      clientX: 296,
      clientY: tapY,
    });
    expect(
      screen.getByRole('link', { name: /Thank you for today/ }),
    ).toBeDefined();
    expect(band.getAttribute('aria-valuetext')).toBe(
      lifelineValue(
        '9. November',
        14,
        'Thank you for today',
        copy.storyLifelineKindHeartMoment,
        [4, 4],
      ),
    );
    // Dragging down on the band walks back through the entries.
    fireEvent.pointerDown(band, {
      pointerType: 'touch',
      clientX: 296,
      clientY: 20,
    });
    fireEvent.pointerMove(band, {
      pointerType: 'touch',
      clientX: 296,
      clientY: 50,
    });
    expect(
      screen.getByRole('link', { name: /Moved in together/ }),
    ).toBeDefined();
    fireEvent.pointerUp(band, {
      pointerType: 'touch',
      clientX: 296,
      clientY: 50,
    });
  });

  it('lists the period below the band in the full variant', async () => {
    const many: StoryLifelineEntriesView = {
      total: 9,
      items: Array.from({ length: 9 }, (_, index) =>
        index === 4
          ? highlight('latest', 'An ordinary Tuesday')
          : highlight(`m${index}`, `Entry ${index}`),
      ),
    };
    renderSummary(
      async () => ({
        ...LIFELINE,
        weeks: [
          ...LIFELINE.weeks.slice(0, 2),
          { ...LIFELINE.weeks[2], memories: 9, heartMoments: 0, milestones: 0 },
        ],
      }),
      { memories: 28, heartMoments: 7, milestones: 3 },
      { variant: 'full', getStoryLifelineEntries: async () => many },
    );
    const band = await screen.findByRole('slider');
    fireEvent.keyDown(band, { key: 'End' });
    // Until the entries arrive the list shows the period's highlight.
    expect(
      document.querySelectorAll('.shared-story-lifeline-row'),
    ).toHaveLength(1);
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('.shared-story-lifeline-row'),
      ).toHaveLength(6),
    );
    const rows = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '.shared-story-lifeline-row',
      ),
    ];
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(
      [
        'Entry 2',
        'Entry 3',
        'An ordinary Tuesday',
        'Entry 5',
        'Entry 6',
        'Entry 7',
      ],
    );
    expect(rows[2].className).toContain('is-selected');
    expect(rows[0].getAttribute('href')).toBe('/story/memories/m2');
    expect(
      screen
        .getByRole('link', {
          name: fillCopy(m5s5.dashboard.storyLifelineAll_other, {
            count: 9,
            period: fillCopy(m5s5.dashboard.storyLifelineWeekOf, {
              date: '9. November',
            }),
          }),
        })
        .getAttribute('href'),
    ).toBe('/story?tab=timeline&year=2026&order=ASC');
    // The chosen entry still floats inside the graphic in the full variant.
    expect(
      document.querySelector(
        '.shared-story-lifeline-stage .shared-story-lifeline-preview a',
      )?.textContent,
    ).toContain('An ordinary Tuesday');
    fireEvent.keyDown(band, { key: 'ArrowUp' });
    expect(
      document.querySelector('.shared-story-lifeline-row.is-selected strong')
        ?.textContent,
    ).toBe('Entry 5');
  });
});
