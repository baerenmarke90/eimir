import { type ReactNode, useContext, useId, useRef, useState } from 'react';
import type { ReferenceApis } from '../client/referenceFlow';
import type { HeartVoiceDraft } from '../client/useHeartVoiceDraft';
import { useVoiceRecorder } from '../client/useVoiceRecorder';
import {
  AudioProcessingContext,
  VOICE_ACCEPT,
  voiceTime,
} from '../client/voiceNotes';
import { useTranslation } from '../i18n';
import { SavedVoiceNote } from './SavedVoiceNote';
import { ShortTaskSheet } from './ShortTaskSheet';
import { VoiceNotePlayer, VoiceWaveform } from './VoiceNotePlayer';
import './VoiceNotes.css';
import { AddActionButton } from './AddAction';

export function VoiceNoteEditor({
  voice,
  onChange,
  disabled,
  apis,
  spaceId,
  momentId,
  canManageExisting = true,
  presentation,
  renderTrigger,
}: {
  presentation?: 'composer';
  renderTrigger?: (open: () => void) => ReactNode;
  voice: HeartVoiceDraft;
  onChange: () => void;
  disabled: boolean;
  apis: ReferenceApis;
  spaceId: string;
  momentId?: string;
  canManageExisting?: boolean;
}) {
  const { t } = useTranslation();
  const enabled = useContext(AudioProcessingContext);
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<'source' | 'record' | null>(null);
  const capture = useVoiceRecorder((file) => {
    voice.add(file);
    onChange();
    setSheet(null);
  });
  function close() {
    capture.cancel();
    setSheet(null);
  }
  if (!enabled && !voice.hasAudio) return null;
  const draft = voice.draft;
  const canReplace =
    !voice.existing ||
    canManageExisting ||
    voice.existing.canEditSensitivity === true;
  const error = voice.error || capture.error;
  const editor = voice.hasAudio ? (
    <>
      {draft?.previewUrl ? (
        <VoiceNotePlayer
          src={draft.previewUrl}
          title={t('voiceNotes.title')}
          duration={draft.durationSeconds}
        />
      ) : voice.existing && momentId ? (
        <SavedVoiceNote
          apis={apis}
          spaceId={spaceId}
          momentId={momentId}
          attachment={voice.existing}
        />
      ) : null}
      {voice.hasPending ? (
        <p role="status">
          {t(
            draft?.status === 'validating'
              ? 'voiceNotes.processing'
              : 'voiceNotes.uploading',
          )}
        </p>
      ) : null}
      {voice.hasFailed && draft ? (
        <div role="alert">
          <p>{draft.error || t('voiceNotes.uploadFailed')}</p>
          <button
            type="button"
            className="tertiary"
            disabled={disabled}
            onClick={() => voice.uploads.retry(draft)}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {canReplace ? (
        <div className="voice-draft-actions">
          {enabled ? (
            <button
              type="button"
              className="tertiary"
              disabled={disabled}
              onClick={() => setSheet('source')}
            >
              {t('voiceNotes.reRecord')}
            </button>
          ) : null}
          <button
            type="button"
            className="tertiary"
            disabled={disabled}
            onClick={() => {
              voice.remove();
              onChange();
            }}
          >
            {t('voiceNotes.remove')}
          </button>
        </div>
      ) : null}
      <label htmlFor={`${id}-title`}>{t('voiceNotes.audioTitle')}</label>
      <input
        id={`${id}-title`}
        value={voice.title}
        maxLength={120}
        disabled={disabled}
        onChange={(event) => {
          voice.setTitle(event.currentTarget.value);
          onChange();
        }}
      />
      <label htmlFor={`${id}-speaker`}>{t('voiceNotes.speaker')}</label>
      <input
        id={`${id}-speaker`}
        value={voice.speaker}
        maxLength={80}
        disabled={disabled}
        onChange={(event) => {
          voice.setSpeaker(event.currentTarget.value);
          onChange();
        }}
      />
    </>
  ) : (
    <AddActionButton
      label={t('voiceNotes.title')}
      className="voice-add"
      disabled={disabled}
      onClick={() => setSheet('source')}
    />
  );
  return (
    <div
      className="voice-editor"
      data-empty={
        !voice.hasAudio && !voice.hasPending && !voice.hasFailed && !error
      }
    >
      {presentation === 'composer' ? (
        <>
          {voice.hasAudio ? (
            draft?.previewUrl ? (
              <VoiceNotePlayer
                src={draft.previewUrl}
                duration={draft.durationSeconds}
              />
            ) : voice.existing && momentId ? (
              <SavedVoiceNote
                apis={apis}
                spaceId={spaceId}
                momentId={momentId}
                attachment={voice.existing}
              />
            ) : null
          ) : null}
          {renderTrigger?.(() => setSheet('source'))}
          {voice.hasPending ? (
            <p role="status">{t('voiceNotes.uploading')}</p>
          ) : null}
          {voice.hasFailed && draft ? (
            <p role="alert">{draft.error || t('voiceNotes.uploadFailed')}</p>
          ) : null}
        </>
      ) : (
        editor
      )}
      {error ? <p role="alert">{t(`voiceNotes.${error}`)}</p> : null}
      <input
        ref={picker}
        hidden
        type="file"
        accept={VOICE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={t('voiceNotes.choose')}
        disabled={disabled || !enabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            voice.add(file);
            onChange();
          }
          event.currentTarget.value = '';
        }}
      />
      <ShortTaskSheet
        open={sheet === 'source'}
        title={t('voiceNotes.title')}
        onClose={close}
      >
        {presentation === 'composer' && voice.hasAudio ? editor : null}
        <div className="voice-source-actions">
          <button
            type="button"
            className="secondary"
            disabled={disabled || !enabled || !canReplace}
            onClick={() => {
              setSheet('record');
              onChange();
              void capture.start();
            }}
          >
            {t('voiceNotes.record')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !enabled || !canReplace}
            onClick={() => {
              setSheet(null);
              picker.current?.click();
            }}
          >
            {t('voiceNotes.choose')}
          </button>
        </div>
        <p className="voice-limit">{t('voiceNotes.limit')}</p>
      </ShortTaskSheet>
      <ShortTaskSheet
        open={sheet === 'record'}
        title={t('voiceNotes.recordingTitle')}
        onClose={close}
        className="voice-recording-sheet"
      >
        <div className="voice-recording">
          <p role="status">
            {t(
              capture.phase === 'requesting'
                ? 'voiceNotes.requesting'
                : capture.phase === 'recording'
                  ? 'voiceNotes.recording'
                  : 'voiceNotes.recordingTitle',
            )}
          </p>
          <output className="voice-recording-time">
            {voiceTime(capture.elapsed)}
          </output>
          <p className="voice-limit">{t('voiceNotes.limit')}</p>
          <VoiceWaveform peaks={capture.wave} />
          {error ? <p role="alert">{t(`voiceNotes.${error}`)}</p> : null}
          <button
            type="button"
            className="voice-stop"
            disabled={capture.phase !== 'recording'}
            onClick={capture.stop}
            aria-label={t('voiceNotes.stop')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
          <span>{t('voiceNotes.stop')}</span>
          <button type="button" className="tertiary" onClick={close}>
            {t('common.cancel')}
          </button>
        </div>
      </ShortTaskSheet>
    </div>
  );
}
