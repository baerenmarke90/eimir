// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import {
  nextRelationTargetCursor,
  PlanningRelationManager,
} from './PlanningRelationManager';

function memoryStory(id: string, title: string): StoryItem {
  return {
    kind: 'MEMORY',
    effectiveDate: new Date('2026-09-01T00:00:00Z'),
    memory: { id, title },
  } as StoryItem;
}

function renderManager(apis: SharedPlanningApis, canManage = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/plan/chapters/chapter-1']}>
        <PlanningRelationManager
          apis={apis}
          spaceId="space-1"
          ownerKind="chapter"
          ownerId="chapter-1"
          canManage={canManage}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

function relationApis(overrides: Record<string, unknown> = {}) {
  return {
    story: {
      getStoryTimeline: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
    },
    chapterRelations: {
      listChapterContent: vi.fn().mockResolvedValue({ items: [] }),
      linkChapterMemory: vi.fn(),
      unlinkChapterMemory: vi.fn(),
    },
    memories: { getMemory: vi.fn() },
    heartMoments: { getHeartMoment: vi.fn() },
    milestones: { getMilestone: vi.fn() },
    ...overrides,
  } as unknown as SharedPlanningApis;
}

describe('PlanningRelationManager pagination', () => {
  it('reaches an opaque 21st page beyond the former 1,000-item cap', async () => {
    const user = userEvent.setup();
    const getStoryTimeline = vi.fn(
      async ({ cursor }: { cursor: string | null }) => {
        const index = cursor ? Number(cursor.slice('opaque-'.length)) : 0;
        return {
          items: [memoryStory(`memory-${index}`, `Memory ${index}`)],
          nextCursor: index < 20 ? `opaque-${index + 1}` : null,
        };
      },
    );
    renderManager(relationApis({ story: { getStoryTimeline } }));

    for (let page = 1; page <= 20; page += 1) {
      await user.click(
        await screen.findByRole('button', {
          name: i18n.t('m5s3.common.loadMore'),
        }),
      );
    }

    expect(
      await screen.findByRole('option', { name: /Memory 20/ }),
    ).toBeTruthy();
    expect(getStoryTimeline).toHaveBeenLastCalledWith({
      spaceId: 'space-1',
      cursor: 'opaque-20',
      limit: 50,
      order: 'DESC',
    });
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.common.loadMore'),
      }),
    ).toBeNull();
  });

  it('deduplicates targets across pages and terminates on a repeated cursor', async () => {
    const user = userEvent.setup();
    const duplicate = memoryStory('memory-1', 'Same memory');
    const getStoryTimeline = vi
      .fn()
      .mockResolvedValueOnce({ items: [duplicate], nextCursor: 'opaque-next' })
      .mockResolvedValueOnce({ items: [duplicate], nextCursor: 'opaque-next' });
    renderManager(relationApis({ story: { getStoryTimeline } }));

    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.common.loadMore'),
      }),
    );

    await waitFor(() => expect(getStoryTimeline).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole('option', { name: /Same memory/ })).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.common.loadMore'),
      }),
    ).toBeNull();
  });

  it('keeps an authorized linked target identifiable outside the loaded page', async () => {
    const getMemory = vi.fn().mockResolvedValue({
      id: 'memory-late',
      title: 'Our older memory',
      happenedOn: new Date('2020-01-02T00:00:00Z'),
      createdAt: new Date('2020-01-03T00:00:00Z'),
    });
    renderManager(
      relationApis({
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({
            items: [{ targetId: 'memory-late', targetType: 'MEMORY' }],
          }),
          unlinkChapterMemory: vi.fn(),
        },
        memories: { getMemory },
      }),
    );

    expect(await screen.findByText('Our older memory')).toBeTruthy();
    expect(getMemory).toHaveBeenCalledWith({
      spaceId: 'space-1',
      memoryId: 'memory-late',
    });
    expect(
      screen
        .getByRole('link', { name: /Our older memory/ })
        .getAttribute('href'),
    ).toBe('/story/memories/memory-late');
    expect(
      screen.getByRole('button', { name: i18n.t('m5s3.relations.unlink') }),
    ).toBeTruthy();
  });

  it('fails closed when a linked private target cannot be authorized', async () => {
    renderManager(
      relationApis({
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({
            items: [{ targetId: 'private-heart', targetType: 'HEART_MOMENT' }],
          }),
          unlinkChapterHeartMoment: vi.fn(),
        },
        heartMoments: {
          getHeartMoment: vi.fn().mockRejectedValue(new Error('Forbidden')),
        },
      }),
    );

    expect(
      await screen.findByText(i18n.t('m5s3.relations.contentFallback')),
    ).toBeTruthy();
    expect(screen.queryByText('private-heart')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('uses the owner capability for relation mutation affordances', async () => {
    const getStoryTimeline = vi.fn().mockResolvedValue({
      items: [memoryStory('candidate', 'Candidate')],
      nextCursor: null,
    });
    renderManager(
      relationApis({
        story: { getStoryTimeline },
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({
            items: [{ targetId: 'memory-late', targetType: 'MEMORY' }],
          }),
          unlinkChapterMemory: vi.fn(),
        },
        memories: {
          getMemory: vi.fn().mockResolvedValue({
            id: 'memory-late',
            title: 'Readable memory',
            happenedOn: new Date('2026-09-01T00:00:00Z'),
            createdAt: new Date('2026-09-01T00:00:00Z'),
          }),
        },
      }),
      false,
    );

    expect(await screen.findByText('Readable memory')).toBeTruthy();
    expect(getStoryTimeline).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: i18n.t('m5s3.relations.unlink') }),
    ).toBeNull();
    expect(
      screen.queryByLabelText(i18n.t('m5s3.relations.addLabel')),
    ).toBeNull();
  });

  it('stops a cursor cycle deterministically without reconstructing cursors', () => {
    expect(
      nextRelationTargetCursor(
        { items: [], nextCursor: 'opaque-a' },
        [],
        'opaque-b',
        [null, 'opaque-a', 'opaque-b'],
      ),
    ).toBeUndefined();
  });
});
