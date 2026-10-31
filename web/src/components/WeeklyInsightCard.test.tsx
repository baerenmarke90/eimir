// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { WeeklyReviewView } from '../api/generated/models/WeeklyReviewView';
import copy from '../i18n/locales/weeklyInsights';
import {
  ClearWeeklyInsightFeedback,
  WeeklyInsightCard,
} from './WeeklyInsightCard';

const value: WeeklyReviewView = {
  evidenceToken: 'a'.repeat(64),
  feedback: [],
  general: false,
  generatedBy: 'AI',
  historyStart: new Date('2026-08-03'),
  historyEnd: new Date('2026-09-23'),
  weekStart: new Date('2026-09-21'),
  weekEnd: new Date('2026-09-27'),
  observations: [
    { key: 'weekend_higher', kind: 'WEEKEND_HIGHER', sampleCount: 42 },
  ],
  recommendations: ['quiet_time'],
};
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});
function harness(overrides: Record<string, unknown> = {}) {
  const api = {
    getDailyCheckInWeeklyReview: vi.fn(async () => value),
    createDailyCheckInWeeklyReview: vi.fn(async () => value),
    setDailyCheckInWeeklyFeedback: vi.fn(async (request) => ({
      recommendationKey: request.recommendationKey,
      rating: request.weeklyFeedbackUpdate.rating,
    })),
    ...overrides,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const node = (accountId = 'anna') => (
    <QueryClientProvider client={client}>
      <WeeklyInsightCard
        key={accountId}
        api={api as unknown as DailyCheckInsApi}
        instance="local"
        accountId={accountId}
        spaceId="space"
        monday="2026-09-21"
      />
    </QueryClientProvider>
  );
  const view = render(node());
  return { api, client, view, node };
}
async function generate() {
  fireEvent.click(screen.getByRole('button', { name: copy.generate }));
  await screen.findByText(copy.ai);
}
it('does not read or infer before the deliberate action and exposes provenance and evidence', async () => {
  const { api } = harness();
  expect(api.getDailyCheckInWeeklyReview).not.toHaveBeenCalled();
  expect(api.createDailyCheckInWeeklyReview).not.toHaveBeenCalled();
  await generate();
  expect(api.createDailyCheckInWeeklyReview).toHaveBeenCalledTimes(1);
  expect(screen.getByText(copy.facts.WEEKEND_HIGHER)).toBeTruthy();
  expect(screen.getByText(/42 gemeinsam/)).toBeTruthy();
  expect(screen.getByText(copy.feedbackPrivacy)).toBeTruthy();
});
it('confirms feedback before pressing it and supports removing the same intent', async () => {
  let accept: (v: unknown) => void = () => {};
  const put = vi.fn(
    (_request: { weeklyFeedbackUpdate: { rating: string | null } }) =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  harness({ setDailyCheckInWeeklyFeedback: put });
  await generate();
  const button = screen.getByRole('button', { name: copy.ratings.HELPFUL });
  fireEvent.click(button);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  accept({ recommendationKey: 'quiet_time', rating: 'HELPFUL' });
  await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(button);
  await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
  expect(put.mock.calls[1][0].weeklyFeedbackUpdate.rating).toBeNull();
  accept({ recommendationKey: 'quiet_time', rating: null });
  await waitFor(() =>
    expect(button.getAttribute('aria-pressed')).toBe('false'),
  );
});
it('does not claim a failed feedback write was saved', async () => {
  harness({
    setDailyCheckInWeeklyFeedback: vi.fn(async () => {
      throw Error('failed');
    }),
  });
  await generate();
  fireEvent.click(screen.getByRole('button', { name: copy.ratings.HELPFUL }));
  await screen.findByRole('alert');
  expect(
    screen
      .getByRole('button', { name: copy.ratings.HELPFUL })
      .getAttribute('aria-pressed'),
  ).toBe('false');
});
it('discards an old caller response after the account changes', async () => {
  let accept: (v: WeeklyReviewView) => void = () => {};
  const { view, node } = harness({
    createDailyCheckInWeeklyReview: vi.fn(
      () =>
        new Promise<WeeklyReviewView>((resolve) => {
          accept = resolve;
        }),
    ),
  });
  fireEvent.click(screen.getByRole('button', { name: copy.generate }));
  await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
  await new Promise((resolve) => setTimeout(resolve, 20));
  view.rerender(node('ben'));
  accept(value);
  await waitFor(() => expect(screen.queryByText(copy.ai)).toBeNull());
});
it('hides a result immediately during fresh evidence revalidation and keeps stale results hidden', async () => {
  const { client } = harness();
  await generate();
  client.setQueryData(
    ['weekly-insight', 'local', 'anna', 'space', '2026-09-21'],
    { ...value, evidenceToken: 'b'.repeat(64) },
  );
  await waitFor(() => expect(screen.queryByText(copy.ai)).toBeNull());
  expect(screen.getByText(copy.changed)).toBeTruthy();
});
it('does not queue or replay offline generation', async () => {
  const { api } = harness();
  onlineManager.setOnline(false);
  fireEvent.click(screen.getByRole('button', { name: copy.generate }));
  await screen.findByRole('alert');
  onlineManager.setOnline(true);
  expect(api.createDailyCheckInWeeklyReview).not.toHaveBeenCalled();
  expect(api.getDailyCheckInWeeklyReview).not.toHaveBeenCalled();
});
it('labels sparse results as general and never invents a personal pattern', async () => {
  const general = {
    ...value,
    general: true,
    generatedBy: 'RULES',
    observations: [],
  };
  harness({
    getDailyCheckInWeeklyReview: vi.fn(async () => general),
    createDailyCheckInWeeklyReview: vi.fn(async () => general),
  });
  fireEvent.click(screen.getByRole('button', { name: copy.generate }));
  await screen.findByText(copy.general);
  expect(screen.getByText(copy.sparse)).toBeTruthy();
  expect(screen.queryByText(copy.ai)).toBeNull();
  expect(screen.queryByText(copy.facts.WEEKEND_HIGHER)).toBeNull();
});

it('allows clearing every retained caller preference without a Pro read', async () => {
  const put = vi.fn(
    async (_request: { weeklyFeedbackUpdate: { rating: null } }) => ({
      rating: null,
      recommendationKey: 'quiet_time',
    }),
  );
  render(
    <ClearWeeklyInsightFeedback
      api={
        { setDailyCheckInWeeklyFeedback: put } as unknown as DailyCheckInsApi
      }
      spaceId="space"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: copy.clearAll }));
  await screen.findByText(copy.cleared);
  expect(put).toHaveBeenCalledTimes(6);
  expect(
    put.mock.calls.every(
      (call) => call[0].weeklyFeedbackUpdate.rating === null,
    ),
  ).toBe(true);
});

it('pauses background evidence refresh while a feedback intent is in flight', async () => {
  let accept: (value: unknown) => void = () => {};
  const put = vi.fn(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  const { api } = harness({ setDailyCheckInWeeklyFeedback: put });
  await generate();
  const reads = api.getDailyCheckInWeeklyReview.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: copy.ratings.HELPFUL }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(api.getDailyCheckInWeeklyReview).toHaveBeenCalledTimes(reads);
  accept({ recommendationKey: 'quiet_time', rating: 'HELPFUL' });
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: copy.ratings.HELPFUL })
        .getAttribute('aria-pressed'),
    ).toBe('true'),
  );
});
