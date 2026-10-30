import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import type { RecapView } from '../api/generated/models/RecapView';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { recapDate } from '../client/recaps';
import { recapDetailPath } from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import { resolvedLocale, useTranslation } from '../i18n';
import type { ProfilePageProps } from './ProfilePage';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';

export function RecapTasks({
  task,
  onClose,
  api,
  value,
  canCompose,
  onUpdated,
  ...props
}: ProfilePageProps & {
  task: 'selection' | 'reflection' | 'save' | null;
  onClose: () => void;
  api: RecapsApi;
  value: RecapView;
  canCompose: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [base, setBase] = useState(value);
  const ownShared = base.reflections.find(
    (note) => note.ownerId === props.account.id,
  );
  const initialText = base.ownDraft?.text ?? ownShared?.text ?? '';
  const [text, setText] = useState(initialText);
  const [keys, setKeys] = useState<string[]>([]);
  const [initialKeys, setInitialKeys] = useState<string[]>([]);
  const initialized = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [discard, setDiscard] = useState(false);
  const selection = useQuery({
    queryKey: ['recap-selection', props.account.id, props.spaceId, base.id],
    enabled: task === 'selection',
    queryFn: async ({ signal }) => {
      try {
        return await api.getRecapSelection(
          { recapId: base.id, spaceId: props.spaceId },
          { signal },
        );
      } catch (cause) {
        throw await normalizeClientError(cause);
      }
    },
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    if (selection.data && !initialized.current) {
      initialized.current = true;
      setKeys(selection.data.selectedKeys);
      setInitialKeys(selection.data.selectedKeys);
    }
  }, [selection.data]);
  const dirty =
    task === 'reflection'
      ? text !== initialText
      : task === 'selection'
        ? JSON.stringify(keys) !== JSON.stringify(initialKeys)
        : false;
  async function perform(operation: () => Promise<unknown>, message?: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await operation();
      await client.invalidateQueries({
        queryKey: ['relationship-recaps', props.account.id, props.spaceId],
      });
      await onUpdated();
      if (message) postSnackbar(message);
      onClose();
    } catch (cause) {
      setError(await normalizeClientError(cause));
    } finally {
      setPending(false);
    }
  }
  async function reload() {
    setPending(true);
    try {
      setBase(
        await api.getRelationshipRecap({
          spaceId: props.spaceId,
          recapId: base.id,
        }),
      );
      if (task === 'selection') await selection.refetch();
      setError(null);
    } catch (cause) {
      setError(await normalizeClientError(cause));
    } finally {
      setPending(false);
    }
  }
  const conflict = error && clientProblemKind(error) === 'conflict';
  const footer =
    task === 'save' ? (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          void perform(
            () =>
              api.saveRecapEdition({
                spaceId: props.spaceId,
                recapId: base.id,
                ifMatch: `"${base.version}"`,
              }),
            'recaps.saveSuccess',
          )
        }
      >
        {t('recaps.saveConfirm')}
      </button>
    ) : task === 'selection' ? (
      <button
        type="button"
        disabled={
          pending ||
          !selection.data ||
          base.savedAt !== null ||
          keys.length > 12
        }
        onClick={() =>
          void perform(() =>
            api.updateRecapSelection({
              spaceId: props.spaceId,
              recapId: base.id,
              ifMatch: `"${base.version}"`,
              recapSelectionUpdate: { sourceKeys: keys },
            }),
          )
        }
      >
        {t('recaps.apply')}
      </button>
    ) : (
      <div className="recap-task-actions">
        <button
          type="button"
          className="secondary"
          disabled={
            pending ||
            !text.trim() ||
            base.savedAt !== null ||
            (!canCompose && !base.ownDraft)
          }
          onClick={() =>
            void perform(
              () =>
                api.updateRecapReflection({
                  spaceId: props.spaceId,
                  recapId: base.id,
                  recapReflectionUpdate: {
                    text,
                    shared: false,
                    version: base.ownDraft?.version ?? 0,
                  },
                }),
              'recaps.draftSaved',
            )
          }
        >
          {t('recaps.draft')}
        </button>
        <button
          type="button"
          disabled={
            pending ||
            !text.trim() ||
            base.savedAt !== null ||
            (!canCompose && !ownShared)
          }
          onClick={() =>
            void perform(
              () =>
                api.updateRecapReflection({
                  spaceId: props.spaceId,
                  recapId: base.id,
                  recapReflectionUpdate: {
                    text,
                    shared: true,
                    version: ownShared?.version ?? 0,
                  },
                }),
              'recaps.shared',
            )
          }
        >
          {t('recaps.share')}
        </button>
      </div>
    );
  return (
    <>
      <ShortTaskSheet
        open={task !== null}
        onClose={onClose}
        title={t(
          task === 'selection'
            ? 'recaps.selectionTitle'
            : task === 'save'
              ? 'recaps.saveTitle'
              : 'recaps.reflectionTitle',
        )}
        isDirty={dirty}
        isCloseBlocked={pending}
        onDiscardRequested={() => setDiscard(true)}
        footer={footer}
      >
        {error ? (
          conflict ? (
            <div role="alert">
              <p>{t('recaps.conflict')}</p>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => void reload()}
              >
                {t('recaps.reload')}
              </button>
            </div>
          ) : (
            <ProblemState error={error} />
          )
        ) : null}
        {task === 'selection' ? (
          <>
            <p>{t('recaps.selectionBody')}</p>
            {selection.isPending ? (
              <p role="status">{t('states.loading.title')}</p>
            ) : null}
            {selection.error ? (
              <ProblemState
                error={selection.error}
                onRetry={() => void selection.refetch()}
              />
            ) : null}
            <p aria-live="polite">
              {t('recaps.selectionCount', { count: keys.length })}
            </p>
            <fieldset className="recap-selection">
              <legend className="sr-only">{t('recaps.selectionTitle')}</legend>
              {selection.data?.items.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={keys.includes(item.key)}
                    disabled={
                      pending || (!keys.includes(item.key) && keys.length >= 12)
                    }
                    onChange={(event) =>
                      setKeys((current) =>
                        event.target.checked
                          ? [...current, item.key]
                          : current.filter((key) => key !== item.key),
                      )
                    }
                  />
                  <span>
                    <strong>{item.title ?? t('recaps.untitled')}</strong>
                    <small>
                      {t(`recaps.sourceKind.${item.kind}`)}
                      {item.occurredOn
                        ? ` · ${recapDate(item.occurredOn, resolvedLocale())}`
                        : ''}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            {canCompose &&
            base.variant < 3 &&
            (selection.data?.items.length ?? 0) > base.sources.length ? (
              <button
                className="recap-text-button"
                type="button"
                disabled={pending || dirty}
                onClick={() =>
                  void perform(async () => {
                    const next = await api.requestRelationshipRecap({
                      spaceId: props.spaceId,
                      recapRequest: {
                        kind: base.kind,
                        year: base.year,
                        month: base.month,
                        variant: base.variant + 1,
                      },
                    });
                    void navigate(
                      `${recapDetailPath(next.id)}${base.kind === 'YEAR' ? '?tab=years' : ''}`,
                    );
                  })
                }
              >
                {t('recaps.alternate')}
              </button>
            ) : null}
          </>
        ) : task === 'save' ? (
          <p>{t('recaps.saveBody')}</p>
        ) : (
          <>
            <p id="recap-reflection-help">{t('recaps.reflectionHelp')}</p>
            <label className="recap-reflection-field">
              {t('recaps.reflectionLabel')}
              <textarea
                rows={7}
                maxLength={2000}
                value={text}
                aria-describedby="recap-reflection-help"
                disabled={pending || base.savedAt !== null}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            {ownShared ? (
              <button
                className="recap-text-button"
                type="button"
                disabled={pending}
                onClick={() =>
                  void perform(
                    () =>
                      api.withdrawRecapReflection({
                        spaceId: props.spaceId,
                        recapId: base.id,
                        ifMatch: `"${ownShared.version}"`,
                      }),
                    'recaps.withdrawn',
                  )
                }
              >
                {t('recaps.withdraw')}
              </button>
            ) : null}
          </>
        )}
      </ShortTaskSheet>
      <ShortTaskSheet
        open={discard}
        title={t('recaps.discardTitle')}
        role="alertdialog"
        onClose={() => setDiscard(false)}
        footer={
          <div className="recap-task-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setDiscard(false)}
            >
              {t('recaps.keep')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscard(false);
                onClose();
              }}
            >
              {t('recaps.discard')}
            </button>
          </div>
        }
      >
        <p>{t('recaps.discardBody')}</p>
      </ShortTaskSheet>
    </>
  );
}
