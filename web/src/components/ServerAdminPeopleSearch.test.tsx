// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminPeopleSearch } from './ServerAdminPeopleSearch';

const SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789ab';
const ACCOUNT_ID = '019b2e1a-7c3d-7f00-8a11-0000000000aa';

function renderSearch() {
  const search = vi.fn().mockResolvedValue({
    accounts: [
      {
        id: ACCOUNT_ID,
        displayName: 'Lena Name',
        primaryEmail: 'lena@example.com',
        emailVerified: true,
      },
    ],
    spaces: [{ id: SPACE_ID, activeMembershipCount: 2 }],
  });
  const api = { searchServerAdmin: search } as unknown as ServerAdminApi;
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ServerAdminPeopleSearch api={api} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return search;
}

describe('ServerAdminPeopleSearch', () => {
  afterEach(() => cleanup());

  it('waits for two characters before searching', () => {
    const search = renderSearch();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'l' },
    });

    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText(serverAdmin.people.hint)).toBeTruthy();
  });

  it('does not treat wildcards as characters', () => {
    const search = renderSearch();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '%_%' },
    });

    expect(search).not.toHaveBeenCalled();
  });

  it('links accounts and spaces to their pages without names', async () => {
    const search = renderSearch();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'lena' },
    });

    const space = await screen.findByRole('link', { name: /Space 019b…9ab/ });
    expect(search).toHaveBeenCalledWith({ q: 'lena' });
    expect(space.getAttribute('href')).toBe(
      `/server-admin?section=spaces&space=${SPACE_ID}`,
    );
    const account = screen.getByRole('link', { name: /lena@example.com/ });
    expect(account.getAttribute('href')).toBe(
      `/server-admin?section=accounts&account=${ACCOUNT_ID}`,
    );
    expect(screen.queryByText('Lena Name')).toBeNull();
  });
});
