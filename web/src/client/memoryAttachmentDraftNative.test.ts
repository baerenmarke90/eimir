// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import { i18n } from '../i18n';
import { uploadMemoryDraftAttachment } from './memoryAttachmentDraft';
import type { ReferenceApis } from './referenceFlow';
import { clearStoredSession, storeSession } from './sessionPersistence';

vi.mock('../pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pwa')>()),
  isCapacitorNative: () => true,
}));

const api = 'https://instance.example';
const tokens = {
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  accessExpiresAt: new Date(Date.now() + 900_000),
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
};
const descriptor: UploadDescriptor = {
  attachment: {
    id: 'photo',
    createdAt: new Date(),
    durationSeconds: null,
    hasThumbnail: false,
    isSensitive: false,
    height: null,
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: null,
    status: 'PENDING',
    version: 1,
    width: null,
  },
  method: 'STREAM',
  uploadUrl: '/api/v1/spaces/space/attachments/photo/content',
  requiredHeaders: { 'Content-Type': 'application/octet-stream' },
};

/** The WebView's retained browser XHR that the native app uses for bytes. */
class BrowserXhr extends EventTarget {
  status = 0;
  statusText = '';
  responseText = '';
  timeout = 0;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  getResponseHeader() {
    return null;
  }
  getAllResponseHeaders() {
    return '';
  }
  send() {
    sent.push(this);
    queueMicrotask(() => outcome(this));
  }
  abort() {
    this.onabort?.();
  }
}
const sent: BrowserXhr[] = [];
let outcome: (request: BrowserXhr) => void;

beforeEach(async () => {
  sent.length = 0;
  const prototype = BrowserXhr.prototype;
  Object.assign(window, {
    CapacitorWebXMLHttpRequest: {
      constructor: BrowserXhr,
      open: prototype.open,
      send: prototype.send,
      abort: prototype.abort,
      setRequestHeader: prototype.setRequestHeader,
      getResponseHeader: prototype.getResponseHeader,
      getAllResponseHeaders: prototype.getAllResponseHeaders,
    },
  });
  await clearStoredSession();
  await storeSession({ account: { id: 'alex', displayName: 'Alex' }, tokens });
});
afterEach(async () => {
  delete (window as { CapacitorWebXMLHttpRequest?: unknown })
    .CapacitorWebXMLHttpRequest;
  await clearStoredSession();
});

function apis() {
  return {
    attachments: {
      createAttachmentUpload: vi.fn().mockResolvedValue(descriptor),
      finalizeAttachmentUpload: vi.fn(),
      deleteAttachment: vi.fn(),
    },
  } as unknown as ReferenceApis;
}

function upload(target: ReferenceApis) {
  return uploadMemoryDraftAttachment(
    target,
    api,
    tokens.accessToken,
    'space',
    new File(['photo bytes'], 'private-name.jpg', { type: 'image/jpeg' }),
    undefined,
    vi.fn(),
    { accountId: 'alex' },
  );
}

it('names a connection lost in the native transport and leaves a breadcrumb without secrets', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  outcome = (request) => {
    request.upload.onprogress?.({
      loaded: 37,
      total: 100,
      lengthComputable: true,
    } as ProgressEvent);
    request.onerror?.();
  };
  const target = apis();
  try {
    await expect(upload(target)).rejects.toMatchObject({
      reason: 'connection',
      reference: 'put-network-app',
      message: `${i18n.t('uploadFailure.connection')} ${i18n.t('uploadFailure.reference', { reference: 'put-network-app' })}`,
    });
    expect(sent).toHaveLength(1);
    expect(target.attachments.finalizeAttachmentUpload).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const [line] = warn.mock.calls[0];
    expect(line).toContain(
      'phase=put transport=app media=image reason=connection status=0 detail=network progress=37',
    );
    for (const secret of [
      'access-secret',
      'refresh-secret',
      'private-name',
      'instance.example',
      '/attachments/',
    ])
      expect(line).not.toContain(secret);
  } finally {
    warn.mockRestore();
  }
});

it('keeps the problem code of a refusal the native transport received', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  outcome = (request) => {
    request.status = 409;
    request.statusText = 'Conflict';
    request.responseText = JSON.stringify({ code: 'ATTACHMENT_NOT_READY' });
    request.onload?.();
  };
  try {
    await expect(upload(apis())).rejects.toMatchObject({
      reason: 'refused',
      code: 'ATTACHMENT_NOT_READY',
      reference: 'put-409-ATTACHMENT_NOT_READY-app',
    });
  } finally {
    warn.mockRestore();
  }
});
