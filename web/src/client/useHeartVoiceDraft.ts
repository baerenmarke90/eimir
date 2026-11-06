import { useCallback, useState } from 'react';
import type { HeartMomentDetail } from '../api/generated/models/HeartMomentDetail';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import {
  type AttachmentDraftOptions,
  useAttachmentDrafts,
} from './useAttachmentDrafts';
import { voiceFile } from './voiceNotes';

export function useHeartVoiceDraft(options: AttachmentDraftOptions) {
  const scope = JSON.stringify([
    options.apiBaseUrl,
    options.accountId,
    options.spaceId,
    options.resourceKey,
  ]);
  const uploads = useAttachmentDrafts({
    ...options,
    resourceKey: JSON.stringify([
      options.apiBaseUrl,
      'voice',
      options.resourceKey,
    ]),
    maxAttachments: 1,
    preserveMetadata: false,
  });
  const [state, setState] = useState<{
    scope: string;
    existing?: OrderedAttachmentSummary;
    title: string;
    speaker: string;
    error: string;
  }>({ scope, title: '', speaker: '', error: '' });
  const current =
    state.scope === scope
      ? state
      : { scope, title: '', speaker: '', error: '' };
  const clearUploads = uploads.clear;
  const load = useCallback(
    (moment: HeartMomentDetail) => {
      clearUploads();
      setState({
        scope,
        existing: moment.attachments?.find(
          (item) => item.mediaType === 'AUDIO',
        ),
        title: moment.audioTitle ?? '',
        speaker: moment.audioSpeakerName ?? '',
        error: '',
      });
    },
    [scope, clearUploads],
  );
  function add(file: File) {
    try {
      const input = voiceFile(file);
      uploads.clear();
      uploads.addFiles([input]);
      setState((previous) => ({
        ...(previous.scope === scope ? previous : current),
        existing: undefined,
        error: '',
      }));
    } catch (error) {
      setState({
        ...current,
        error: error instanceof Error ? error.message : 'unsupported',
      });
    }
  }
  const draft = uploads.items[0];
  const id =
    draft?.status === 'ready' ? draft.attachmentId : current.existing?.id;
  return {
    ...current,
    draft,
    uploads,
    load,
    add,
    attachmentId: id,
    hasAudio: Boolean(draft || current.existing),
    hasPending: uploads.hasPending,
    hasFailed: draft?.status === 'failed',
    setTitle: (title: string) =>
      setState((previous) => ({
        ...(previous.scope === scope ? previous : current),
        title,
      })),
    setSpeaker: (speaker: string) =>
      setState((previous) => ({
        ...(previous.scope === scope ? previous : current),
        speaker,
      })),
    remove: () => {
      uploads.clear();
      setState({ scope, title: '', speaker: '', error: '' });
    },
  };
}
export type HeartVoiceDraft = ReturnType<typeof useHeartVoiceDraft>;
