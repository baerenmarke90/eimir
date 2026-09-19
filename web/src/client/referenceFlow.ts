import { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { AuthApi } from '../api/generated/apis/AuthApi';
import { CommentsApi } from '../api/generated/apis/CommentsApi';
import { HeartMomentsApi } from '../api/generated/apis/HeartMomentsApi';
import { MemoriesApi } from '../api/generated/apis/MemoriesApi';
import { MilestonesApi } from '../api/generated/apis/MilestonesApi';
import { StoryApi } from '../api/generated/apis/StoryApi';
import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import { MediaType } from '../api/generated/models/MediaType';
import type { MemoryCreate } from '../api/generated/models/MemoryCreate';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import type { SessionView } from '../api/generated/models/SessionView';
import type { StoryPage } from '../api/generated/models/StoryPage';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import { UploadDescriptorMethodEnum } from '../api/generated/models/UploadDescriptor';
import { Configuration, ResponseError } from '../api/generated/runtime';
import { i18n } from '../i18n';

export interface FlowResult {
  memory: MemoryDetail;
  story: StoryPage;
  imageUrl: string | null;
}

export interface ReferenceApis {
  attachments: AttachmentsApi;
  auth: AuthApi;
  comments: CommentsApi;
  heartMoments: HeartMomentsApi;
  memories: MemoriesApi;
  milestones: MilestonesApi;
  story: StoryApi;
}

interface ApiProblem {
  code?: unknown;
}

export class ReferenceFlowError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ReferenceFlowError';
  }
}

export function createReferenceApis(
  apiBaseUrl: string,
  accessToken?: string,
): ReferenceApis {
  const configuration = new Configuration({
    basePath: apiBaseUrl,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });

  return {
    attachments: new AttachmentsApi(configuration),
    auth: new AuthApi(configuration),
    comments: new CommentsApi(configuration),
    heartMoments: new HeartMomentsApi(configuration),
    memories: new MemoriesApi(configuration),
    milestones: new MilestonesApi(configuration),
    story: new StoryApi(configuration),
  };
}

function resolveTransportUrl(apiBaseUrl: string, target: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  return `${apiBaseUrl.replace(/\/+$/, '')}/${target.replace(/^\/+/, '')}`;
}

async function rethrowLocalized(
  error: unknown,
  fallback: string,
): Promise<never> {
  if (!(error instanceof ResponseError)) {
    if (error instanceof Error) throw error;
    throw new ReferenceFlowError(fallback);
  }

  let code: string | undefined;
  try {
    const problem = (await error.response.clone().json()) as ApiProblem;
    if (typeof problem.code === 'string' && problem.code.trim())
      code = problem.code.trim();
  } catch {
    // A non-ProblemDetails response still receives the localized client fallback.
  }

  throw new ReferenceFlowError(fallback, code);
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = `${response.status} ${response.statusText}`.trim();
  throw new ReferenceFlowError(detail ? `${action}: ${detail}` : action);
}

export async function uploadAttachmentBytes(
  apiBaseUrl: string,
  accessToken: string,
  descriptor: UploadDescriptor,
  file: File,
  fetchApi: typeof fetch = fetch,
): Promise<void> {
  const headers = new Headers(descriptor.requiredHeaders);
  if (descriptor.method === UploadDescriptorMethodEnum.STREAM) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetchApi(
    resolveTransportUrl(apiBaseUrl, descriptor.uploadUrl),
    {
      method: 'PUT',
      headers,
      body: file,
    },
  );
  await assertOk(response, i18n.t('flow.uploadFailed'));
}

export async function uploadAttachmentBytesWithProgress(
  apiBaseUrl: string,
  accessToken: string,
  descriptor: UploadDescriptor,
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
  } = {},
  fetchApi: typeof fetch = fetch,
): Promise<void> {
  if (typeof XMLHttpRequest === 'undefined') {
    options.onProgress?.(0);
    await uploadAttachmentBytes(
      apiBaseUrl,
      accessToken,
      descriptor,
      file,
      fetchApi,
    );
    options.onProgress?.(100);
    return;
  }

  const headers = new Headers(descriptor.requiredHeaders);
  if (descriptor.method === UploadDescriptorMethodEnum.STREAM) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', resolveTransportUrl(apiBaseUrl, descriptor.uploadUrl));
    headers.forEach((value, key) => {
      request.setRequestHeader(key, value);
    });

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const progress = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      );
      options.onProgress?.(progress);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(100);
        resolve();
        return;
      }
      const detail = `${request.status} ${request.statusText}`.trim();
      reject(
        new ReferenceFlowError(
          detail
            ? `${i18n.t('flow.uploadFailed')}: ${detail}`
            : i18n.t('flow.uploadFailed'),
        ),
      );
    };
    request.onerror = () =>
      reject(new ReferenceFlowError(i18n.t('flow.uploadFailed')));
    request.onabort = () =>
      reject(new DOMException('Upload aborted.', 'AbortError'));

    const abort = () => request.abort();
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    request.addEventListener(
      'loadend',
      () => options.signal?.removeEventListener('abort', abort),
      { once: true },
    );
    request.send(file);
  });
}

