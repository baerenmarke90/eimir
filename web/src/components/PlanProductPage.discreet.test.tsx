// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import {
  type PlanUpdate,
  PlanUpdateToJSON,
} from '../api/generated/models/PlanUpdate';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { discreetTitleSuggestions } from '../client/discreetPlans';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import sharedNotes from '../i18n/locales/sharedNotes';
import { PlanProductPage } from './PlanProductPage';

const t = i18n.t.bind(i18n);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function renderPlan(overrides: Partial<PlanDetail> = {}) {
  const plan: PlanDetail = {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: 'account-ben',
    creator: { id: 'account-ben', displayName: 'Ben' },
    description: 'Lake view room, sauna at seven',
    experiencedOn: null,
    id: 'plan-1',
    placeId: 'place-1',
    plannedEnd: new Date(2099, 10, 22, 11),
    plannedOn: null,
    plannedStart: new Date(2099, 10, 21, 19),
    sourceWishId: null,
    spaceId: 'space-1',
    status: 'PLANNED',
    title: 'Hotel night just for us',
    tags: ['Hotel'],
    discreet: true,
    discreetTitleMode: 'PREVIEW',
    previewTitle: 'Weekend for two',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 3,
    ...overrides,
  };
  const requestBodies: Record<string, unknown>[] = [];
  const updatePlan = vi.fn(
    async ({ planUpdate }: { planUpdate: PlanUpdate }) => {
      requestBodies.push(
        JSON.parse(JSON.stringify(PlanUpdateToJSON(planUpdate))) as Record<
          string,
          unknown
        >,
      );
      return { ...plan, ...planUpdate, version: 4 } as PlanDetail;
    },
  );
  const listPlanNotes = vi.fn(async () => []);
  const returnPlanToWish = vi.fn(async () => ({
    wish: {},
    removedPlanId: plan.id,
  }));
  const apis = {
    plans: {
      getPlan: vi.fn(async () => plan),
      listPlanCollections: vi.fn(async () => []),
      listPlanNotes,
      listPlanStory: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        hasMore: false,
      })),
      updatePlan,
      returnPlanToWish,
    },
    places: {
      listPlaces: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  } as unknown as SharedPlanningApis;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.planDetail('space-1', plan.id),
    plan,
  );
  queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), [
    { id: 'place-1', name: 'Lakeside hotel' },
  ]);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/plans/${plan.id}`]}>
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={<PlanProductPage apis={apis} spaceId="space-1" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { plan, requestBodies, updatePlan, listPlanNotes, returnPlanToWish };
}

async function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: t('m5s3.plan.menu') }));
  fireEvent.click(
    await screen.findByRole('button', { name: t('common.edit') }),
  );
  // The menu sheet hands over to the editor once it has left.
  await waitFor(() => expect(document.querySelector('.item-menu')).toBeNull());
  await act(async () => {});
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('PlanProductPage discreet plans (#1790 F3)', () => {
  it('conceals place, prose, tags and comments until Anzeigen', () => {
    renderPlan();
    expect(
      screen.getByRole('heading', { name: 'Weekend for two' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: t('discreetPlans.lockLabel') }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('Hotel');
    expect(document.body.textContent).not.toContain('sauna');
    expect(
      screen.queryByRole('heading', { name: t('comments.heading') }),
    ).toBeNull();
    // Schedule actions stay available while concealed; the plan is still
    // ahead, so the completion waits in its menu.
    fireEvent.click(screen.getByRole('button', { name: t('m5s3.plan.menu') }));
    expect(
      screen.getByRole('button', { name: t('m5s3.plan.complete') }),
    ).toBeTruthy();
  });

  it('does not even ask for linked shared notes while concealed (#1969)', () => {
    const { listPlanNotes } = renderPlan();
    expect(listPlanNotes).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', {
        name: sharedNotes.sharedNotes.plan.heading,
      }),
    ).toBeNull();
  });

  it('reveals per view, conceals again in the background and offers Wieder verdecken', async () => {
    renderPlan();
    fireEvent.click(
      screen.getByRole('button', { name: t('discreetPlans.detail.reveal') }),
    );
    expect(
      screen.getByRole('heading', { name: 'Hotel night just for us' }),
    ).toBeTruthy();
    expect(screen.getByText('Lake view room, sauna at seven')).toBeTruthy();
    expect(screen.getByText('Lakeside hotel')).toBeTruthy();
    const conceal = screen.getByRole('button', {
      name: t('discreetPlans.detail.conceal'),
    });
    await waitFor(() => expect(document.activeElement).toBe(conceal));

    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(
      screen.getByRole('heading', { name: 'Weekend for two' }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('sauna');

    fireEvent.click(
      screen.getByRole('button', { name: t('discreetPlans.detail.reveal') }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: t('discreetPlans.detail.conceal') }),
    );
    expect(document.body.textContent).not.toContain('sauna');
  });

  it('keeps the original title visible in ORIGINAL mode while the rest stays concealed', () => {
    renderPlan({ discreetTitleMode: 'ORIGINAL' });
    expect(
      screen.getByRole('heading', { name: 'Hotel night just for us' }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('sauna');
    expect(document.body.textContent).not.toContain('Lakeside hotel');
  });

  it('turns Diskret on below Vorfreude with a prefilled neutral suggestion', async () => {
    const { plan, requestBodies } = renderPlan({
      discreet: false,
      previewTitle: null,
    });
    expect(screen.getByText('Lake view room, sauna at seven')).toBeTruthy();
    await openEditor();
    const switches = screen.getAllByRole('switch');
    expect(switches.map((node) => node.getAttribute('aria-label'))).toEqual([
      t('relationshipReflections.anticipation.show'),
      t('discreetPlans.editor.label'),
    ]);
    const discreet = switches[1];
    expect(discreet.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(discreet);
    const suggestions = discreetTitleSuggestions(plan, t);
    const preview = screen.getByRole('textbox', {
      name: t('discreetPlans.editor.previewTitle'),
    }) as HTMLInputElement;
    expect(preview.value).toBe(suggestions[0]);
    expect(
      (
        screen.getByRole('radio', {
          name: t('discreetPlans.editor.preview'),
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: suggestions[1] }));
    expect(preview.value).toBe(suggestions[1]);
    fireEvent.click(
      screen.getByRole('button', { name: t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(requestBodies).toHaveLength(1));
    expect(requestBodies[0]).toMatchObject({
      discreet: true,
      discreetTitleMode: 'PREVIEW',
      previewTitle: suggestions[1],
    });
  });

  it('saves the original-title mode and keeps the chosen preview title', async () => {
    const { requestBodies } = renderPlan();
    await openEditor();
    fireEvent.click(
      screen.getByRole('radio', { name: t('discreetPlans.editor.original') }),
    );
    expect(
      screen.getByText(t('discreetPlans.editor.originalHelp')),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(requestBodies).toHaveLength(1));
    expect(requestBodies[0]).toMatchObject({
      discreet: true,
      discreetTitleMode: 'ORIGINAL',
      previewTitle: 'Weekend for two',
    });
  });
});

describe('PlanProductPage back to wish', () => {
  it('offers it in the item menu behind a confirmation, not in the editor', async () => {
    const { returnPlanToWish } = renderPlan({ sourceWishId: 'wish-1' });
    fireEvent.click(screen.getByRole('button', { name: t('m5s3.plan.menu') }));
    fireEvent.click(
      await screen.findByRole('button', { name: t('m5s3.plan.returnToWish') }),
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: t('m5s3.plan.returnToWishConfirmTitle'),
    });
    expect(returnPlanToWish).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: t('m5s3.plan.returnToWish') }),
    );
    await waitFor(() =>
      expect(returnPlanToWish).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'space-1', planId: 'plan-1' }),
      ),
    );
  });

  it('is not offered without a source wish or in the editor', async () => {
    renderPlan({ sourceWishId: 'wish-1' });
    await openEditor();
    expect(
      screen.queryByRole('button', { name: t('m5s3.plan.returnToWish') }),
    ).toBeNull();
    cleanup();
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: t('m5s3.plan.menu') }));
    expect(
      screen.queryByRole('button', { name: t('m5s3.plan.returnToWish') }),
    ).toBeNull();
  });
});
