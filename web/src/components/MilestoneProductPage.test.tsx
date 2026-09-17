// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider } from '../client/taskOrigin';
import storyProducts from '../i18n/locales/storyProducts';
import { MilestoneProductPage } from './MilestoneProductPage';

const backToStoryName = new RegExp(
  storyProducts.milestoneProduct.backToStory.replace(/^←\s*/, ''),
  'i',
);

afterEach(() => {
  vi.restoreAllMocks();
});

const milestone = {
  id: 'milestone-1',
  spaceId: 'space-1',
  title: 'First apartment together',
  body: null,
  happenedOn: new Date('2026-08-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  version: 1,
  author: { id: 'author-1', displayName: 'Alex' },
  authorId: 'author-1',
  capabilities: { canComment: true, canDelete: true, canEdit: true },
};

function renderDetail(taskOriginKey?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.milestone('space-1', 'milestone-1'),
    { value: milestone, source: 'network' },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/story/milestones/milestone-1',
            state: taskOriginKey ? { taskOriginKey } : null,
          },
        ]}
      >
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <Routes>
            <Route path="/story" element={<div>story landing</div>} />
            <Route
              path="/story/milestones/:milestoneId"
              element={
                <MilestoneProductPage
                  mode="detail"
                  apis={{} as ReferenceApis}
                  spaceId="space-1"
                  currentAccountId="account-1"
                />
              }
            />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MilestoneProductPage Back restores origin (#966)', () => {
  it('falls back to the generic Story link when opened without a task origin', async () => {
    renderDetail();
    expect(
      await screen.findByRole('button', { name: backToStoryName }),
    ).toBeTruthy();
  });

  it('returns via the TaskOrigin contract instead of a static unconditional /story link', async () => {
    renderDetail('unresolvable-key');
    const back = await screen.findByRole('button', {
      name: backToStoryName,
    });
    const user = userEvent.setup();
    await user.click(back);
    expect(await screen.findByText('story landing')).toBeTruthy();
  });
});
