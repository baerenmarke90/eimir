// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { StoryList } from './StoryList';

const mocks = vi.hoisted(() => ({ hold: vi.fn(), release: vi.fn() }));
vi.mock('../client/config', async (original) => ({
  ...(await original<typeof import('../client/config')>()),
  isAndroidApp: () => true,
}));
vi.mock('../client/secureScreen', () => ({ holdSecureScreen: mocks.hold }));

let confirm: () => void;

beforeEach(() => {
  mocks.hold.mockReset();
  mocks.release.mockReset();
  mocks.hold.mockImplementation(() => ({
    ready: new Promise<void>((done) => {
      confirm = done;
    }),
    release: mocks.release,
  }));
});
afterEach(cleanup);

function heartMoment(id: string, text: string, visibility: string): StoryItem {
  return {
    kind: 'HEART_MOMENT',
    effectiveDate: new Date('2026-08-26T00:00:00Z'),
    heartMoment: {
      id,
      text,
      emotion: 'GRATEFUL',
      author: { id: 'author-1', displayName: 'A' },
      attachment: null,
      visibility,
    },
  } as unknown as StoryItem;
}

function renderList(items: StoryItem[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StoryList
          items={items}
          loadMemoryImage={async () => 'blob:memory'}
          loadHeartMomentImage={async () => 'blob:heart'}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const itemOf = (text: string) =>
  screen.getByText(text).closest('li') as HTMLLIElement;

describe('StoryList in the Android app (#683)', () => {
  it('paints an own private Heart Moment only after the screen is protected', async () => {
    renderList([
      heartMoment('shared', 'For both of us', 'SHARED'),
      heartMoment('private', 'Only for me', 'PRIVATE'),
    ]);
    expect(mocks.hold).toHaveBeenCalledTimes(1);
    expect(itemOf('For both of us').style.visibility).toBe('');
    expect(itemOf('Only for me').style.visibility).toBe('hidden');
    await act(async () => confirm());
    expect(itemOf('Only for me').style.visibility).toBe('');
  });

  it('leaves a Story without private items capturable', () => {
    const view = renderList([
      heartMoment('shared', 'For both of us', 'SHARED'),
    ]);
    expect(mocks.hold).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
