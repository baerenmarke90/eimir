import type { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import type { ReferenceApis } from './referenceFlow';

export type StoryMediaParentType = Extract<
  AttachmentReadRequestParentTypeEnum,
  'MEMORY' | 'HEART_MOMENT'
>;

type StoryMediaLoaderOptions = {
  fetchApi?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  signal?: AbortSignal;
  variant?: 'original' | 'thumbnail';
};

/**
 * Load media for timeline/story cards while preserving the attachment parent
 * binding used by the read-access contract. Signed URLs are fetched directly;
 * STREAM descriptors reuse the configured generated API client so its bearer
 * token and base path remain authoritative.
 */
export async function loadAuthorizedStoryImage(
  apis: ReferenceApis,
  spaceId: string,
  parentType: StoryMediaParentType,
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<string> {
  const descriptorRequest = {
    spaceId,
    attachmentId,
    attachmentReadRequest: {
      parentType,
      parentId,
      ...(options.variant ? { variant: options.variant } : {}),
    },
  };
  const descriptor = options.signal
    ? await apis.attachments.createAttachmentReadAccess(descriptorRequest, {
        signal: options.signal,
      })
    : await apis.attachments.createAttachmentReadAccess(descriptorRequest);

  let blob: Blob;
  if (descriptor.method === ReadDescriptorMethodEnum.SIGNED_URL) {
    const fetchApi = options.fetchApi ?? fetch;
    const response = options.signal
      ? await fetchApi(descriptor.url, { signal: options.signal })
      : await fetchApi(descriptor.url);
    if (!response.ok) {
      throw Object.assign(
        new Error(`Story media load failed: ${response.status}`),
        { status: response.status },
      );
    }
    blob = await response.blob();
  } else {
    const request = {
      spaceId,
      attachmentId,
      ...(options.variant ? { variant: options.variant } : {}),
    };
    const response = options.signal
      ? await apis.attachments.getAttachmentContentRaw(request, {
          signal: options.signal,
        })
      : await apis.attachments.getAttachmentContentRaw(request);
    blob = await response.raw.blob();
  }

  return (options.createObjectUrl ?? URL.createObjectURL)(blob);
}
