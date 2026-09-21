// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientProblemError } from '../client/problemDetails';
import { SNACKBAR_EVENT } from '../client/snackbar';
import { spaceConfigurationQueryKey } from '../client/spaceConfiguration';
import type { M4ProductApis } from '../client/m4Product';
import { ThinkingOfYouHero } from './TodayPage';

afterEach(() => cleanup());

function renderHero(sendThinkingOfYou: () => Promise<unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const snackbars: string[] = [];
  window.addEventListener(SNACKBAR_EVENT, (event) =>
    snackbars.push((event as CustomEvent).detail.messageKey),
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ThinkingOfYouHero
          apis={
            { notifications: { sendThinkingOfYou } } as unknown as M4ProductApis
          }
          accountId="account-1"
          spaceId="space-1"
          partnerName="Marie"
          thinkingOfYouAvailableAt={null}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { invalidate, snackbars };
}

describe('ThinkingOfYouHero', () => {
  it('refreshes the Space configuration immediately when the server reports the module disabled', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError('permission', 403, 'SPACE_MODULE_DISABLED'),
      );
    const { invalidate, snackbars } = renderHero(send);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: spaceConfigurationQueryKey('account-1', 'space-1'),
        exact: true,
        refetchType: 'active',
      }),
    );
    expect(snackbars).toEqual(['snackbar.supportGesturesModuleDisabled']);
  });

  it('keeps the generic error for unrelated failures without touching the configuration', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new ClientProblemError('server', 500));
    const { invalidate, snackbars } = renderHero(send);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(snackbars).toEqual(['m5s5.common.error']));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
