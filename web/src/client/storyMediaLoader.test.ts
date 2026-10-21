import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import type { ReferenceApis } from './referenceFlow';
import { loadAuthorizedStoryImage } from './storyMediaLoader';
import { clearAuthorizedMediaCache } from './authorizedMediaCache';
import { ClientProblemError, classifyProblemStatus } from './problemDetails';

beforeEach(clearAuthorizedMediaCache);

function storyApis({
  descriptor,
  content = new Blob(['stream-image'], { type: 'image/jpeg' }),
}: {
  descriptor: { method: 'STREAM' | 'SIGNED_URL'; url: string };
  content?: Blob;
}) {
  const createAttachmentReadAccess = vi.fn().mockResolvedValue(descriptor);
  const getAttachmentContentRaw = vi.fn(async () => ({
    raw: new Response(content, { status: 200 }),
  }));
  const apis = {
    attachments: {
      createAttachmentReadAccess,
      getAttachmentContentRaw,
    },
  } as unknown as ReferenceApis;

  return { apis, createAttachmentReadAccess, getAttachmentContentRaw };
}

describe('loadAuthorizedStoryImage', () => {
  it('requests the thumbnail variant through both descriptor and authorized stream with cancellation', async () => {
    const { apis, createAttachmentReadAccess, getAttachmentContentRaw } =
      storyApis({ descriptor: { method: 'STREAM', url: '/content' } });
    const controller = new AbortController();
    await loadAuthorizedStoryImage(
      apis,
      'space-1',
      'MEMORY',
      'memory-1',
      'image-1',
      {
        variant: 'thumbnail',
        signal: controller.signal,
        createObjectUrl: () => 'blob:thumbnail',
      },
    );
    expect(createAttachmentReadAccess).toHaveBeenCalledWith(
      {
        spaceId: 'space-1',
        attachmentId: 'image-1',
        attachmentReadRequest: {
          parentType: 'MEMORY',
          parentId: 'memory-1',
          variant: 'thumbnail',
        },
      },
      { signal: controller.signal },
    );
    expect(getAttachmentContentRaw).toHaveBeenCalledWith(
      { spaceId: 'space-1', attachmentId: 'image-1', variant: 'thumbnail' },
      { signal: expect.any(AbortSignal) },
    );
  });
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
    expect(getAttachmentContentRaw).toHaveBeenCalledWith(
      { spaceId: 'space-1', attachmentId: 'att-heart' },
      { signal: expect.any(AbortSignal) },
    );
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
      { signal: expect.any(AbortSignal) },
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
      { signal: expect.any(AbortSignal) },
    );
    expect(getAttachmentContentRaw).not.toHaveBeenCalled();
    expect(result).toBe('blob:signed-image');
  });

  it('reauthorizes every read but downloads a previously viewed photo only once', async () => {
    const { apis, createAttachmentReadAccess, getAttachmentContentRaw } =
      storyApis({ descriptor: { method: 'STREAM', url: '/content' } });
    const options = { createObjectUrl: vi.fn(() => 'blob:photo') };
    await loadAuthorizedStoryImage(
      apis,
      'space',
      'MEMORY',
      'memory',
      'photo',
      options,
    );
    await loadAuthorizedStoryImage(
      apis,
      'space',
      'MEMORY',
      'memory',
      'photo',
      options,
    );
    expect(createAttachmentReadAccess).toHaveBeenCalledTimes(2);
    expect(getAttachmentContentRaw).toHaveBeenCalledTimes(1);
    expect(options.createObjectUrl).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])(
    'evicts all parent variants after a %s authorization denial',
    async (status) => {
      const { apis, createAttachmentReadAccess, getAttachmentContentRaw } =
        storyApis({ descriptor: { method: 'STREAM', url: '/content' } });
      const options = { createObjectUrl: () => 'blob:photo' };
      await loadAuthorizedStoryImage(
        apis,
        'space',
        'HEART_MOMENT',
        'heart',
        'photo',
        options,
      );
      createAttachmentReadAccess.mockRejectedValueOnce(
        new ClientProblemError(classifyProblemStatus(status), status),
      );
      await expect(
        loadAuthorizedStoryImage(
          apis,
          'space',
          'HEART_MOMENT',
          'heart',
          'photo',
          options,
        ),
      ).rejects.toBeInstanceOf(ClientProblemError);
      expect(getAttachmentContentRaw).toHaveBeenCalledTimes(1);
      await loadAuthorizedStoryImage(
        apis,
        'space',
        'HEART_MOMENT',
        'heart',
        'photo',
        options,
      );
      expect(getAttachmentContentRaw).toHaveBeenCalledTimes(2);
    },
  );

  it('does not use cached bytes as fallback when read authorization is unavailable', async () => {
    const { apis, createAttachmentReadAccess, getAttachmentContentRaw } =
      storyApis({ descriptor: { method: 'STREAM', url: '/content' } });
    const options = { createObjectUrl: () => 'blob:photo' };
    await loadAuthorizedStoryImage(
      apis,
      'space',
      'MEMORY',
      'memory',
      'photo',
      options,
    );
    createAttachmentReadAccess.mockRejectedValueOnce(new TypeError('Offline'));
    await expect(
      loadAuthorizedStoryImage(
        apis,
        'space',
        'MEMORY',
        'memory',
        'photo',
        options,
      ),
    ).rejects.toThrow('Offline');
    expect(getAttachmentContentRaw).toHaveBeenCalledTimes(1);
  });

  it('evicts an existing thumbnail when the original stream rejects authorization', async () => {
    const { apis, getAttachmentContentRaw } = storyApis({
      descriptor: { method: 'STREAM', url: '/content' },
    });
    const options = {
      createObjectUrl: () => 'blob:photo',
      variant: 'thumbnail' as const,
    };
    await loadAuthorizedStoryImage(
      apis,
      'space',
      'HEART_MOMENT',
      'heart',
      'photo',
      options,
    );
    getAttachmentContentRaw.mockRejectedValueOnce(
      new ClientProblemError('permission', 403),
    );
    await expect(
      loadAuthorizedStoryImage(
        apis,
        'space',
        'HEART_MOMENT',
        'heart',
        'photo',
        {
          createObjectUrl: options.createObjectUrl,
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await loadAuthorizedStoryImage(
      apis,
      'space',
      'HEART_MOMENT',
      'heart',
      'photo',
      options,
    );
    expect(getAttachmentContentRaw).toHaveBeenCalledTimes(3);
  });

  it('does not start a binary read for an authorization result arriving after a wipe', async () => {
    const { apis, createAttachmentReadAccess, getAttachmentContentRaw } =
      storyApis({ descriptor: { method: 'STREAM', url: '/content' } });
    let resolve!: (descriptor: { method: 'STREAM'; url: string }) => void;
    const authorized = {
      promise: new Promise<{ method: 'STREAM'; url: string }>((complete) => {
        resolve = complete;
      }),
    };
    createAttachmentReadAccess.mockReturnValueOnce(authorized.promise);
    const read = loadAuthorizedStoryImage(
      apis,
      'space',
      'MEMORY',
      'memory',
      'photo',
      { createObjectUrl: vi.fn() },
    );
    const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    clearAuthorizedMediaCache();
    resolve({ method: 'STREAM', url: '/content' });
    await rejected;
    expect(getAttachmentContentRaw).not.toHaveBeenCalled();
  });
});
