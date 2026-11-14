// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanStoryLinks } from './PlanStoryLinks';

afterEach(() => onlineManager.setOnline(true));

it('explains an uncached offline read without starting a request or promising synchronization', async () => {
  onlineManager.setOnline(false);
  const read = vi.fn(async () => ({
    items: [],
    nextCursor: null,
    hasMore: false,
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlanStoryLinks
          apis={
            { plans: { listPlanStory: read } } as unknown as SharedPlanningApis
          }
          spaceId="space-1"
          planId="plan-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    i18n.t('states.offline.title'),
  );
  expect(read).not.toHaveBeenCalled();
});
