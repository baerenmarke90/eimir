// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterDetail } from '../api/generated/models/ChapterDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import { i18n } from '../i18n';
import { ChapterProductPage } from './ChapterProductPage';
import { ChaptersOverviewPage } from './ChaptersOverviewPage';

const CHAPTER: ChapterDetail = {
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-08-01T10:00:00Z'),
  createdBy: 'account-1',
  creator: { id: 'account-1', displayName: 'Lea' },
  description: 'Summer stories',
  endOn: null,
  id: 'chapter-1',
  placeId: null,
  spaceId: 'space-1',
  startOn: new Date('2026-06-01T00:00:00Z'),
  title: 'Summer',
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  version: 1,
};

const NEXT_CHAPTER: ChapterDetail = {
  ...CHAPTER,
  id: 'chapter-2',
  title: 'Autumn',
};

function createApis(chapterOverrides: Record<string, unknown> = {}) {
  return {
    chapters: {
      getChapter: vi.fn().mockResolvedValue(CHAPTER),
      listChapters: vi.fn().mockResolvedValue({
        items: [NEXT_CHAPTER],
        nextCursor: null,
      }),
      ...chapterOverrides,
    },
    story: {
      getStoryTimeline: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
    },
    chapterRelations: {
      listChapterContent: vi.fn().mockResolvedValue({ items: [] }),
    },
    memories: { getMemory: vi.fn() },
    heartMoments: { getHeartMoment: vi.fn() },
    milestones: { getMilestone: vi.fn() },
  } as unknown as SharedPlanningApis;
}

function renderChapter(
  apis = createApis(),
  includeOverview = false,
  configureClient?: (client: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.chapterDetail('space-1', CHAPTER.id),
    CHAPTER,
  );
  queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), []);
  configureClient?.(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/chapters/${CHAPTER.id}`]}>
        <Routes>
          <Route
            path="/plan/chapters/:chapterId"
            element={<ChapterProductPage apis={apis} spaceId="space-1" />}
          />
          {includeOverview ? (
            <Route
              path="/story/chapters"
              element={<ChaptersOverviewPage apis={apis} spaceId="space-1" />}
            />
          ) : null}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ChapterProductPage read presentation', () => {
  it('shows the existing period and linked Place as canonical read context', async () => {
    const chapterWithPlace: ChapterDetail = {
      ...CHAPTER,
      endOn: new Date('2026-08-31T00:00:00Z'),
      placeId: 'place-lake',
    };
    const apis = createApis({
      getChapter: vi.fn().mockResolvedValue(chapterWithPlace),
    });

    renderChapter(apis, false, (queryClient) => {
      queryClient.setQueryData(
        authorSummaryQueryKeys.chapterDetail('space-1', CHAPTER.id),
        chapterWithPlace,
      );
      queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), [
        { id: 'place-lake', name: 'Lake' },
      ]);
    });

    expect(
      await screen.findByRole('heading', {
        name: i18n.t('m5s3.chapter.contextHeading'),
      }),
    ).toBeTruthy();
    expect(screen.getByText(/01\.06\.2026/)).toBeTruthy();
    expect(screen.getByText(/31\.08\.2026/)).toBeTruthy();
    const placeLink = screen.getByRole('link', { name: /Lake/ });
    expect(placeLink.getAttribute('href')).toBe('/plan/places/place-lake');
  });
});

describe('ChapterProductPage editor lifecycle', () => {
  it('reads Chapter places from the canonical selector cache', async () => {
    const user = userEvent.setup();
    renderChapter(createApis(), false, (queryClient) => {
      queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), [
        { id: 'place-lake', name: 'Lake' },
      ]);
    });

    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    expect(screen.getByRole('option', { name: 'Lake' })).toBeTruthy();
  });

  it('focuses the editor and closes a clean editor with Escape', async () => {
    const user = userEvent.setup();
    renderChapter();
    const edit = screen.getByRole('button', { name: i18n.t('common.edit') });
    await user.click(edit);
    const title = screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.title'),
    });
    expect(document.activeElement).toBe(title);
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.common.title') }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
  });

  it('uses Browser Back to ask before discarding and retains the full draft', async () => {
    const user = userEvent.setup();
    renderChapter();
    const edit = screen.getByRole('button', { name: i18n.t('common.edit') });
    await user.click(edit);
    const title = screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.title'),
    }) as HTMLInputElement;
    const description = screen.getByLabelText(
      i18n.t('m5s3.common.description'),
    ) as HTMLTextAreaElement;
    await user.clear(title);
    await user.type(title, 'A longer summer');
    await user.clear(description);
    await user.type(description, 'Draft details');

    window.history.back();
    await screen.findByRole('alertdialog');
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect(title.value).toBe('A longer summer');
    expect(description.value).toBe('Draft details');

    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.discardConfirm'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
  });

  it('blocks dismissal while save is pending', async () => {
    const user = userEvent.setup();
    const updateChapter = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderChapter(createApis({ updateChapter }));
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const title = screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.title'),
    });
    await user.type(title, ' changed');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.saveChanges'),
      }),
    );
    await waitFor(() => expect(updateChapter).toHaveBeenCalledTimes(1));

    await user.keyboard('{Escape}');
    window.history.back();

    expect(
      screen.getByRole('textbox', { name: i18n.t('m5s3.common.title') }),
    ).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('restores delete focus and focuses the successor after deletion', async () => {
    const user = userEvent.setup();
    const deleteChapter = vi.fn().mockResolvedValue(undefined);
    const apis = createApis({ deleteChapter });
    renderChapter(apis, true, (queryClient) => {
      queryClient.setQueryData(authorSummaryQueryKeys.chapters('space-1'), {
        pages: [
          {
            items: [CHAPTER, NEXT_CHAPTER],
            nextCursor: null,
            hasMore: false,
          },
        ],
        pageParams: [null],
      });
    });
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const deleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    await user.click(deleteTrigger);
    expect(document.activeElement?.id).toBe('chapter-delete-heading');

    const deleteCancel = screen
      .getAllByRole('button', { name: i18n.t('common.cancel') })
      .at(-1);
    expect(deleteCancel).toBeDefined();
    await user.click(deleteCancel as HTMLButtonElement);
    const restoredDeleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    expect(document.activeElement).toBe(restoredDeleteTrigger);

    await user.click(restoredDeleteTrigger);
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    );
    const successor = (await screen.findByText(NEXT_CHAPTER.title)).closest(
      'a',
    );
    expect(successor).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(successor));
  });
});
