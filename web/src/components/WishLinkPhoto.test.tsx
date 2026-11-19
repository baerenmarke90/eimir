// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { stageSharedWishDraft } from '../client/sharedWishDraft';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanningCreatePage } from './PlanningCreatePage';
import { PlanProductPage } from './PlanProductPage';
import { WishProductPage } from './WishProductPage';

const SCOPE = JSON.stringify([undefined, undefined, 'space-1']);
const LINK = 'https://www.hut.example/rooms';

const WISH: WishDetail = {
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-09-01T10:00:00Z'),
  createdBy: 'account-anna',
  creator: { id: 'account-anna', displayName: 'Anna' },
  plan: null,
  hasMemory: false,
  followedFromWishId: null,
  linkUrl: null,
  photoAttachmentId: null,
  seriesId: 'wish-1',
  seriesPosition: 1,
  id: 'wish-1',
  spaceId: 'space-1',
  status: 'OPEN',
  title: 'Mountain hut weekend',
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  version: 1,
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function renderWishPage(
  wish: WishDetail,
  state?: Record<string, unknown>,
  updatedWish: WishDetail = wish,
) {
  const updateWish = vi.fn().mockResolvedValue(updatedWish);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.wishDetail('space-1', wish.id),
    wish,
  );
  queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), []);
  const apis = {
    wishes: { getWish: vi.fn(async () => wish), updateWish },
  } as unknown as SharedPlanningApis;
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: `/plan/wishes/${wish.id}`, state }]}
      >
        <Routes>
          <Route
            path="/plan/wishes/:wishId"
            element={<WishProductPage apis={apis} spaceId="space-1" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { updateWish };
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: i18n.t('m5s3.wish.menu') }),
  );
  await user.click(await screen.findByText(i18n.t('common.edit')));
  await screen.findByRole('button', {
    name: i18n.t('m5s3.common.saveChanges'),
  });
}

describe('Wish detail link', () => {
  it('shows the host as one findable external link without opener or referrer', () => {
    renderWishPage({ ...WISH, linkUrl: LINK });
    const link = screen.getByRole('link', {
      name: i18n.t('m5s3.wish.link.openNamed', { host: 'hut.example' }),
    });
    expect(link.getAttribute('href')).toBe(LINK);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toContain('hut.example');
    expect(link.textContent).toContain(i18n.t('m5s3.wish.link.open'));
  });

  it('renders nothing for a stored address that is not a web link', () => {
    renderWishPage({ ...WISH, linkUrl: 'javascript:alert(1)' });
    expect(document.querySelector('.wish-link-row')).toBeNull();
  });

  it('shows no link row and no photo for a Wish without either', () => {
    renderWishPage(WISH);
    expect(document.querySelector('.wish-link-row')).toBeNull();
    expect(document.querySelector('.wish-photo-gallery')).toBeNull();
  });

  it('shows the photo as a cover image even when it cannot be loaded', async () => {
    renderWishPage({ ...WISH, photoAttachmentId: 'attachment-1' });
    expect(document.querySelector('.wish-photo-gallery')).not.toBeNull();
    await waitFor(() =>
      expect(screen.getByText(i18n.t('media.unavailable'))).toBeTruthy(),
    );
  });
});

