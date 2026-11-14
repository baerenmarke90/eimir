// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import m5s3 from '../i18n/locales/m5s3';
import { CollectionsOverviewPage } from './CollectionsOverviewPage';

describe('CollectionsOverviewPage creating a list (#1808)', () => {
  let listCollections: ReturnType<typeof vi.fn>;
  let createCollection: ReturnType<typeof vi.fn>;

  function renderPage() {
    const apis = {
      collections: { listCollections, createCollection },
    } as unknown as SharedPlanningApis;
    return render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={['/more/collections']}>
          <Routes>
            <Route
              path="/more/collections"
              element={
                <CollectionsOverviewPage apis={apis} spaceId="space-1" />
              }
            />
            <Route path="/plan/collections/:id" element={<p>opened</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    listCollections = vi.fn(async () => ({ items: [], nextCursor: null }));
    createCollection = vi.fn(async (request: { collectionCreate: object }) => ({
      id: 'new-list',
      spaceId: 'space-1',
      title: (request.collectionCreate as { title: string }).title,
      items: [],
    }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function openCreate() {
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: m5s3.collection.create }),
    );
    return user;
  }

  it('creates a shopping list when the shopping list type is chosen', async () => {
    renderPage();
    const user = await openCreate();

    await user.click(
      screen.getByRole('button', { name: m5s3.collection.kind.SHOPPING }),
    );
    await user.type(
      screen.getByLabelText(m5s3.common.title, { exact: true }),
      'Einkauf',
    );
    await user.click(screen.getByRole('button', { name: m5s3.common.save }));

    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    expect(createCollection.mock.calls[0][0].collectionCreate).toEqual({
      title: 'Einkauf',
      kind: 'SHOPPING',
    });
  });

  it('keeps creating a plain list exactly as before: no kind is sent', async () => {
    renderPage();
    const user = await openCreate();

    await user.type(
      screen.getByLabelText(m5s3.common.title, { exact: true }),
      'Reisepläne',
    );
    await user.click(screen.getByRole('button', { name: m5s3.common.save }));

    await waitFor(() => expect(createCollection).toHaveBeenCalledTimes(1));
    expect(createCollection.mock.calls[0][0].collectionCreate).toEqual({
      title: 'Reisepläne',
    });
  });

  it('starts every new sheet on the plain list type', async () => {
    renderPage();
    const user = await openCreate();
    expect(
      screen
        .getByRole('button', { name: m5s3.collection.kind.GENERIC })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await user.click(
      screen.getByRole('button', { name: m5s3.collection.kind.SHOPPING }),
    );
    expect(
      screen
        .getByRole('button', { name: m5s3.collection.kind.SHOPPING })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
