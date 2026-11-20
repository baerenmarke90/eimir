// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import { RecapViewFromJSON } from '../api/generated/models/RecapView';
import coupleExperiences from '../i18n/locales/coupleExperiences';
import recaps from '../i18n/locales/recaps';
import relationshipReflections from '../i18n/locales/relationshipReflections';
import { CoupleExperienceLinks } from './CoupleExperienceLinks';
import { RecapDiscoverLead } from './RecapDiscoverLead';
import type { RecapMediaProps } from './RecapMedia';

const presentation = vi.hoisted(() => ({ proActive: false }));
vi.mock('../client/proPresentation', () => ({
  useHideProFeatureMarks: () => presentation.proActive,
}));

const october = RecapViewFromJSON({
  id: 'october',
  kind: 'MONTH',
  year: 2026,
  month: 10,
  variant: 0,
  version: 1,
  startsOn: '2026-10-01',
  throughOn: '2026-10-31',
  isPartial: false,
  status: 'READY',
  theme: 'WORDS',
  generatedAt: '2026-11-01T06:00:00Z',
  savedAt: null,
  locale: 'de-DE',
  headline: null,
  introduction: null,
  sources: [
    {
      key: 'HEART_MOMENT:note',
      id: 'note',
      kind: 'HEART_MOMENT',
      title: 'Morning note',
      excerpt: null,
      available: true,
      occurredOn: '2026-10-26',
      version: 1,
      previewAttachmentId: null,
      previewIsSensitive: false,
    },
  ],
  reflections: [],
  ownDraft: null,
});

const media = {
  mediaApis: { attachments: { contentBaseUrl: 'https://media.test' } },
  account: { id: 'account-1' },
  spaceId: 'space-1',
} as unknown as RecapMediaProps;

const recapsApi = {
  getRecapOverview: vi.fn(async () => ({ editions: [october] })),
} as unknown as RecapsApi;

function renderDiscover(lead: ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/story']}>
        <Routes>
          <Route
            path="/story"
            element={<CoupleExperienceLinks onOpen={() => {}} lead={lead} />}
          />
          <Route path="/story/recaps/:id" element={<p>Recap reader</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lead = (today: string) => (
  <RecapDiscoverLead
    api={recapsApi}
    today={new Date(today)}
    onOpen={() => {}}
    {...media}
  />
);

beforeEach(() => {
  localStorage.clear();
  presentation.proActive = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Discover couple experiences (#1907 F4)', () => {
  it('lists only the two guided experiences, each marked Pro for Free', () => {
    renderDiscover(null);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/story/happiness',
      '/story/time-travel',
    ]);
    expect(
      screen.queryByText(relationshipReflections.passport.title),
    ).toBeNull();
    for (const link of links)
      expect(link.textContent).toContain(coupleExperiences.pro);
  });

  it('ends each row in a chevron instead of a Pro mark with Pro', () => {
    presentation.proActive = true;
    renderDiscover(null);
    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent).not.toContain(coupleExperiences.pro);
      expect(link.querySelector('.couple-experience-chevron')).not.toBeNull();
    }
  });

  it('leads with a new recap until it is opened, then stays calm', async () => {
    renderDiscover(lead('2026-11-02'));
    const card = await screen.findByRole('link', {
      name: new RegExp(recaps.discoverNew),
    });
    expect(card.getAttribute('href')).toBe('/story/recaps/october?play=1');
    expect(card.textContent).toContain(recaps.shortTitle);
    fireEvent.click(card);
    await screen.findByText('Recap reader');
    cleanup();
    renderDiscover(lead('2026-11-02'));
    await screen.findAllByText(coupleExperiences.entries.happiness.title);
    expect(recapsApi.getRecapOverview).toHaveBeenCalled();
    expect(
      screen.queryByRole('link', { name: new RegExp(recaps.discoverNew) }),
    ).toBeNull();
  });

  it('shows no recap card outside the invitation window', async () => {
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    renderDiscover(lead('2026-11-10'));
    await screen.findAllByText(coupleExperiences.entries.happiness.title);
    await Promise.resolve();
    expect(
      screen.queryByRole('link', { name: new RegExp(recaps.discoverNew) }),
    ).toBeNull();
  });
});
