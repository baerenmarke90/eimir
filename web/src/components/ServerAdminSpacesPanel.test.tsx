// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { ServerAdminSpacesPanel } from './ServerAdminSpacesPanel';

// A UUIDv7, the id format the backend issues.
const SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789ab';

function renderPanel(initialSpaceId: string | null) {
  const getSpace = vi.fn().mockReturnValue(new Promise(() => undefined));
  const api = {
    listServerAdminSpacesApiV1ServerAdminSpacesGet: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 }),
    getServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGet: getSpace,
  } as unknown as ServerAdminApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminSpacesPanel api={api} initialSpaceId={initialSpaceId} />
    </QueryClientProvider>,
  );
  return getSpace;
}

describe('ServerAdminSpacesPanel deep link', () => {
  afterEach(() => cleanup());

  it('opens the Space detail from the link', async () => {
    const getSpace = renderPanel(SPACE_ID);
    await waitFor(() =>
      expect(getSpace).toHaveBeenCalledWith({ spaceId: SPACE_ID }),
    );
  });

  it('ignores an invalid space id', async () => {
    const getSpace = renderPanel('not-a-space');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getSpace).not.toHaveBeenCalled();
  });
});
