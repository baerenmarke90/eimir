import { QueryClient } from '@tanstack/react-query';
import { protectSensitiveMediaProjections } from './sensitiveMediaProjections';
vi.mock('./productReadCache', () => ({
  clearProductReadCacheInBackground: vi.fn(),
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
