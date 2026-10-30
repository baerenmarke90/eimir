import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { MemoryDetailToJSON } from '../api/generated/models/MemoryDetail';
import type { PhotoReaction } from '../api/generated/models/PhotoReaction';
import type { PhotoReactionSummary } from '../api/generated/models/PhotoReactionSummary';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { saveProductReadCacheEntry } from '../client/productReadCache';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import type { ReferenceApis } from '../client/referenceFlow';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { GalleryExpandAction, MediaGallery } from './MediaGallery';
import { ProblemState } from './ProblemState';
import './MemoryPhotoGallery.css';

export const PHOTO_REACTIONS = [
  { value: 'LOVE', emoji: '❤️' },
  { value: 'LAUGH', emoji: '😂' },
  { value: 'SURPRISE', emoji: '😮' },
  { value: 'SAD', emoji: '😢' },
  { value: 'CELEBRATE', emoji: '🙌' },
  { value: 'LIKE', emoji: '👍' },
] as const;

function PhotoActions({
  request,
  onRequestHandled,
  reactions,
  disabled,
  saving,
  onReact,
  openFullScreen,
  revealed,
}: {
  request: number;
  onRequestHandled: () => void;
  reactions: PhotoReactionSummary[];
  disabled: boolean;
  saving: boolean;
  onReact: (reaction: PhotoReaction | null) => Promise<boolean>;
  openFullScreen: () => void;
  revealed: boolean;
}) {
  const { t } = useTranslation();
  const popover = useDismissiblePopover();
  const firstChoice = useRef<HTMLButtonElement>(null);
  const own = reactions.find((item) => item.own)?.reaction;
  const close = useCallback(() => popover.close(true), [popover.close]);
  const closeHistory = useEditorHistoryEntry({
    isActive: popover.isOpen,
    isDirty: false,
    onClose: close,
    onDiscardRequested: close,
  });
  useEffect(() => {
    if (request > 0) {
      popover.open();
      onRequestHandled();
    }
  }, [request, popover.open, onRequestHandled]);
  useEffect(() => {
    if (popover.isOpen) firstChoice.current?.focus();
  }, [popover.isOpen]);

  return (
    <>
      {revealed ? (
        <GalleryExpandAction
          className="memory-photo-expand"
          onOpen={openFullScreen}
        />
      ) : null}
      <button
        type="button"
        className="memory-photo-react media-overlay"
        ref={(element) => {
          popover.triggerRef.current = element;
        }}
        disabled={disabled}
        onClick={() => (popover.isOpen ? closeHistory(close) : popover.open())}
        aria-label={t('photoReactions.open')}
        aria-expanded={popover.isOpen}
        aria-controls="memory-photo-reaction-picker"
      >
        <EimirIcon name="smile-plus" />
      </button>
      {popover.isOpen ? (
        <fieldset
          className="memory-photo-picker"
          id="memory-photo-reaction-picker"
          aria-label={t('photoReactions.choose')}
          ref={(element) => {
            popover.panelRef.current = element;
          }}
          aria-busy={saving}
        >
          {PHOTO_REACTIONS.map(({ value, emoji }, index) => (
            <button
              type="button"
              key={value}
              ref={index === 0 ? firstChoice : undefined}
              disabled={disabled || saving}
              aria-label={t(`photoReactions.names.${value}`)}
              aria-pressed={own === value}
              onClick={() => {
                void onReact(own === value ? null : value).then((saved) => {
                  if (saved) closeHistory(close);
                });
              }}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </fieldset>
      ) : null}
    </>
  );
}

export function MemoryPhotoGallery({
  memory,
  apis,
  accountId,
  scope,
  offline,
  loadImage,
}: {
  memory: MemoryDetail;
  apis: ReferenceApis;
  accountId: string;
  scope: string;
  offline: boolean;
  loadImage: (attachmentId: string, signal?: AbortSignal) => Promise<string>;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const captureTask = useTaskActivation(true, scope);
  const inFlight = useRef(false);
  const [request, setRequest] = useState({ id: '', sequence: 0 });
  const clearRequest = useCallback(
    () => setRequest((current) => ({ ...current, id: '' })),
    [],
  );
  const [announcement, setAnnouncement] = useState('');
  const queryKey = authorSummaryQueryKeys.memory(memory.spaceId, memory.id);
  const photos = [...memory.attachments]
    .filter((item) => item.status === 'READY')
    .sort((a, b) => a.position - b.position);
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async ({
      attachmentId,
      reaction,
      isCurrent,
    }: {
      attachmentId: string;
      reaction: PhotoReaction | null;
      isCurrent: () => boolean;
    }) => {
      try {
        assertOnlineWrite();
        if (!isCurrent())
          throw new Error('Photo reaction context is no longer authorized.');
        await client.cancelQueries({ queryKey });
        assertOnlineWrite();
        if (!isCurrent())
          throw new Error('Photo reaction context is no longer authorized.');
        return await apis.memories.setMemoryPhotoReaction({
          spaceId: memory.spaceId,
          memoryId: memory.id,
          attachmentId,
          photoReactionSet: { reaction },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (updated, variables) => {
      if (!variables.isCurrent()) return;
      const observed = client.getQueryData<{ value: MemoryDetail }>(queryKey);
      if (!observed || observed.value.version > updated.version) return;
      client.setQueryData(queryKey, { value: updated, source: 'network' });
      void saveProductReadCacheEntry({
        accountId,
        spaceId: updated.spaceId,
        kind: 'memory',
        resourceId: updated.id,
        value: updated,
        serialize: MemoryDetailToJSON,
      }).catch(() => {
        // The server-confirmed result remains valid if the optional read cache is unavailable.
      });
      setAnnouncement(
        t(
          variables.reaction
            ? 'photoReactions.saved'
            : 'photoReactions.removed',
        ),
      );
    },
    onError: (_error, variables) => {
      if (variables.isCurrent()) void client.invalidateQueries({ queryKey });
    },
  });
  const react = async (
    attachmentId: string,
    reaction: PhotoReaction | null,
  ): Promise<boolean> => {
    if (offline || inFlight.current) return false;
    const ownsTask = captureTask();
    const ownsRead = captureAuthorizedQuery(client, queryKey);
    const isCurrent = () => ownsTask() && ownsRead();
    if (!isCurrent()) return false;
    inFlight.current = true;
    try {
      await mutation.mutateAsync({ attachmentId, reaction, isCurrent });
      return isCurrent();
    } catch {
      return false;
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="memory-photo-gallery photo-gallery">
      <MediaGallery
        items={photos.map(({ id, mediaType, isSensitive }) => ({
          id,
          mediaType,
          isSensitive,
        }))}
        loadMedia={loadImage}
        resourceScopeKey={scope}
        directSensitiveToggle
        dismissWithHistory
        onPhotoLongPress={
          offline
            ? undefined
            : (id) =>
                setRequest((current) => ({
                  id,
                  sequence: current.sequence + 1,
                }))
        }
        renderPhotoActions={(item, openFullScreen, revealed) =>
          item.mediaType === 'IMAGE' ? (
            <PhotoActions
              key={`${scope}:${item.id}`}
              request={request.id === item.id ? request.sequence : 0}
              onRequestHandled={clearRequest}
              reactions={
                photos.find((photo) => photo.id === item.id)?.reactions ?? []
              }
              disabled={offline}
              saving={mutation.isPending}
              onReact={(reaction) => react(item.id, reaction)}
              openFullScreen={openFullScreen}
              revealed={revealed}
            />
          ) : null
        }
        renderPhotoReactions={(item) => {
          const reactions =
            photos.find((photo) => photo.id === item.id)?.reactions ?? [];
          if (!reactions.length) return null;
          return (
            <fieldset
              className="memory-photo-reactions"
              aria-label={t('photoReactions.summary')}
            >
              {reactions.map(({ reaction, count, own }) => (
                <button
                  type="button"
                  key={reaction}
                  aria-pressed={own}
                  disabled={offline || mutation.isPending}
                  aria-label={t(
                    own ? 'photoReactions.ownChip' : 'photoReactions.chip',
                    { name: t(`photoReactions.names.${reaction}`), count },
                  )}
                  onClick={() => {
                    void react(item.id, own ? null : reaction);
                  }}
                >
                  <span aria-hidden="true">
                    {
                      PHOTO_REACTIONS.find(
                        (choice) => choice.value === reaction,
                      )?.emoji
                    }{' '}
                    {new Intl.NumberFormat(resolvedLocale()).format(count)}
                  </span>
                </button>
              ))}
            </fieldset>
          );
        }}
      />
      {mutation.error ? (
        <ProblemState
          error={mutation.error}
          onRetry={() => {
            if (mutation.variables)
              void react(
                mutation.variables.attachmentId,
                mutation.variables.reaction,
              );
          }}
        />
      ) : null}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
