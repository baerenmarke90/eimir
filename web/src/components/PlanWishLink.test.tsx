// @vitest-environment jsdom
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanWishLink } from './PlanWishLink';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

function setup() {
  const initial = {
    id: 'plan-1',
    spaceId: 'space-1',
    title: 'Existing trip',
    version: 3,
    status: 'IDEA',
    sourceWishId: null,
    capabilities: { canEdit: true },
  } as PlanDetail;
  const wish = {
    id: 'wish-1',
    spaceId: 'space-1',
    title: 'A weekend away',
    version: 5,
    status: 'OPEN',
  } as WishDetail;
  let resolve!: (value: { plan: PlanDetail; wish: WishDetail }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ plan: PlanDetail; wish: WishDetail }>(
    (yes, no) => {
      resolve = yes;
      reject = no;
    },
  );
  const linkWishToPlan = vi.fn(() => promise);
  const listWishes = vi.fn(async () => ({
    items: [wish],
    nextCursor: null,
    hasMore: false,
  }));
  const apis = {
    plans: { linkWishToPlan },
    wishes: { listWishes },
  } as unknown as SharedPlanningApis;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const key = authorSummaryQueryKeys.planDetail('space-1', initial.id);
  client.setQueryData(key, initial);
  const linked = vi.fn();
  function Harness() {
    const [plan, setPlan] = useState(initial);
    return (
      <PlanWishLink
        apis={apis}
        spaceId="space-1"
        plan={plan}
        disabled={false}
        onLinked={async (value) => {
          linked(value);
          client.setQueryData(key, value);
          setPlan(value);
        }}
      />
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    ...view,
    client,
    key,
    initial,
    wish,
    linked,
    resolve,
    reject,
    linkWishToPlan,
    listWishes,
  };
}

async function selectWish() {
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('m5s3.plan.linkWish') }),
  );
  fireEvent.click(await screen.findByRole('radio', { name: 'A weekend away' }));
  return screen.getByRole('button', {
    name: i18n.t('m5s3.plan.confirmWishLink'),
  });
}

it('loads on demand and confirms exactly one versioned association without replacing Plan content', async () => {
  const test = setup();
  expect(test.listWishes).not.toHaveBeenCalled();
  const confirm = await selectWish();
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(test.linkWishToPlan).toHaveBeenCalledTimes(1));
  expect(test.linkWishToPlan).toHaveBeenCalledWith({
    spaceId: 'space-1',
    planId: 'plan-1',
    ifMatch: '3',
    planWishLink: { wishId: 'wish-1', wishVersion: 5 },
  });
  await act(async () =>
    test.resolve({
      plan: { ...test.initial, sourceWishId: 'wish-1', version: 4 },
      wish: { ...test.wish, status: 'PLANNED', version: 6 },
    }),
  );
  expect(test.linked).toHaveBeenCalledTimes(1);
  const link = await screen.findByRole('link', {
    name: i18n.t('m5s3.plan.openWish'),
  });
  expect(link.getAttribute('href')).toContain('wish-1');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('keeps the choice after a conflict and waits for an explicit retry', async () => {
  const test = setup();
  fireEvent.click(await selectWish());
  await waitFor(() => expect(test.linkWishToPlan).toHaveBeenCalledTimes(1));
  await act(async () => test.reject(new ClientProblemError('conflict', 409)));
  expect(
    (screen.getByRole('radio', { name: 'A weekend away' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(test.linked).not.toHaveBeenCalled();
  expect(test.linkWishToPlan).toHaveBeenCalledTimes(1);
});

it('ignores a late association response after the owning read was revoked', async () => {
  const test = setup();
  fireEvent.click(await selectWish());
  await waitFor(() => expect(test.linkWishToPlan).toHaveBeenCalledTimes(1));
  test.client.removeQueries({ queryKey: test.key, exact: true });
  await act(async () =>
    test.resolve({
      plan: { ...test.initial, sourceWishId: 'wish-1', version: 4 },
      wish: test.wish,
    }),
  );
  expect(test.linked).not.toHaveBeenCalled();
  expect(test.client.getQueryData(test.key)).toBeUndefined();
});
