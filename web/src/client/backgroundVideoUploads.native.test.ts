// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import {
  bindVideoTransferTargets,
  clearBackgroundVideoTransfers,
  startBackgroundVideoTransfer,
} from './backgroundVideoUploads';
import { createMemoryWithReadyAttachments } from './memoryAttachmentDraft';
import type { ReferenceApis } from './referenceFlow';

const bridge = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  bindTarget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => bridge,
}));
vi.mock('./config', () => ({ isAndroidApp: () => true }));
const owner = {
  instance: 'https://api.example',
  accountId: 'owner',
  spaceId: 'space',
};
const target = { targetType: 'MEMORY' as const, targetId: 'memory' };
const descriptor = { attachment: { id: 'video' } } as UploadDescriptor;
async function stage() {
  await startBackgroundVideoTransfer({
    apis: {} as ReferenceApis,
    apiBaseUrl: owner.instance,
    accessToken: 'synthetic',
    accountId: owner.accountId,
    spaceId: owner.spaceId,
    file: new File(['synthetic'], 'video.mp4', { type: 'video/mp4' }),
    descriptor,
  });
}
afterEach(() => {
  clearBackgroundVideoTransfers();
  vi.clearAllMocks();
});

it('binds the exact staged owner and video only after the parent save is confirmed', async () => {
  await stage();
  let finish!: (value: MemoryDetail) => void;
  const response = new Promise<MemoryDetail>((resolve) => {
    finish = resolve;
  });
  const apis = {
    memories: { createMemory: vi.fn().mockReturnValue(response) },
  } as unknown as ReferenceApis;
  const saving = createMemoryWithReadyAttachments(
    apis,
    owner.spaceId,
    {
      title: 'Synthetic memory',
      attachments: [{ attachmentId: 'video', position: 0 }],
    },
    ['video'],
  );
  expect(bridge.bindTarget).not.toHaveBeenCalled();
  finish({ id: target.targetId } as MemoryDetail);
  await saving;
  expect(bridge.bindTarget).toHaveBeenCalledExactlyOnceWith({
    ...owner,
    ...target,
    attachmentId: 'video',
  });
});
it('does not bind an unsuccessful save, a foreign Space, a photo or a revoked transfer', async () => {
  await stage();
  const apis = {
    memories: { createMemory: vi.fn().mockRejectedValue(new Error('Offline')) },
  } as unknown as ReferenceApis;
  await expect(
    createMemoryWithReadyAttachments(
      apis,
      owner.spaceId,
      { title: 'Synthetic memory', attachments: [] },
      [],
    ),
  ).rejects.toThrow('Offline');
  await bindVideoTransferTargets('other-space', target, ['video']);
  await bindVideoTransferTargets(owner.spaceId, target, ['photo']);
  clearBackgroundVideoTransfers();
  await bindVideoTransferTargets(owner.spaceId, target, ['video']);
  expect(bridge.bindTarget).not.toHaveBeenCalled();
});
it('preserves the confirmed parent result if completion or revocation wins native binding', async () => {
  await stage();
  bridge.bindTarget.mockRejectedValueOnce(new Error('Already complete'));
  const memory = { id: target.targetId } as MemoryDetail;
  const apis = {
    memories: { createMemory: vi.fn().mockResolvedValue(memory) },
  } as unknown as ReferenceApis;
  await expect(
    createMemoryWithReadyAttachments(
      apis,
      owner.spaceId,
      {
        title: 'Synthetic memory',
        attachments: [{ attachmentId: 'video', position: 0 }],
      },
      ['video'],
    ),
  ).resolves.toEqual({ memory });
});