describe('Wish editor link', () => {
  it('removes only the link with an explicit null and leaves the photo alone', async () => {
    const user = userEvent.setup();
    const { updateWish } = renderWishPage({ ...WISH, linkUrl: LINK });
    await openEditor(user);
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.tool') }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.wish.link.remove'),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
    const body = updateWish.mock.calls[0][0].wishUpdate;
    expect(body.linkUrl).toBeNull();
    expect('photoAttachmentId' in body).toBe(false);
  });

  it('sends neither field for an unrelated edit', async () => {
    const user = userEvent.setup();
    const { updateWish } = renderWishPage({ ...WISH, linkUrl: LINK });
    await openEditor(user);
    const title = screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.title'),
    });
    await user.clear(title);
    await user.type(title, 'Mountain hut in winter');
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
    const body = updateWish.mock.calls[0][0].wishUpdate;
    expect(body.title).toBe('Mountain hut in winter');
    expect('linkUrl' in body).toBe(false);
    expect('photoAttachmentId' in body).toBe(false);
  });

  it('adds a link without a scheme as a normalized https link', async () => {
    const user = userEvent.setup();
    const { updateWish } = renderWishPage(WISH);
    await openEditor(user);
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.tool') }),
    );
    const field = await screen.findByLabelText(i18n.t('m5s3.wish.link.label'));
    await user.type(field, '  hut.example/rooms  ');
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.done') }),
    );
    expect(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.wish.link.editNamed', { host: 'hut.example' }),
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
    expect(updateWish.mock.calls[0][0].wishUpdate.linkUrl).toBe(
      'https://hut.example/rooms',
    );
  });

  it('explains an invalid link and keeps it out of the draft', async () => {
    const user = userEvent.setup();
    const { updateWish } = renderWishPage(WISH);
    await openEditor(user);
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.tool') }),
    );
    const field = await screen.findByLabelText(i18n.t('m5s3.wish.link.label'));
    await user.type(field, 'javascript:alert(1)');
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.done') }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      i18n.t('m5s3.wish.link.invalid.scheme'),
    );
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(updateWish).not.toHaveBeenCalled();
  });
});

