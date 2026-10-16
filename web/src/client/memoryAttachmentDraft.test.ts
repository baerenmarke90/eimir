import { UploadDescriptorMethodEnum } from '../api/generated/models/UploadDescriptor';
import {
  completeMemoryAttachmentBinding,
  createMemoryWithReadyAttachments,
  MemoryAttachmentBindingError,
  uploadMemoryDraftAttachment,
} from './memoryAttachmentDraft';
import type { ReferenceApis } from './referenceFlow';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';

function uploadingAttachment() {
  return {
    id: 'attachment-1',
    createdAt: new Date('2026-08-29T20:00:00Z'),
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
}

describe('uploadMemoryDraftAttachment', () => {
  it('starts upload immediately, exposes validation, and resolves only after READY', async () => {
    const phases: string[] = [];
    const attachment = uploadingAttachment();
    const apis = {
      auth: {},
      memories: {},
      attachments: {
        createAttachmentUpload: vi.fn(async () => ({
          attachment,
          method: UploadDescriptorMethodEnum.STREAM,
          requiredHeaders: { 'Content-Type': 'image/jpeg' },
          uploadUrl: '/api/v1/spaces/space-1/attachments/attachment-1/content',
        })),
        finalizeAttachmentUpload: vi.fn(async () => ({
          ...attachment,
          status: 'PROCESSING',
        })),
        getAttachment: vi.fn(async () => ({ ...attachment, status: 'READY' })),
      },
      story: {},
    } as unknown as ReferenceApis;
    const fetchApi = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;

    const result = await uploadMemoryDraftAttachment(
      apis,
      'https://api.example.invalid',
      'token',
      'space-1',
      new File(['image'], 'test.jpg', { type: 'image/jpeg' }),
      (phase) => phases.push(phase),
      fetchApi,
    );

    expect(phases).toEqual(['uploading', 'validating']);
    expect(result).toEqual({ attachmentId: 'attachment-1' });
    expect(apis.attachments.finalizeAttachmentUpload).toHaveBeenCalledWith({
      spaceId: 'space-1',
      attachmentId: 'attachment-1',
      body: {},
    });
    expect(apis.attachments.getAttachment).toHaveBeenCalledWith({
      spaceId: 'space-1',
      attachmentId: 'attachment-1',
    });
  });

  it('fails when server-side validation rejects the uploaded image', async () => {
    const phases: string[] = [];
    const attachment = uploadingAttachment();
    const apis = {
      auth: {},
      memories: {},
      attachments: {
        createAttachmentUpload: vi.fn(async () => ({
          attachment,
          method: UploadDescriptorMethodEnum.STREAM,
          requiredHeaders: { 'Content-Type': 'image/jpeg' },
          uploadUrl: '/api/v1/spaces/space-1/attachments/attachment-1/content',
        })),
        finalizeAttachmentUpload: vi.fn(async () => ({
          ...attachment,
          status: 'PROCESSING',
        })),
        getAttachment: vi.fn(async () => ({ ...attachment, status: 'FAILED' })),
      },
      story: {},
    } as unknown as ReferenceApis;
    const fetchApi = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;

    await expect(
      uploadMemoryDraftAttachment(
        apis,
        'https://api.example.invalid',
        'token',
        'space-1',
        new File(['image'], 'invalid.jpg', { type: 'image/jpeg' }),
        (phase) => phases.push(phase),
        fetchApi,
      ),
    ).rejects.toThrow();

    expect(phases).toEqual(['uploading', 'validating']);
    expect(apis.attachments.getAttachment).toHaveBeenCalledTimes(1);
  });
});

describe('createMemoryWithReadyAttachments', () => {
  it('binds only the READY attachment IDs supplied by the draft state and preserves their order', async () => {
    const memory = {
      id: 'memory-1',
      version: 1,
      title: 'Lake',
      body: '',
    };
    const boundMemory = { ...memory, version: 2 };
    const story = { items: [] };
    const apis = {
      auth: {},
      attachments: {},
      memories: {
        createMemory: vi.fn(async () => memory),
        replaceMemoryAttachments: vi.fn(async () => boundMemory),
      },
      story: {
        getStoryTimeline: vi.fn(async () => story),
      },
    } as unknown as ReferenceApis;

    const result = await createMemoryWithReadyAttachments(
      apis,
      'space-1',
      { title: 'Lake', body: '' },
      ['attachment-2', 'attachment-1'],
    );

    expect(apis.memories.replaceMemoryAttachments).toHaveBeenCalledWith({
      spaceId: 'space-1',
      memoryId: 'memory-1',
      ifMatch: '1',
      memoryAttachmentSet: {
        attachments: [
          { attachmentId: 'attachment-2', position: 0 },
          { attachmentId: 'attachment-1', position: 1 },
        ],
      },
    });
    expect(result.memory).toBe(boundMemory);
    expect(apis.story.getStoryTimeline).not.toHaveBeenCalled();
  });

  it('does not touch attachment binding when the Memory has no READY drafts', async () => {
    const memory = {
      id: 'memory-1',
      version: 1,
      title: 'Title only',
      body: '',
    };
    const replaceMemoryAttachments = vi.fn();
    const apis = {
      auth: {},
      attachments: {},
      memories: {
        createMemory: vi.fn(async () => memory),
        replaceMemoryAttachments,
      },
      story: {
        getStoryTimeline: vi.fn(async () => ({ items: [] })),
      },
    } as unknown as ReferenceApis;

    await createMemoryWithReadyAttachments(
      apis,
      'space-1',
      { title: 'Title only', body: '' },
      [],
    );

    expect(replaceMemoryAttachments).not.toHaveBeenCalled();
  });

  it('sends the request identity so a replay resolves to the original Memory', async () => {
    const memory = {
      id: 'original',
      version: 1,
      attachments: [],
    } as unknown as MemoryDetail;
    const createMemory = vi.fn().mockResolvedValue(memory);
    const apis = { memories: { createMemory } } as unknown as ReferenceApis;
    const snapshot = { title: 'Lake', body: '' };

    await createMemoryWithReadyAttachments(apis, 'space-1', snapshot, [], {
      idempotencyKey: 'key-1',
    });

    expect(createMemory).toHaveBeenCalledWith({
      spaceId: 'space-1',
      memoryCreate: snapshot,
      idempotencyKey: 'key-1',
    });
  });

  it('continues a replayed create with the existing reconciling binding instead of creating again', async () => {
    const replayed = {
      id: 'original',
      version: 1,
      attachments: [],
    } as unknown as MemoryDetail;
    const bound = { ...replayed, version: 2 } as unknown as MemoryDetail;
    const apis = {
      memories: {
        createMemory: vi.fn().mockResolvedValue(replayed),
        getMemory: vi.fn().mockResolvedValue(replayed),
        replaceMemoryAttachments: vi.fn().mockResolvedValue(bound),
      },
    } as unknown as ReferenceApis;

    const result = await createMemoryWithReadyAttachments(
      apis,
      'space-1',
      { title: 'Lake', body: '' },
      ['attachment-1'],
      { idempotencyKey: 'key-1', reconcile: true },
    );

    expect(result.memory).toBe(bound);
    expect(apis.memories.createMemory).toHaveBeenCalledTimes(1);
    expect(apis.memories.getMemory).toHaveBeenCalledWith({
      spaceId: 'space-1',
      memoryId: 'original',
    });
    expect(apis.memories.replaceMemoryAttachments).toHaveBeenCalledWith(
      expect.objectContaining({ memoryId: 'original', ifMatch: '1' }),
    );
  });

  it('does not overwrite a different gallery found on the replayed Memory', async () => {
    const replayed = {
      id: 'original',
      version: 1,
      attachments: [],
    } as unknown as MemoryDetail;
    const edited = {
      ...replayed,
      attachments: [{ id: 'someone-elses', position: 0 }],
    } as unknown as MemoryDetail;
    const apis = {
      memories: {
        createMemory: vi.fn().mockResolvedValue(replayed),
        getMemory: vi.fn().mockResolvedValue(edited),
        replaceMemoryAttachments: vi.fn(),
      },
    } as unknown as ReferenceApis;

    await expect(
      createMemoryWithReadyAttachments(
        apis,
        'space-1',
        { title: 'Lake', body: '' },
        ['attachment-1'],
        { idempotencyKey: 'key-1', reconcile: true },
      ),
    ).rejects.toBeInstanceOf(MemoryAttachmentBindingError);
    expect(apis.memories.replaceMemoryAttachments).not.toHaveBeenCalled();
  });

  it('keeps confirmation independent of a failing Story projection read', async () => {
    const memory = { id: 'confirmed', version: 1 } as MemoryDetail;
    const apis = {
      memories: { createMemory: vi.fn().mockResolvedValue(memory) },
      story: {
        getStoryTimeline: vi
          .fn()
          .mockRejectedValue(new Error('Read unavailable')),
      },
    } as unknown as ReferenceApis;
    await expect(
      createMemoryWithReadyAttachments(
        apis,
        'space',
        { title: 'Words', body: '' },
        [],
      ),
    ).resolves.toEqual({ memory });
    expect(apis.memories.createMemory).toHaveBeenCalledTimes(1);
    expect(apis.story.getStoryTimeline).not.toHaveBeenCalled();
  });

  it('preserves a confirmed identity and resumes association without creating again', async () => {
    const memory = {
      id: 'confirmed',
      version: 1,
      attachments: [],
    } as unknown as MemoryDetail;
    const linked = {
      ...memory,
      version: 2,
      attachments: [{ id: 'photo', position: 0 }],
    };
    const cause = new Error('Connection interrupted');
    const apis = {
      memories: {
        createMemory: vi.fn().mockResolvedValue(memory),
        getMemory: vi.fn().mockResolvedValue(memory),
        replaceMemoryAttachments: vi
          .fn()
          .mockRejectedValueOnce(cause)
          .mockResolvedValueOnce(linked),
      },
    } as unknown as ReferenceApis;
    const error = await createMemoryWithReadyAttachments(
      apis,
      'space',
      { title: 'Words', body: '' },
      ['photo'],
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(MemoryAttachmentBindingError);
    const partial = error as MemoryAttachmentBindingError;
    expect(partial.memory).toBe(memory);
    expect(partial.cause).toBe(cause);
    await expect(
      completeMemoryAttachmentBinding(
        apis,
        'space',
        partial.memory,
        partial.attachmentIds,
        true,
      ),
    ).resolves.toBe(linked);
    expect(apis.memories.createMemory).toHaveBeenCalledTimes(1);
    expect(apis.memories.getMemory).toHaveBeenCalledWith({
      spaceId: 'space',
      memoryId: memory.id,
    });
    expect(apis.memories.replaceMemoryAttachments).toHaveBeenLastCalledWith({
      spaceId: 'space',
      memoryId: 'confirmed',
      ifMatch: '1',
      memoryAttachmentSet: {
        attachments: [{ attachmentId: 'photo', position: 0 }],
      },
    });
  });

  it('recognizes a completed association after its response was lost', async () => {
    const memory = {
      id: 'confirmed',
      version: 1,
      attachments: [],
    } as unknown as MemoryDetail;
    const linked = {
      ...memory,
      version: 2,
      attachments: [
        { id: 'photo-2', position: 1 },
        { id: 'photo-1', position: 0 },
      ],
    };
    const apis = {
      memories: {
        getMemory: vi.fn().mockResolvedValue(linked),
        createMemory: vi.fn(),
        replaceMemoryAttachments: vi.fn(),
      },
    } as unknown as ReferenceApis;
    await expect(
      completeMemoryAttachmentBinding(
        apis,
        'space',
        memory,
        ['photo-1', 'photo-2'],
        true,
      ),
    ).resolves.toBe(linked);
    expect(apis.memories.createMemory).not.toHaveBeenCalled();
    expect(apis.memories.replaceMemoryAttachments).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a concurrent edit while recovering photos', async () => {
    const memory = {
      id: 'confirmed',
      version: 1,
      attachments: [],
    } as unknown as MemoryDetail;
    const apis = {
      memories: {
        getMemory: vi.fn().mockResolvedValue({ ...memory, version: 2 }),
        createMemory: vi.fn(),
        replaceMemoryAttachments: vi.fn(),
      },
    } as unknown as ReferenceApis;
    await expect(
      completeMemoryAttachmentBinding(apis, 'space', memory, ['photo'], true),
    ).rejects.toMatchObject({ memory, cause: { kind: 'conflict' } });
    expect(apis.memories.createMemory).not.toHaveBeenCalled();
    expect(apis.memories.replaceMemoryAttachments).not.toHaveBeenCalled();
  });

  it('retains the original create rejection for honest definitive versus unknown outcome classification', async () => {
    const failure = new Error('Response lost');
    const apis = {
      memories: {
        createMemory: vi.fn().mockRejectedValue(failure),
        replaceMemoryAttachments: vi.fn(),
      },
    } as unknown as ReferenceApis;
    await expect(
      createMemoryWithReadyAttachments(
        apis,
        'space',
        { title: 'Words', body: '' },
        [],
      ),
    ).rejects.toBe(failure);
    expect(apis.memories.createMemory).toHaveBeenCalledTimes(1);
    expect(apis.memories.replaceMemoryAttachments).not.toHaveBeenCalled();
  });
});
