// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanCollectionLinks } from './PlanCollectionLinks';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const plan = { id: 'plan-1', capabilities: { canEdit: true } } as PlanDetail;
const list = (id: string, title: string) =>
  ({ id, title, items: [] }) as unknown as CollectionDetail;

function setup({
  failSecond = false,
  editing = true,
  initialLinked = [],
}: {
  failSecond?: boolean;
  editing?: boolean;
  initialLinked?: CollectionDetail[];
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    authorSummaryQueryKeys.planDetail('space-1', plan.id),
    plan,
  );
  let linked = initialLinked;
  const listPlanCollections = vi.fn(async () => [...linked]);
  const all = [list('z', 'Zelten'), list('a', 'Ausflüge')];
  const link = vi.fn(async ({ collectionId }: { collectionId: string }) => {
    if (failSecond && collectionId === 'z')
      throw new Error('Network unavailable');
    linked = [...linked, all.find((item) => item.id === collectionId)!];
  });
  const unlink = vi.fn(async ({ collectionId }: { collectionId: string }) => {
    linked = linked.filter((item) => item.id !== collectionId);
  });
  const listCollections = vi.fn(async ({ cursor }: { cursor?: string }) => ({
    items: cursor ? [all[1]] : [all[0]],
    nextCursor: cursor ? null : 'second',
  }));
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlanCollectionLinks
          spaceId="space-1"
          plan={plan}
          disabled={false}
          editing={editing}
          apis={
            {
              plans: {
                listPlanCollections,
                linkPlanCollection: link,
                unlinkPlanCollection: unlink,
              },
              collections: { listCollections },
            } as unknown as SharedPlanningApis
          }
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { link, unlink, listCollections, listPlanCollections };
}