describe('Wish editor with shared content', () => {
  it('keeps an occupied link by default and replaces it only on request', async () => {
    const shared = 'https://new.example/offer';
    const key = stageSharedWishDraft(SCOPE, { linkUrl: shared });
    const { updateWish } = renderWishPage(
      { ...WISH, linkUrl: LINK },
      { wishShareKey: key, wishShareMode: 'add' },
    );
    const sheet = await screen.findByRole('dialog');
    expect(sheet.textContent).toContain(i18n.t('m5s3.wish.merge.title'));
    expect(
      (
        screen.getByRole('radio', {
          name: i18n.t('m5s3.wish.merge.keep'),
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('radio', { name: i18n.t('m5s3.wish.merge.replace') }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.merge.continue') }),
    );
    await screen.findByRole('button', {
      name: i18n.t('m5s3.common.saveChanges'),
    });
    // Nothing is saved before the couple taps Save.
    expect(updateWish).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(updateWish).toHaveBeenCalledTimes(1));
    expect(updateWish.mock.calls[0][0].wishUpdate.linkUrl).toBe(shared);
  });

  it('fills an empty Wish straight into the editor without asking', async () => {
    const key = stageSharedWishDraft(SCOPE, {
      linkUrl: 'https://new.example/offer',
      description: 'Booked out in summer',
    });
    const { updateWish } = renderWishPage(WISH, {
      wishShareKey: key,
      wishShareMode: 'add',
    });
    await screen.findByRole('button', {
      name: i18n.t('m5s3.common.saveChanges'),
    });
    expect(screen.queryByText(i18n.t('m5s3.wish.merge.title'))).toBeNull();
    expect(
      (
        screen.getByRole('textbox', {
          name: i18n.t('m5s3.common.description'),
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('Booked out in summer');
    expect(updateWish).not.toHaveBeenCalled();
  });

  it('ignores shared content for a Wish the viewer cannot edit', async () => {
    const key = stageSharedWishDraft(SCOPE, { linkUrl: LINK });
    renderWishPage(
      {
        ...WISH,
        capabilities: { canComment: false, canDelete: false, canEdit: false },
      },
      { wishShareKey: key, wishShareMode: 'add' },
    );
    await screen.findByText(WISH.title);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    ).toBeNull();
  });
});

describe('Wish creation with a link', () => {
  function renderCreate(state?: Record<string, unknown>) {
    const createWish = vi.fn().mockResolvedValue({ id: 'wish-created' });
    const apis = { wishes: { createWish } } as unknown as SharedPlanningApis;
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <MemoryRouter
          initialEntries={[{ pathname: '/plan/wishes/new', state }]}
        >
          <Routes>
            <Route
              path="/plan/wishes/new"
              element={
                <PlanningCreatePage kind="wish" apis={apis} spaceId="space-1" />
              }
            />
            <Route path="/plan/wishes/:wishId" element={<p>Wish result</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { createWish };
  }

  it('creates the Wish with a normalized link and no photo field', async () => {
    const user = userEvent.setup();
    const { createWish } = renderCreate();
    await user.type(
      screen.getByRole('textbox', { name: i18n.t('m5s3.wish.intentionLabel') }),
      'Mountain hut weekend',
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.tool') }),
    );
    await user.type(
      await screen.findByLabelText(i18n.t('m5s3.wish.link.label')),
      'hut.example/rooms',
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.wish.link.done') }),
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.save') }),
    );
    await waitFor(() => expect(createWish).toHaveBeenCalledTimes(1));
    const body = createWish.mock.calls[0][0].wishCreate;
    expect(body.linkUrl).toBe('https://hut.example/rooms');
    expect('photoAttachmentId' in body).toBe(false);
  });

  it('prefills a shared title, description and link but saves nothing', async () => {
    const key = stageSharedWishDraft(SCOPE, {
      title: 'Hut above the lake',
      description: 'Sleeps six',
      linkUrl: LINK,
    });
    const { createWish } = renderCreate({
      wishShareKey: key,
      wishShareMode: 'create',
    });
    expect(
      (
        screen.getByRole('textbox', {
          name: i18n.t('m5s3.wish.intentionLabel'),
        }) as HTMLInputElement
      ).value,
    ).toBe('Hut above the lake');
    expect(
      (
        screen.getByRole('textbox', {
          name: i18n.t('m5s3.common.description'),
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('Sleeps six');
    await screen.findByRole('button', {
      name: i18n.t('m5s3.wish.link.editNamed', { host: 'hut.example' }),
    });
    expect(createWish).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.save') }),
    );
    await waitFor(() => expect(createWish).toHaveBeenCalledTimes(1));
    expect(createWish.mock.calls[0][0].wishCreate.linkUrl).toBe(LINK);
  });
});

describe('Plan reach-through to the source Wish', () => {
  function plan(): PlanDetail {
    return {
      capabilities: { canComment: true, canDelete: true, canEdit: true },
      createdAt: new Date('2026-08-01T10:00:00Z'),
      createdBy: 'account-ben',
      creator: { id: 'account-ben', displayName: 'Ben' },
      description: null,
      experiencedOn: null,
      id: 'plan-1',
      placeId: null,
      plannedEnd: null,
      plannedStart: null,
      sourceWishId: 'wish-1',
      spaceId: 'space-1',
      status: 'PLANNED',
      title: 'Hut weekend',
      updatedAt: new Date('2026-08-01T10:00:00Z'),
      version: 3,
    } as unknown as PlanDetail;
  }

  function markup(wish: WishDetail | null) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s3', 'plan', 'space-1', 'plan-1'], plan());
    queryClient.setQueryData(
      authorSummaryQueryKeys.placeOptions('space-1'),
      [],
    );
    if (wish)
      queryClient.setQueryData(
        authorSummaryQueryKeys.wishDetail('space-1', wish.id),
        wish,
      );
    const apis = {
      wishes: { getWish: vi.fn().mockRejectedValue(new Error('forbidden')) },
    } as unknown as SharedPlanningApis;
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/plans/plan-1']}>
          <Routes>
            <Route
              path="/plan/plans/:planId"
              element={<PlanProductPage apis={apis} spaceId="space-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('shows the original wish link and photo read-only', () => {
    const html = markup({
      ...WISH,
      linkUrl: LINK,
      photoAttachmentId: 'attachment-1',
    });
    expect(html).toContain('wish-origin-media');
    expect(html).toContain(i18n.t('m5s3.wish.origin.label'));
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain('wish-photo-gallery');
  });

  it('shows nothing for a source Wish without link or photo', () => {
    expect(markup(WISH)).not.toContain('wish-origin-media');
  });

  it('shows nothing when the source Wish cannot be read', () => {
    expect(markup(null)).not.toContain('wish-origin-media');
  });
});
