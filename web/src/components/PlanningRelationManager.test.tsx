// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { onlineManager } from '@tanstack/react-query';
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

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});
async function openPicker() {
  await userEvent.click(
    await screen.findByRole('button', {
      name: i18n.t('m5s3.relations.addLabel'),
    }),
  );
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

    await openPicker();
    for (let page = 1; page <= 20; page += 1) {
      await user.click(
        await screen.findByRole('button', {
          name: i18n.t('m5s3.common.loadMore'),
        }),
      );
    }

    expect(
      await screen.findByRole('checkbox', { name: /Memory 20/ }),
    ).toBeTruthy();
    expect(getStoryTimeline).toHaveBeenLastCalledWith(
      {
        spaceId: 'space-1',
        cursor: 'opaque-20',
        limit: 50,
        order: 'DESC',
      },
      { signal: expect.any(AbortSignal) },
    );
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

    await openPicker();
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.common.loadMore'),
      }),
    );

    await waitFor(() => expect(getStoryTimeline).toHaveBeenCalledTimes(2));
    expect(
      screen.getAllByRole('checkbox', { name: /Same memory/ }),
    ).toHaveLength(1);
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

describe('PlanningRelationManager moment picker', () => {
  it('loads choices on demand, stages multiple moments and returns to the saved content', async () => {
    const user = userEvent.setup();
    const relations: { targetId: string; targetType: 'MEMORY' }[] = [];
    const link = vi.fn(async ({ targetId }) => {
      relations.push({ targetId, targetType: 'MEMORY' });
    });
    const apis = relationApis({
      story: {
        getStoryTimeline: vi.fn().mockResolvedValue({
          items: [
            memoryStory('a', 'Summer together'),
            memoryStory('b', 'Our picnic'),
          ],
          nextCursor: null,
        }),
      },
      chapterRelations: {
        listChapterContent: vi.fn(async () => ({ items: [...relations] })),
        linkChapterMemory: link,
      },
      memories: {
        getMemory: vi.fn(async ({ memoryId }) => ({
          id: memoryId,
          title: memoryId === 'a' ? 'Summer together' : 'Our picnic',
          createdAt: new Date('2026-09-01'),
          attachments: [],
        })),
      },
    });
    renderManager(apis);
    expect(apis.story.getStoryTimeline).not.toHaveBeenCalled();
    await openPicker();
    const sheet = await screen.findByRole('dialog');
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    expect(screen.queryByRole('combobox')).toBeNull();
    await user.click(
      await within(sheet).findByRole('checkbox', { name: /Summer together/ }),
    );
    await user.click(
      within(sheet).getByRole('checkbox', { name: /Our picnic/ }),
    );
    expect(link).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.addSelected', { count: 2 }),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(link).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: /Summer together/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Our picnic/ })).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: i18n.t('m5s3.relations.addLabel') }),
      ),
    );
  });

  it('cancels a clean picker and explicitly discards staged selection without linking', async () => {
    const user = userEvent.setup();
    const link = vi.fn();
    renderManager(
      relationApis({
        story: {
          getStoryTimeline: vi.fn().mockResolvedValue({
            items: [memoryStory('a', 'Summer together')],
            nextCursor: null,
          }),
        },
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({ items: [] }),
          linkChapterMemory: link,
        },
      }),
    );
    await openPicker();
    await user.click(
      screen.getByRole('button', { name: i18n.t('taskSheets.close') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await openPicker();
    await user.click(
      await screen.findByRole('checkbox', { name: /Summer together/ }),
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('taskSheets.close') }),
    );
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.relations.discard') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(link).not.toHaveBeenCalled();
  });

  it('never offers private or unknown-visibility heart moments in shared choices', async () => {
    renderManager(
      relationApis({
        story: {
          getStoryTimeline: vi.fn().mockResolvedValue({
            items: [
              memoryStory('a', 'Summer together'),
              {
                kind: 'HEART_MOMENT',
                effectiveDate: new Date(),
                heartMoment: {
                  id: 'private',
                  text: 'Secret thought',
                  visibility: 'PRIVATE',
                },
              },
              {
                kind: 'HEART_MOMENT',
                effectiveDate: new Date(),
                heartMoment: { id: 'unknown', text: 'Unknown audience' },
              },
              {
                kind: 'HEART_MOMENT',
                effectiveDate: new Date(),
                heartMoment: {
                  id: 'shared',
                  text: 'A shared thought',
                  visibility: 'SHARED',
                },
              },
            ],
            nextCursor: null,
          }),
        },
      }),
    );
    await openPicker();
    expect(
      await screen.findByRole('checkbox', { name: /A shared thought/ }),
    ).toBeTruthy();
    expect(screen.queryByText('Secret thought')).toBeNull();
    expect(screen.queryByText('Unknown audience')).toBeNull();
  });

  it('searches history on the server and excludes private search results', async () => {
    const searchSpaceContent = vi.fn().mockResolvedValue({
      items: [
        {
          type: 'MEMORY',
          scope: 'SHARED',
          id: 'old',
          title: 'Summer in 2019',
          excerpt: 'Our first holiday',
          occurredOn: new Date('2019-08-01'),
        },
        {
          type: 'HEART_MOMENT',
          scope: 'PRIVATE',
          id: 'secret',
          title: 'Private search hit',
        },
      ],
      nextCursor: null,
    });
    const user = userEvent.setup();
    renderManager(relationApis({ search: { searchSpaceContent } }));
    await openPicker();
    await user.type(screen.getByRole('searchbox'), 'Summer');
    expect(
      await screen.findByRole('checkbox', { name: /Summer in 2019/ }),
    ).toBeTruthy();
    expect(searchSpaceContent).toHaveBeenLastCalledWith(
      {
        spaceId: 'space-1',
        q: 'Summer',
        type: ['MEMORY', 'HEART_MOMENT', 'MILESTONE'],
        cursor: null,
        limit: 50,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(screen.queryByText('Private search hit')).toBeNull();
  });

  it('retains unsaved selections after partial failure and retries only those', async () => {
    const user = userEvent.setup();
    const relations: { targetId: string; targetType: 'MEMORY' }[] = [];
    let failSecond = true;
    const link = vi.fn(async ({ targetId }) => {
      if (targetId === 'b' && failSecond) throw new Error('Network error');
      relations.push({ targetId, targetType: 'MEMORY' });
    });
    renderManager(
      relationApis({
        story: {
          getStoryTimeline: vi.fn().mockResolvedValue({
            items: [
              memoryStory('a', 'Saved first'),
              memoryStory('b', 'Retry second'),
            ],
            nextCursor: null,
          }),
        },
        chapterRelations: {
          listChapterContent: vi.fn(async () => ({ items: [...relations] })),
          linkChapterMemory: link,
        },
        memories: {
          getMemory: vi.fn(async ({ memoryId }) => ({
            id: memoryId,
            title: 'Saved first',
            createdAt: new Date('2026-09-01'),
          })),
        },
      }),
    );
    await openPicker();
    await user.click(
      await screen.findByRole('checkbox', { name: /Saved first/ }),
    );
    await user.click(screen.getByRole('checkbox', { name: /Retry second/ }));
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.addSelected', { count: 2 }),
      }),
    );
    await waitFor(() => expect(link).toHaveBeenCalledTimes(2));
    expect(
      (
        screen.getByRole('checkbox', {
          name: /Retry second/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.queryByRole('checkbox', { name: /Saved first/ })).toBeNull();
    failSecond = false;
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.addSelected', { count: 1 }),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(link.mock.calls.map(([params]) => params.targetId)).toEqual([
      'a',
      'b',
      'b',
    ]);
  });

  it('blocks duplicate confirmation and dismissal while adding', async () => {
    const user = userEvent.setup();
    const link = vi.fn(() => new Promise(() => undefined));
    renderManager(
      relationApis({
        story: {
          getStoryTimeline: vi.fn().mockResolvedValue({
            items: [memoryStory('a', 'Pending memory')],
            nextCursor: null,
          }),
        },
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({ items: [] }),
          linkChapterMemory: link,
        },
      }),
    );
    await openPicker();
    await user.click(
      await screen.findByRole('checkbox', { name: /Pending memory/ }),
    );
    await user.dblClick(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.addSelected', { count: 1 }),
      }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('reports an offline write immediately without queuing a relation', async () => {
    const user = userEvent.setup();
    const link = vi.fn();
    renderManager(
      relationApis({
        story: {
          getStoryTimeline: vi.fn().mockResolvedValue({
            items: [memoryStory('a', 'Offline memory')],
            nextCursor: null,
          }),
        },
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({ items: [] }),
          linkChapterMemory: link,
        },
      }),
    );
    await openPicker();
    await user.click(
      await screen.findByRole('checkbox', { name: /Offline memory/ }),
    );
    onlineManager.setOnline(false);
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.addSelected', { count: 1 }),
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.relations.addSelected', { count: 1 }),
          })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    expect(link).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: /Offline memory/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
});

