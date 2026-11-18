// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { ClientProblemError } from '../client/problemDetails';
import { i18n } from '../i18n';
import { ChapterCreatePage } from './ChapterCreatePage';

function Result() {
  const { chapterId } = useParams();
  return <h1>Result {chapterId}</h1>;
}
function setup(
  createChapter = vi.fn().mockResolvedValue({ id: 'actual-chapter' }),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const apis = { chapters: { createChapter } } as unknown as SharedPlanningApis;
  const page = (accountId: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan/chapters/new']}>
        <Routes>
          <Route
            path="/plan/chapters/new"
            element={
              <ChapterCreatePage
                apis={apis}
                spaceId="space"
                accountId={accountId}
              />
            }
          />
          <Route path="/plan/chapters/:chapterId" element={<Result />} />
          <Route path="/story/chapters" element={<h1>Chapters home</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(page('account-a'));
  return { createChapter, view, page };
}
const title = () =>
  screen.getByRole('textbox', { name: i18n.t('m5s3.common.title') });
const save = () =>
  screen.getByRole('button', { name: i18n.t('m5s3.common.save') });
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('Chapter capture task', () => {
  it('retains entered words on failure and opens the actual result after a deliberate retry', async () => {
    const user = userEvent.setup();
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ClientProblemError('server', 503))
      .mockResolvedValueOnce({ id: 'actual-chapter' });
    setup(create);
    await user.type(title(), 'Our home');
    await user.type(
      screen.getByLabelText(i18n.t('m5s3.common.description')),
      'Small rituals',
    );
    await user.click(save());
    await waitFor(() => expect(save().hasAttribute('disabled')).toBe(false));
    expect((title() as HTMLInputElement).value).toBe('Our home');
    expect(
      (
        screen.getByLabelText(
          i18n.t('m5s3.common.description'),
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Small rituals');
    await user.click(save());
    expect(
      await screen.findByRole('heading', { name: 'Result actual-chapter' }),
    ).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].chapterCreate).toEqual({
      title: 'Our home',
      description: 'Small rituals',
      startOn: undefined,
      endOn: undefined,
      placeId: undefined,
    });
  });

  it('uses protected Back and allows keeping or deliberately discarding a dirty draft', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(title(), 'A chapter');
    await user.click(
      screen.getByRole('button', { name: i18n.t('taskBoundary.back') }),
    );
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect((title() as HTMLInputElement).value).toBe('A chapter');
    await user.click(
      screen.getByRole('button', { name: i18n.t('taskBoundary.back') }),
    );
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.discardConfirm'),
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Chapters home' }),
    ).toBeTruthy();
  });

  it('rejects an offline write without silently pausing it for later dispatch', async () => {
    const user = userEvent.setup();
    const { createChapter } = setup();
    await user.type(title(), 'Offline draft');
    onlineManager.setOnline(false);
    await user.click(save());
    await waitFor(() => expect(save().hasAttribute('disabled')).toBe(false));
    expect(createChapter).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    expect(createChapter).not.toHaveBeenCalled();
    expect((title() as HTMLInputElement).value).toBe('Offline draft');
  });

  it('blocks duplicate submit and exit during pending creation and ignores a late account result', async () => {
    let resolve!: (value: { id: string }) => void;
    const create = vi.fn().mockReturnValue(
      new Promise<{ id: string }>((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    const { view, page } = setup(create);
    await user.type(title(), 'Pending chapter');
    await user.click(save());
    fireEvent.submit(
      screen
        .getByRole('textbox', { name: i18n.t('m5s3.common.description') })
        .closest('form') as HTMLFormElement,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole('button', { name: i18n.t('taskBoundary.back') })
        .hasAttribute('disabled'),
    ).toBe(true);
    view.rerender(page('account-b'));
    await act(async () => resolve({ id: 'old-account-result' }));
    expect(
      screen.queryByRole('heading', { name: /old-account-result/ }),
    ).toBeNull();
    expect((title() as HTMLInputElement).value).toBe('');
  });
});