async function waitUntilReady(
  apis: ReferenceApis,
  spaceId: string,
  attachmentId: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const attachment = await apis.attachments.getAttachment({
      spaceId,
      attachmentId,
    });
    if (attachment.status === 'READY') return;
    if (
      attachment.status === 'FAILED' ||
      attachment.status === 'DELETE_FAILED' ||
      attachment.status === 'DELETING'
    ) {
      throw new ReferenceFlowError(
        i18n.t('flow.processingStatus', { status: attachment.status }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new ReferenceFlowError(i18n.t('flow.processingTimeout'));
}

export async function loadAuthorizedMedia(
  apis: ReferenceApis,
  apiBaseUrl: string,
  accessToken: string,
  spaceId: string,
  parentType:
    | typeof AttachmentReadRequestParentTypeEnum.MEMORY
    | typeof AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
  parentId: string,
  attachmentId: string,
  fetchApi: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  const descriptor = await apis.attachments.createAttachmentReadAccess({
    spaceId,
    attachmentId,
    attachmentReadRequest: { parentType, parentId },
  });

  const headers = new Headers();
  if (descriptor.method === ReadDescriptorMethodEnum.STREAM) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  const response = await fetchApi(resolveTransportUrl(apiBaseUrl, descriptor.url), {
    headers,
    ...(signal ? { signal } : {}),
  });
  await assertOk(response, i18n.t('flow.imageLoadFailed'));
  return URL.createObjectURL(await response.blob());
}

export async function loadAuthorizedImage(
  apis: ReferenceApis,
  apiBaseUrl: string,
  accessToken: string,
  spaceId: string,
  memoryId: string,
  attachmentId: string,
  fetchApi: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  return loadAuthorizedMedia(
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    AttachmentReadRequestParentTypeEnum.MEMORY,
    memoryId,
    attachmentId,
    fetchApi,
    signal,
  );
}

export async function signIn(
  apiBaseUrl: string,
  email: string,
  password: string,
): Promise<SessionView> {
  const { auth } = createReferenceApis(apiBaseUrl);
  try {
    return await auth.signInApiV1AuthSignInPost({
      signInRequest: {
        email,
        password,
        deviceName: 'eimir. Web M2 reference flow',
        platform: 'web',
      },
    });
  } catch (error) {
    return rethrowLocalized(error, i18n.t('flow.signInFailed'));
  }
}

export async function runMemoryMediaStoryFlow(
  apis: ReferenceApis,
  apiBaseUrl: string,
  accessToken: string,
  spaceId: string,
  memoryCreate: MemoryCreate,
  file?: File,
  fetchApi: typeof fetch = fetch,
): Promise<FlowResult> {
  if (file && !file.type.startsWith('image/'))
    throw new ReferenceFlowError(i18n.t('flow.imageOnly'));

  try {
    const memory = await apis.memories.createMemory({ spaceId, memoryCreate });

    if (!file) {
      const story = await apis.story.getStoryTimeline({ spaceId, limit: 25 });
      return { memory, story, imageUrl: null };
    }

    const upload = await apis.attachments.createAttachmentUpload({
      spaceId,
      attachmentUploadCreate: {
        expectedMimeType: file.type,
        expectedSize: file.size,
        mediaType: MediaType.IMAGE,
        originalName: file.name,
      },
    });

    await uploadAttachmentBytes(
      apiBaseUrl,
      accessToken,
      upload,
      file,
      fetchApi,
    );
    await apis.attachments.finalizeAttachmentUpload({
      spaceId,
      attachmentId: upload.attachment.id,
      body: {},
    });
    await waitUntilReady(apis, spaceId, upload.attachment.id);

    const boundMemory = await apis.memories.replaceMemoryAttachments({
      spaceId,
      memoryId: memory.id,
      ifMatch: String(memory.version),
      memoryAttachmentSet: {
        attachments: [{ attachmentId: upload.attachment.id, position: 0 }],
      },
    });

    const story = await apis.story.getStoryTimeline({ spaceId, limit: 25 });
    const imageUrl = await loadAuthorizedImage(
      apis,
      apiBaseUrl,
      accessToken,
      spaceId,
      boundMemory.id,
      upload.attachment.id,
      fetchApi,
    );

    return { memory: boundMemory, story, imageUrl };
  } catch (error) {
    if (error instanceof ReferenceFlowError) throw error;
    return rethrowLocalized(error, i18n.t('flow.saveFailed'));
  }
}