describe('PlanningRelationManager context and privacy', () => {
  it('keeps staged choices across server-backed type filters', async () => {
    const user = userEvent.setup();
    const getStoryTimeline = vi.fn(async ({ type }) => ({
      items: !type
        ? [memoryStory('a', 'Keep this memory')]
        : [
            {
              kind: 'MILESTONE',
              effectiveDate: new Date('2026-09-01'),
              milestone: { id: 'milestone', title: 'Our anniversary' },
            },
          ],
      nextCursor: null,
    }));
    renderManager(relationApis({ story: { getStoryTimeline } }));
    await openPicker();
    await user.click(
      await screen.findByRole('checkbox', { name: /Keep this memory/ }),
    );
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.filter.MILESTONE'),
      }),
    );
    await screen.findByRole('checkbox', { name: /Our anniversary/ });
    expect(getStoryTimeline).toHaveBeenLastCalledWith(
      {
        spaceId: 'space-1',
        cursor: null,
        limit: 50,
        order: 'DESC',
        type: ['MILESTONE'],
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s3.relations.addSelected', { count: 1 }),
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.relations.all') }),
    );
    expect(
      (
        (await screen.findByRole('checkbox', {
          name: /Keep this memory/,
        })) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
  it('uses Browser Back to close an unmodified picker and restores its trigger', async () => {
    renderManager(relationApis());
    await openPicker();
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: i18n.t('m5s3.relations.addLabel') }),
      ),
    );
  });
  it('does not reconstruct a readable private heart moment as a shared link', async () => {
    renderManager(
      relationApis({
        chapterRelations: {
          listChapterContent: vi.fn().mockResolvedValue({
            items: [{ targetId: 'private', targetType: 'HEART_MOMENT' }],
          }),
        },
        heartMoments: {
          getHeartMoment: vi.fn().mockResolvedValue({
            id: 'private',
            text: 'Readable but still private',
            visibility: 'PRIVATE',
            happenedOn: new Date('2026-09-01'),
          }),
        },
      }),
    );
    await screen.findByText(i18n.t('m5s3.relations.contentFallback'));
    expect(screen.queryByText('Readable but still private')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
