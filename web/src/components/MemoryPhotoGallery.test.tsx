// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { MemoryPhotoGallery } from './MemoryPhotoGallery';

const key = authorSummaryQueryKeys.memory('space', 'memory');
function fixture(): MemoryDetail {
  return {
    id: 'memory',
    spaceId: 'space',
    authorId: 'author',
    author: { id: 'author', displayName: 'Alex' },
    title: 'A day outside',
    body: '',
    tags: [],
    happenedOn: new Date('2026-10-27'),
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    capabilities: { canEdit: true, canDelete: true, canComment: true },
    attachments: [
      {
        id: 'photo',
        status: 'READY',
        mediaType: 'IMAGE',
        isSensitive: true,
        position: 0,
        width: 100,
        height: 100,
        size: 100,
        mimeType: 'image/jpeg',
        hasThumbnail: true,
        reactions: [],
      },
    ],
  };
}
function setup(
  save: (...args: unknown[]) => Promise<MemoryDetail>,
  scope = 'account:space:memory',
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const memory = fixture();
  client.setQueryData(key, { value: memory, source: 'network' });
  const apis = {
    memories: { setMemoryPhotoReaction: save },
  } as unknown as ReferenceApis;
  function Consumer({ scope: currentScope }: { scope: string }) {
    const query = useQuery({
      queryKey: key,
      queryFn: async () => ({ value: memory, source: 'network' }),
    });
    return (
      <MemoryPhotoGallery
        memory={query.data!.value}
        apis={apis}
        accountId="account"
        scope={currentScope}
        offline={false}
        loadImage={async () => 'blob:photo'}
      />
    );
  }
  const tree = (currentScope: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Consumer scope={currentScope} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree(scope));
  return {
    client,
    memory,
    view,
    changeScope: (next: string) => view.rerender(tree(next)),
  };
}
beforeEach(() => {
  window.PointerEvent = MouseEvent as typeof PointerEvent;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('tap toggles the photo and long press opens only the fixed picker without revealing it', async () => {
  const save = vi.fn();
  const { view } = setup(save);
  await waitFor(() =>
    expect(
      view.container.querySelector('.sensitive-media-blurred img'),
    ).not.toBeNull(),
  );
  const photo = screen.getByRole('button', { name: 'Bild anzeigen' });
  fireEvent.click(photo, { detail: 1 });
  expect(photo.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(photo, { detail: 1 });
  vi.useFakeTimers();
  fireEvent.pointerDown(photo, { button: 0, clientX: 100, clientY: 100 });
  act(() => vi.advanceTimersByTime(450));
  fireEvent.pointerUp(photo);
  fireEvent.click(photo, { detail: 1 });
  expect(photo.getAttribute('aria-pressed')).toBe('false');
  const picker = screen.getByRole('group', { name: 'Reaktion auswählen' });
  expect(picker.querySelectorAll('button')).toHaveLength(6);
  expect(save).not.toHaveBeenCalled();
  expect(view.container.querySelector('.memory-photo-reactions')).toBeNull();
});

it.each(['move', 'cancel', 'unmount'])(
  'cancels a pending long press on %s',
  async (reason) => {
    const { view } = setup(vi.fn());
    await waitFor(() =>
      expect(
        view.container.querySelector('.sensitive-media-blurred img'),
      ).not.toBeNull(),
    );
    const photo = screen.getByRole('button', { name: 'Bild anzeigen' });
    vi.useFakeTimers();
    fireEvent.pointerDown(photo, { button: 0, clientX: 100, clientY: 100 });
    if (reason === 'move')
      fireEvent.pointerMove(photo, { clientX: 130, clientY: 100 });
    if (reason === 'cancel') fireEvent.pointerCancel(photo);
    if (reason === 'unmount') view.unmount();
    act(() => vi.advanceTimersByTime(600));
    expect(
      screen.queryByRole('group', { name: 'Reaktion auswählen' }),
    ).toBeNull();
  },
);

it('shows a chip only after confirmed persistence and permits removal', async () => {
  let resolve!: (value: MemoryDetail) => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<MemoryDetail>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce({ ...fixture(), version: 3 });
  const { view, memory } = setup(save);
  fireEvent.click(
    screen.getByRole('button', { name: 'Auf dieses Foto reagieren' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Liebe' }));
  expect(view.container.querySelector('.memory-photo-reactions')).toBeNull();
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      spaceId: 'space',
      memoryId: 'memory',
      attachmentId: 'photo',
      photoReactionSet: { reaction: 'LOVE' },
    }),
  );
  await act(async () =>
    resolve({
      ...memory,
      version: 2,
      attachments: [
        {
          ...memory.attachments[0]!,
          reactions: [{ reaction: 'LOVE', count: 1, own: true }],
        },
      ],
    }),
  );
  const chip = await screen.findByRole('button', {
    name: /Liebe: 1 Reaktion.*entfernen/,
  });
  fireEvent.click(chip);
  await waitFor(() =>
    expect(view.container.querySelector('.memory-photo-reactions')).toBeNull(),
  );
  expect(save).toHaveBeenLastCalledWith({
    spaceId: 'space',
    memoryId: 'memory',
    attachmentId: 'photo',
    photoReactionSet: { reaction: null },
  });
});

it('retains the previous server state on failure and ignores completion after a context change', async () => {
  let resolve!: (value: MemoryDetail) => void;
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockImplementationOnce(
      () =>
        new Promise<MemoryDetail>((done) => {
          resolve = done;
        }),
    );
  const { memory, client, changeScope } = setup(save);
  fireEvent.click(
    screen.getByRole('button', { name: 'Auf dieses Foto reagieren' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Liebe' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Liebe' }).hasAttribute('disabled'),
    ).toBe(false),
  );
  expect(client.getQueryData<{ value: MemoryDetail }>(key)?.value.version).toBe(
    1,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Liebe' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  changeScope('other-account:space:memory');
  await act(async () => resolve({ ...memory, version: 2 }));
  expect(client.getQueryData<{ value: MemoryDetail }>(key)?.value.version).toBe(
    1,
  );
});
