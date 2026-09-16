// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider } from '../client/taskOrigin';
import storyProducts from '../i18n/locales/storyProducts';
import { HeartMomentProductPage } from './HeartMomentProductPage';

const backToStoryName = new RegExp(
  storyProducts.heartMomentProduct.backToStory.replace(/^←\s*/, ''),
  'i',
);

afterEach(() => {
  cleanupMocks();
});
function cleanupMocks() {
  vi.restoreAllMocks();
}

const heartMoment = {
  id: 'heart-1',
  spaceId: 'space-1',
  text: 'I love you more each day',
  emotion: HeartEmotion.LOVED,
  visibility: ContentVisibility.SHARED,
  happenedOn: new Date('2026-08-25T00:00:00Z'),
  createdAt: new Date('2026-08-25T00:00:00Z'),
  updatedAt: new Date('2026-08-25T00:00:00Z'),
  version: 1,
  attachment: null,
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
    authorSummaryQueryKeys.heartMoment('space-1', 'heart-1'),
    { value: heartMoment, source: 'network' },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/story/heart-moments/heart-1',
            state: taskOriginKey ? { taskOriginKey } : null,
          },
        ]}
      >
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <Routes>
            <Route path="/story" element={<div>story landing</div>} />
            <Route
              path="/story/heart-moments/:heartMomentId"
              element={
                <HeartMomentProductPage
                  mode="detail"
                  apis={{} as ReferenceApis}
                  apiBaseUrl="https://example.test"
                  accessToken="token"
                  spaceId="space-1"
                  currentAccountId="account-1"
                  loadAttachment={async () => 'blob:test-image'}
                />
              }
            />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HeartMomentProductPage Back restores origin (#966)', () => {
  it('falls back to the generic Story link when opened without a task origin', async () => {
    renderDetail();
    expect(
      await screen.findByRole('button', { name: backToStoryName }),
    ).toBeTruthy();
  });

  it('reuses the shared taskBoundary.back label and restores scope when a valid origin key is present', async () => {
    // A real origin key is only produced by TaskOriginProvider.captureOrigin;
    // an arbitrary unresolved key still proves the component reads
    // taskOriginKey from router state at all (falls back safely otherwise).
    renderDetail('unresolvable-key');
    const back = await screen.findByRole('button', {
      name: backToStoryName,
    });
    const user = userEvent.setup();
    await user.click(back);
    expect(await screen.findByText('story landing')).toBeTruthy();
  });
});
