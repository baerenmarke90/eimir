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
import type { StoryLifelineView } from '../api/generated/models/StoryLifelineView';
import { i18n } from '../i18n';
import m5s5 from '../i18n/locales/m5s5';
import { SharedStorySummary } from './SharedStorySummary';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const copy = m5s5.dashboard;
/** The lifeline slider value text, composed from the locale templates. */
function lifelineValue(date: string, count: number, title: string): string {
  return copy.storyLifelineValue
    .replace('{{period}}', copy.storyLifelineWeekOf.replace('{{date}}', date))
    .replace(
      '{{entries}}',
      copy.storyLifelineEntries_other.replace('{{count}}', String(count)),
    )
    .replace('{{title}}', title);
}

const day = (value: string) => new Date(`${value}T00:00:00Z`);

function highlight(id: string, title: string): DashboardItem {
  return {
    type: 'MEMORY',
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

function renderSummary(
  getStoryLifeline: () => Promise<StoryLifelineView>,
  summary = { memories: 29, heartMoments: 9, milestones: 5 },
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const dashboardApi = { getStoryLifeline } as unknown as DashboardApi;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SharedStorySummary
          summary={summary}
          accountId="account-a"
          spaceId="space-a"
          dashboardApi={dashboardApi}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function stubBandWidth() {
  const band = screen.getByRole('slider');
  band.getBoundingClientRect = () =>
    ({ left: 0, width: 300, top: 0, height: 72 }) as DOMRect;
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
    expect(screen.getByText('5 gemeinsame Erinnerungen')).toBeDefined();
    expect(
      screen.getByRole('link', { name: '4 Momente' }).getAttribute('href'),
    ).toBe('/story?tab=timeline&type=MEMORY');
    expect(screen.getByRole('link', { name: '1 Meilenstein' })).toBeDefined();
    expect(screen.queryByRole('link', { name: /Herzmoment/ })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('draws the lifeline with a total that equals its three parts', async () => {
    renderSummary(async () => LIFELINE);
    expect(
      await screen.findByText('43 gemeinsame Erinnerungen seit Mai'),
    ).toBeDefined();
    const legend = screen.getAllByRole('link');
    expect(legend.map((link) => link.getAttribute('aria-label'))).toEqual([
      '29 Momente',
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
    // The swipe hint retires after the first interaction, also next time.
    expect(screen.queryByText(copy.storyLifelineHint)).toBeNull();
    expect(window.localStorage.getItem('eimir-story-lifeline-hint-v1')).toBe(
      'seen',
    );
  });

  it('scrubs with a finger and keeps the last week until tapping elsewhere', async () => {
    renderSummary(async () => LIFELINE);
    await screen.findByRole('slider');
    const band = stubBandWidth();
    fireEvent.pointerDown(band, { pointerType: 'touch', clientX: 2 });
    expect(screen.getByRole('link', { name: /Our first walk/ })).toBeDefined();
    fireEvent.pointerMove(band, { pointerType: 'touch', clientX: 120 });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    fireEvent.pointerUp(band, { pointerType: 'touch', clientX: 120 });
    fireEvent.pointerMove(band, { pointerType: 'touch', clientX: 298 });
    expect(
      screen.getByRole('link', { name: /Picnic at the lake/ }),
    ).toBeDefined();
    act(() => {
      fireEvent.pointerDown(document.body);
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
    expect(screen.getByText('43 gemeinsame Erinnerungen')).toBeDefined();
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
      await screen.findByText('1,243 shared memories since May 2025'),
    ).toBeDefined();
    const legend = screen.getAllByRole('link');
    expect(within(legend[0]).getByText('1,229')).toBeDefined();
  });
});
