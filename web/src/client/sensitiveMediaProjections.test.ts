import { QueryClient } from '@tanstack/react-query';
import { evictAuthorizedMedia } from './authorizedMediaCache';
import { revokePersistedProductReadsInBackground } from './productReadCache';
import { protectSensitiveMediaProjections } from './sensitiveMediaProjections';

vi.mock('./productReadCache', () => ({
  revokePersistedProductReadsInBackground: vi.fn(),
}));
vi.mock('./authorizedMediaCache', () => ({
  captureMediaCacheLease: vi.fn(() => 'lease'),
  evictAuthorizedMedia: vi.fn(),
}));
it('updates matching thumbnails and Today projections without revealing another Space or changing originals', () => {
  const client = new QueryClient();
  const before = {
    pages: [
      {
        items: [
          {
            attachment: {
              id: 'photo',
              mediaType: 'IMAGE',
              isSensitive: false,
              width: 42,
            },
          },
          { previewAttachmentId: 'photo', previewIsSensitive: false },
        ],
      },
    ],
  };
  client.setQueryData(['story', 'one'], before);
  client.setQueryData(['story', 'two'], before);
  protectSensitiveMediaProjections(client, 'one', [
    { id: 'photo', isSensitive: true },
  ]);
  expect(client.getQueryData(['story', 'one'])).toEqual({
    pages: [
      {
        items: [
          {
            attachment: {
              id: 'photo',
              mediaType: 'IMAGE',
              isSensitive: true,
              width: 42,
            },
          },
          { previewAttachmentId: 'photo', previewIsSensitive: true },
        ],
      },
    ],
  });
  expect(client.getQueryData(['story', 'two'])).toEqual(before);
});

it('never clears a marked preview when an older unmark response arrives', () => {
  const client = new QueryClient();
  const newer = {
    attachment: { id: 'photo', mediaType: 'IMAGE', isSensitive: true },
    previewAttachmentId: 'photo',
    previewIsSensitive: true,
  };
  client.setQueryData(['story', 'space'], newer);
  protectSensitiveMediaProjections(client, 'space', [
    { id: 'photo', isSensitive: false },
  ]);
  expect(client.getQueryData(['story', 'space'])).toEqual(newer);
});

describe('clearing stored media only for a new mark', () => {
  beforeEach(() =>
    vi.mocked(revokePersistedProductReadsInBackground).mockClear(),
  );

  it('keeps every stored photo when a save marks nothing sensitive', () => {
    // Every saved photo reports a flag; `false` must not wipe the whole store.
    protectSensitiveMediaProjections(new QueryClient(), 'space', [
      { id: 'photo', isSensitive: false },
    ]);
    expect(revokePersistedProductReadsInBackground).not.toHaveBeenCalled();
  });

  it('keeps every stored photo when the photo was already sensitive', () => {
    protectSensitiveMediaProjections(
      new QueryClient(),
      'space',
      [{ id: 'photo', isSensitive: true }],
      { previous: [{ id: 'photo', isSensitive: true }] },
    );
    expect(revokePersistedProductReadsInBackground).not.toHaveBeenCalled();
  });

  it('revokes stored reads and only the photos of this entry for a new mark', () => {
    vi.mocked(evictAuthorizedMedia).mockClear();
    const apiClient = {};
    protectSensitiveMediaProjections(
      new QueryClient(),
      'space',
      [{ id: 'photo', isSensitive: true }],
      {
        previous: [{ id: 'photo', isSensitive: false }],
        parent: { apiClient, type: 'HEART_MOMENT', id: 'heart' },
      },
    );
    expect(revokePersistedProductReadsInBackground).toHaveBeenCalledTimes(1);
    // Never the whole store: every other photo of the app stays loaded.
    expect(evictAuthorizedMedia).toHaveBeenCalledExactlyOnceWith('lease', [
      'attachment',
      'HEART_MOMENT',
      'heart',
    ]);
  });
});
