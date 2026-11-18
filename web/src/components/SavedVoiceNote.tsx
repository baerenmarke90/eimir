import { useState } from 'react';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import type { ReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import {
  SensitiveMediaControl,
  useSensitiveMediaReveals,
} from './SensitiveMedia';
import { VoiceNotePlayer } from './VoiceNotePlayer';

export function SavedVoiceNote({
  apis,
  spaceId,
  momentId,
  attachment,
  title,
  speaker,
}: {
  apis: ReferenceApis;
  spaceId: string;
  momentId: string;
  attachment: OrderedAttachmentSummary;
  title?: string;
  speaker?: string;
}) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const reveals = useSensitiveMediaReveals(
    `${spaceId}:${momentId}:${attachment.id}`,
  );
  const concealed =
    attachment.isSensitive && !reveals.isRevealed(attachment.id);
  const resource = useObjectUrlResource(
    `${mediaCacheScopeForClient(apis.attachments).id}:${spaceId}:HEART_MOMENT:${momentId}:voice:${attempt}`,
    attachment.status === 'READY' && !concealed ? attachment.id : null,
    (id, signal) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        'HEART_MOMENT',
        momentId,
        id,
        { signal },
      ),
  );
  if (concealed)
    return (
      <div className="voice-player">
        <SensitiveMediaControl
          mediaType="AUDIO"
          revealed={false}
          onToggle={() => reveals.toggle(attachment.id)}
        />
      </div>
    );
  if (attachment.status === 'FAILED')
    return <p role="alert">{t('voiceNotes.loadFailed')}</p>;
  if (resource.error)
    return (
      <div className="voice-player" role="alert">
        <p>{t('voiceNotes.loadFailed')}</p>
        <button
          type="button"
          className="tertiary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  if (!resource.url) return <p role="status">{t('voiceNotes.processing')}</p>;
  return (
    <div className="voice-editor">
      {attachment.isSensitive && (
        <SensitiveMediaControl
          mediaType="AUDIO"
          revealed
          onToggle={() => reveals.toggle(attachment.id)}
        />
      )}
      <VoiceNotePlayer
        src={resource.url}
        title={title || t('voiceNotes.title')}
        defaultTitle={!title}
        speaker={speaker}
        duration={attachment.durationSeconds}
      />
    </div>
  );
}
