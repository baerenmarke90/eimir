import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import type { ReferenceApis } from './referenceFlow';
import { loadAuthorizedStoryImage } from './storyMediaLoader';

function storyApis({
  descriptor,
  content = new Blob(['stream-image'], { type: 'image/jpeg' }),
}: {
  descriptor: { method: 'STREAM' | 'SIGNED_URL'; url: string };
  content?: Blob;
}) {
  const createAttachmentReadAccess = vi.fn().mockResolvedValue(descriptor);
  const getAttachmentContentRaw = vi.fn().mockResolvedValue({
    raw: new Response(content, { status: 200 }),
  });
  const apis = {
    attachments: {
      createAttachmentReadAccess,
      getAttachmentContentRaw,
    },
  } as unknown as ReferenceApis;

  return { apis, createAttachmentReadAccess, getAttachmentContentRaw };
}

describe('loadAuthorizedStoryImage', () => {
  it('binds Heart Moment timeline media to HEART_MOMENT before streaming', async () => {
    const { apis, createAttachmentReadAccess, getAttachmentContentRaw } =
      storyApis({
        descriptor: {
          method: ReadDescriptorMethodEnum.STREAM,
          url: '/api/v1/spaces/space-1/attachments/att-heart/content',
        },
      });
    const createObjectUrl = vi.fn().mockReturnValue('blob:heart-moment');

    const result = await loadAuthorizedStoryImage(
      apis,
      'space-1',
      AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
      'heart-1',
      'att-heart',
      { createObjectUrl },
    );

    expect(createAttachmentReadAccess).toHaveBeenCalledWith({
      spaceId: 'space-1',
      attachmentId: 'att-heart',
      attachmentReadRequest: {
        parentType: AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
        parentId: 'heart-1',
      },
    });
    expect(getAttachmentContentRaw).toHaveBeenCalledWith({
      spaceId: 'space-1',
      attachmentId: 'att-heart',
    });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(result).toBe('blob:heart-moment');
  });

  it('forwards cancellation to signed media transport', async () => {
    const { apis } = storyApis({
      descriptor: {
        method: ReadDescriptorMethodEnum.SIGNED_URL,
        url: 'https://media.example.test/cancellable-image',
      },
    });
    const controller = new AbortController();
    const fetchApi = vi.fn().mockResolvedValue(
      new Response(new Blob(['signed-image'], { type: 'image/jpeg' }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    await loadAuthorizedStoryImage(
      apis,
      'space-1',
      AttachmentReadRequestParentTypeEnum.MEMORY,
      'memory-1',
      'att-memory',
      {
        fetchApi,
        createObjectUrl: vi.fn().mockReturnValue('blob:cancellable-image'),
        signal: controller.signal,
      },
    );

    expect(fetchApi).toHaveBeenCalledWith(
      'https://media.example.test/cancellable-image',
      { signal: controller.signal },
    );
  });

  it('uses the issued URL directly for signed media reads', async () => {
    const { apis, getAttachmentContentRaw } = storyApis({
      descriptor: {
        method: ReadDescriptorMethodEnum.SIGNED_URL,
        url: 'https://media.example.test/signed-image',
      },
    });
    const fetchApi = vi.fn().mockResolvedValue(
      new Response(new Blob(['signed-image'], { type: 'image/jpeg' }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    const createObjectUrl = vi.fn().mockReturnValue('blob:signed-image');

    const result = await loadAuthorizedStoryImage(
      apis,
      'space-1',
      AttachmentReadRequestParentTypeEnum.MEMORY,
      'memory-1',
      'att-memory',
      { fetchApi, createObjectUrl },
    );

    expect(fetchApi).toHaveBeenCalledWith(
      'https://media.example.test/signed-image',
    );
    expect(getAttachmentContentRaw).not.toHaveBeenCalled();
    expect(result).toBe('blob:signed-image');
  });
});
