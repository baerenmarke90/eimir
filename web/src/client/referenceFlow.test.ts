import { AuthApi } from '../api/generated/apis/AuthApi';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import { UploadDescriptorMethodEnum } from '../api/generated/models/UploadDescriptor';
import { ResponseError } from '../api/generated/runtime';
import {
  ReferenceFlowError,
  runMemoryMediaStoryFlow,
  signIn,
  uploadAttachmentBytes,
  type ReferenceApis,
} from './referenceFlow';

describe('signIn', () => {
  it('keeps the machine-readable API code while presenting the localized client fallback', async () => {
    const response = new Response(
      JSON.stringify({
        type: 'bad_request',
        title: 'Bad request',
        status: 400,
        detail: 'HTTPS is required for non-loopback access.',
        code: 'HTTPS_REQUIRED',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
    const spy = vi
      .spyOn(AuthApi.prototype, 'signInApiV1AuthSignInPost')
      .mockRejectedValue(
        new ResponseError(response, 'Response returned an error code'),
      );

    try {
      const error = await signIn(
        '',
        'g2-test@example.invalid',
        'password',
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ReferenceFlowError);
      expect((error as ReferenceFlowError).message).toBe(
        'Anmeldung fehlgeschlagen.',
      );
      expect((error as ReferenceFlowError).code).toBe('HTTPS_REQUIRED');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('uploadAttachmentBytes', () => {
  it('adds bearer authorization only for the authenticated STREAM transport', async () => {
    const fetchApi = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer token',
        );
        expect(init?.body).toBeInstanceOf(File);
        return new Response(null, { status: 204 });
      },
    ) as unknown as typeof fetch;

    await uploadAttachmentBytes(
      'https://example.invalid',
      'token',
      {
        attachment: {
          id: 'a',
          createdAt: new Date(),
          durationSeconds: null,
          hasThumbnail: false,
          height: null,
          mediaType: 'IMAGE',
          mimeType: null,
          size: null,
          status: 'UPLOADING',
          version: 1,
          width: null,
        },
        method: UploadDescriptorMethodEnum.STREAM,
        requiredHeaders: { 'Content-Type': 'image/jpeg' },
        uploadUrl: '/api/v1/spaces/s/attachments/a/content',
      },
      new File(['image'], 'test.jpg', { type: 'image/jpeg' }),
      fetchApi,
    );

    expect(fetchApi).toHaveBeenCalledOnce();
  });

  it('does not leak the bearer token to a signed upload URL', async () => {
    const fetchApi = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).has('Authorization')).toBe(false);
        return new Response(null, { status: 200 });
      },
    ) as unknown as typeof fetch;

    await uploadAttachmentBytes(
      'https://api.example.invalid',
      'secret-token',
      {
        attachment: {
          id: 'a',
          createdAt: new Date(),
          durationSeconds: null,
          hasThumbnail: false,
          height: null,
          mediaType: 'IMAGE',
          mimeType: null,
          size: null,
          status: 'UPLOADING',
          version: 1,
          width: null,
        },
        method: UploadDescriptorMethodEnum.SIGNED_UPLOAD,
        requiredHeaders: {},
        uploadUrl: 'https://storage.example.invalid/signed',
      },
      new File(['image'], 'test.jpg', { type: 'image/jpeg' }),
      fetchApi,
    );
  });
});

describe('runMemoryMediaStoryFlow', () => {
  it('creates a Memory and refreshes the story without touching attachments when no photo is selected', async () => {
    const memory = {
      id: 'memory-1',
      version: 1,
      title: 'Title only',
      body: '',
    };
    const story = { items: [] };
    const createAttachmentUpload = vi.fn();
    const replaceMemoryAttachments = vi.fn();
    const apis = {
      auth: {},
      memories: {
        createMemory: vi.fn(async () => memory),
        replaceMemoryAttachments,
      },
      attachments: {
        createAttachmentUpload,
      },
      story: {
        getStoryTimeline: vi.fn(async () => story),
      },
    } as unknown as ReferenceApis;

    const result = await runMemoryMediaStoryFlow(
      apis,
      'https://api.example.invalid',
      'token',
      'space-1',
      { title: memory.title, body: memory.body },
    );

    expect(apis.memories.createMemory).toHaveBeenCalledWith({
      spaceId: 'space-1',
      memoryCreate: { title: 'Title only', body: '' },
    });
    expect(createAttachmentUpload).not.toHaveBeenCalled();
    expect(replaceMemoryAttachments).not.toHaveBeenCalled();
    expect(apis.story.getStoryTimeline).toHaveBeenCalledWith({
      spaceId: 'space-1',
      limit: 25,
    });
    expect(result.memory).toBe(memory);
    expect(result.story).toBe(story);
    expect(result.imageUrl).toBeNull();
  });

  it('orchestrates create, upload, finalize, READY, bind, timeline and authorized read in order', async () => {
    const calls: string[] = [];
    const attachment = {
      id: 'attachment-1',
      createdAt: new Date('2026-08-26T08:00:00Z'),
      durationSeconds: null,
      hasThumbnail: false,
      height: null,
      mediaType: 'IMAGE',
      mimeType: 'image/jpeg',
      size: 5,
      status: 'UPLOADING',
      version: 1,
      width: null,
    };
    const memory = {
      id: 'memory-1',
      version: 1,
      title: 'Lakeside',
      body: 'A day together.',
    };
    const boundMemory = { ...memory, version: 2 };
    const story = { items: [] };

    const apis = {
      auth: {},
      memories: {
        createMemory: vi.fn(async () => {
          calls.push('create-memory');
          return memory;
        }),
        replaceMemoryAttachments: vi.fn(async () => {
          calls.push('bind-memory');
          return boundMemory;
        }),
      },
      attachments: {
        createAttachmentUpload: vi.fn(async () => {
          calls.push('create-upload');
          return {
            attachment,
            method: UploadDescriptorMethodEnum.STREAM,
            requiredHeaders: { 'Content-Type': 'image/jpeg' },
            uploadUrl:
              '/api/v1/spaces/space-1/attachments/attachment-1/content',
          };
        }),
        finalizeAttachmentUpload: vi.fn(async () => {
          calls.push('finalize-upload');
          return { ...attachment, status: 'PROCESSING' };
        }),
        getAttachment: vi.fn(async () => {
          calls.push('wait-ready');
          return { ...attachment, status: 'READY' };
        }),
        createAttachmentReadAccess: vi.fn(async () => {
          calls.push('authorize-read');
          return {
            method: ReadDescriptorMethodEnum.SIGNED_URL,
            url: 'https://storage.example.invalid/read',
          };
        }),
      },
      story: {
        getStoryTimeline: vi.fn(async () => {
          calls.push('timeline');
          return story;
        }),
      },
    } as unknown as ReferenceApis;

    const fetchApi = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes('/read')) {
          calls.push('read-bytes');
          expect(new Headers(init?.headers).has('Authorization')).toBe(false);
          return new Response(new Blob(['image'], { type: 'image/jpeg' }), {
            status: 200,
          });
        }
        calls.push('upload-bytes');
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer token',
        );
        return new Response(null, { status: 204 });
      },
    ) as unknown as typeof fetch;

    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:reference-flow');
    try {
      const result = await runMemoryMediaStoryFlow(
        apis,
        'https://api.example.invalid',
        'token',
        'space-1',
        { title: memory.title, body: memory.body },
        new File(['image'], 'test.jpg', { type: 'image/jpeg' }),
        fetchApi,
      );

      expect(calls).toEqual([
        'create-memory',
        'create-upload',
        'upload-bytes',
        'finalize-upload',
        'wait-ready',
        'bind-memory',
        'timeline',
        'authorize-read',
        'read-bytes',
      ]);
      expect(apis.memories.replaceMemoryAttachments).toHaveBeenCalledWith({
        spaceId: 'space-1',
        memoryId: 'memory-1',
        ifMatch: '1',
        memoryAttachmentSet: {
          attachments: [{ attachmentId: 'attachment-1', position: 0 }],
        },
      });
      expect(apis.attachments.createAttachmentReadAccess).toHaveBeenCalledWith({
        spaceId: 'space-1',
        attachmentId: 'attachment-1',
        attachmentReadRequest: {
          parentType: 'MEMORY',
          parentId: 'memory-1',
        },
      });
      expect(result.memory).toBe(boundMemory);
      expect(result.story).toBe(story);
      expect(result.imageUrl).toBe('blob:reference-flow');
    } finally {
      createObjectUrl.mockRestore();
    }
  });
});