describe('Plan-linked canonical lists', () => {
  it('keeps linked lists readable without management actions in normal detail', async () => {
    const api = setup({
      editing: false,
      initialLinked: [list('a', 'Ausflüge')],
    });
    expect(
      await screen.findByRole('button', { name: /^Ausflüge/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: i18n.t('m5s3.collection.create') }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.collection.unlink', { title: 'Ausflüge' }),
      }),
    ).toBeNull();
    expect(api.listCollections).not.toHaveBeenCalled();
    expect(api.link).not.toHaveBeenCalled();
    expect(api.unlink).not.toHaveBeenCalled();
  });

  it('opens the canonical checklist in a sheet and updates its Plan row after checking and adding', async () => {
    let shared = {
      id: 'picnic-list',
      spaceId: 'space-1',
      title: 'Picnic list',
      version: 1,
      capabilities: { canEdit: true, canDelete: true },
      items: [
        {
          id: 'blanket',
          title: 'Blanket',
          completed: false,
          position: 0,
          version: 1,
          collectionId: 'picnic-list',
          capabilities: { canEdit: true, canDelete: true },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'account',
          creator: { id: 'account', displayName: 'Alex' },
        },
      ],
    } as CollectionDetail;
    const updateCollectionItem = vi.fn(async () => {
      const updated = { ...shared.items[0], completed: true, version: 2 };
      shared = { ...shared, items: [updated] };
      return updated;
    });
    const createCollectionItem = vi.fn(async () => {
      shared = {
        ...shared,
        items: [
          ...shared.items,
          {
            ...shared.items[0],
            id: 'bread',
            title: 'Bread',
            completed: false,
            position: 1,
            version: 1,
          },
        ],
      };
      return shared.items[1];
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlanCollectionLinks
            spaceId="space-1"
            plan={plan}
            disabled={false}
            apis={
              {
                plans: { listPlanCollections: vi.fn(async () => [shared]) },
                collections: {
                  getCollection: vi.fn(async () => shared),
                  updateCollectionItem,
                  createCollectionItem,
                },
              } as unknown as SharedPlanningApis
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const trigger = await screen.findByRole('button', { name: /^Picnic list/ });
    fireEvent.click(trigger);
    const sheet = within(
      await screen.findByRole('dialog', { name: 'Picnic list' }),
    );
    fireEvent.click(
      await sheet.findByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Blanket' }),
      }),
    );
    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(1));
    fireEvent.change(
      sheet.getByRole('textbox', { name: i18n.t('m5s3.collection.newItem') }),
      { target: { value: 'Bread' } },
    );
    fireEvent.click(
      sheet.getByRole('button', { name: i18n.t('m5s3.collection.addItem') }),
    );
    await waitFor(() => expect(createCollectionItem).toHaveBeenCalledTimes(1));
    await sheet.findByText('Bread');
    fireEvent.click(
      sheet.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(trigger.textContent).toContain(
        i18n.t('composer.listProgress', { count: 2, completed: 1 }),
      ),
    );
  });

  it('keeps an unsaved list entry until the user explicitly discards it', async () => {
    const shared = {
      id: 'list-draft',
      spaceId: 'space-1',
      title: 'Draft list',
      version: 1,
      capabilities: { canEdit: true, canDelete: true },
      items: [],
    } as unknown as CollectionDetail;
    const createCollectionItem = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlanCollectionLinks
            spaceId="space-1"
            plan={plan}
            disabled={false}
            apis={
              {
                plans: { listPlanCollections: vi.fn(async () => [shared]) },
                collections: {
                  getCollection: vi.fn(async () => shared),
                  createCollectionItem,
                },
              } as unknown as SharedPlanningApis
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Draft list/ }));
    const input = await screen.findByRole('textbox', {
      name: i18n.t('m5s3.collection.newItem'),
    });
    fireEvent.change(input, { target: { value: 'Do not lose this' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    expect(screen.getByRole('dialog', { name: 'Draft list' })).toBeTruthy();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('Do not lose this');
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('Do not lose this');
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.discardConfirm'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createCollectionItem).not.toHaveBeenCalled();
  });

  it('omits the confirmed empty section while reading a Plan', async () => {
    const api = setup({ editing: false });
    await waitFor(() =>
      expect(api.listPlanCollections).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: i18n.t('m5s3.collection.planHeading'),
        }),
      ).toBeNull(),
    );
    expect(screen.queryByText(i18n.t('m5s3.collection.planEmpty'))).toBeNull();
    expect(
      screen.queryByRole('button', { name: i18n.t('m5s3.collection.create') }),
    ).toBeNull();
  });

  it('assembles alphabetical choices across pages and links multiple existing lists', async () => {
    const api = setup();
    const trigger = screen.getByRole('button', {
      name: i18n.t('m5s3.collection.create'),
    });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    const checks = await screen.findAllByRole('checkbox');
    expect(checks.map((input) => input.closest('label')?.textContent)).toEqual([
      expect.stringContaining('Ausflüge'),
      expect.stringContaining('Zelten'),
    ]);
    checks.forEach((input) => {
      fireEvent.click(input);
    });
    const save = screen.getByRole('button', {
      name: i18n.t('m5s3.collection.link'),
    });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(api.link).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: /^Ausflüge/ });
    expect(api.listCollections).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'ALL', cursor: 'second' }),
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.unlink', { title: 'Ausflüge' }),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Ausflüge/ })).toBeNull(),
    );
    expect(api.unlink).toHaveBeenCalledWith({
      spaceId: 'space-1',
      planId: plan.id,
      collectionId: 'a',
    });
    expect(screen.getByRole('button', { name: /^Zelten/ })).toBeTruthy();
  });

  it('retains the picker after a partial failure and reconciles confirmed links', async () => {
    const api = setup({ failSecond: true });
    const trigger = screen.getByRole('button', {
      name: i18n.t('m5s3.collection.create'),
    });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    (await screen.findAllByRole('checkbox')).forEach((input) => {
      fireEvent.click(input);
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.collection.link') }),
    );
    await waitFor(() => expect(api.link).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox')).toHaveLength(1),
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByRole('checkbox').closest('label')?.textContent,
    ).toContain('Zelten');
    expect(api.unlink).not.toHaveBeenCalled();
  });
});
