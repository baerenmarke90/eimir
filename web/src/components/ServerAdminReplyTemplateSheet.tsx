import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from 'react';
import type { SupportReplyTemplateView } from '../api/generated/models/SupportReplyTemplateView';
import {
  REPLY_TEMPLATE_NAME_MAX,
  REPLY_TEMPLATE_TEXT_MAX,
  type ReplyTemplateDraft,
} from '../client/supportReplyTemplates';
import { characterCount } from '../client/supportReportsAdmin';
import { resolvedLocale, useTranslation } from '../i18n';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';

/**
 * Create or edit one reply template (#2327). A bottom sheet on Compact and a
 * centred dialog when wider, like the ticket dialog of a report.
 */
export function ServerAdminReplyTemplateSheet({
  template,
  pending,
  deleting,
  online,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  /** The template to edit; absent when creating one. */
  template: SupportReplyTemplateView | null;
  pending: boolean;
  deleting: boolean;
  online: boolean;
  /** A failure the operator can fix here (taken name, limit, validation). */
  error: string | null;
  onSave: (draft: ReplyTemplateDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(template?.name ?? '');
  const [text, setText] = useState(template?.text ?? '');
  const [attempted, setAttempted] = useState(false);
  const busy = pending || deleting;
  const numbers = new Intl.NumberFormat(resolvedLocale());

  useModalLifecycle({ active: true, initialFocusRef: nameRef });

  const nameEmpty = name.trim() === '';
  const textEmpty = text.trim() === '';
  const nameTooLong = characterCount(name.trim()) > REPLY_TEMPLATE_NAME_MAX;
  const textLength = characterCount(text.trim());
  const textTooLong = textLength > REPLY_TEMPLATE_TEXT_MAX;
  const nameError = nameTooLong
    ? t('serverAdmin.templates.sheet.nameTooLong', {
        max: REPLY_TEMPLATE_NAME_MAX,
      })
    : attempted && nameEmpty
      ? t('serverAdmin.templates.sheet.nameRequired')
      : null;
  const textError = textTooLong
    ? t('serverAdmin.templates.sheet.textTooLong', {
        max: REPLY_TEMPLATE_TEXT_MAX,
      })
    : attempted && textEmpty
      ? t('serverAdmin.templates.sheet.textRequired')
      : null;
  const dirty =
    name !== (template?.name ?? '') || text !== (template?.text ?? '');

  function close() {
    if (busy) return;
    if (
      dirty &&
      !window.confirm(t('serverAdmin.templates.sheet.discardConfirm'))
    )
      return;
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (busy || nameEmpty || textEmpty || nameTooLong || textTooLong) return;
    onSave({ name: name.trim(), text: text.trim() });
  }

  const nameErrorId = `${baseId}-name-error`;
  const textErrorId = `${baseId}-text-error`;
  const counterId = `${baseId}-counter`;
  const hintId = `${baseId}-name-hint`;

  return (
    <div className="server-admin-report-sheet-backdrop">
      <section
        ref={dialogRef}
        className="form-card server-admin-report-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        onKeyDown={handleKeyDown}
      >
        <header className="server-admin-report-sheet-head">
          <div>
            <p className="eyebrow">
              {t('serverAdmin.templates.sheet.eyebrow')}
            </p>
            <h2 id={`${baseId}-title`}>
              {t(
                template
                  ? 'serverAdmin.templates.sheet.editTitle'
                  : 'serverAdmin.templates.sheet.createTitle',
              )}
            </h2>
          </div>
        </header>
        <form className="server-admin-report-form" onSubmit={submit} noValidate>
          <label htmlFor={`${baseId}-name`}>
            {t('serverAdmin.templates.sheet.nameLabel')}
          </label>
          <p id={hintId} className="server-admin-muted">
            {t('serverAdmin.templates.sheet.nameHint')}
          </p>
          <input
            ref={nameRef}
            id={`${baseId}-name`}
            type="text"
            value={name}
            disabled={busy}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${hintId} ${nameErrorId}` : hintId}
            onChange={(event) => setName(event.target.value)}
          />
          {nameError ? (
            <p id={nameErrorId} className="status status-error" role="alert">
              {nameError}
            </p>
          ) : null}
          <label htmlFor={`${baseId}-text`}>
            {t('serverAdmin.templates.sheet.textLabel')}
          </label>
          <textarea
            id={`${baseId}-text`}
            value={text}
            rows={5}
            disabled={busy}
            aria-invalid={textError ? true : undefined}
            aria-describedby={
              textError ? `${counterId} ${textErrorId}` : counterId
            }
            onChange={(event) => setText(event.target.value)}
          />
          <p id={counterId} className="server-admin-report-counter">
            <span aria-hidden="true">
              {t('serverAdmin.templates.sheet.counter', {
                length: numbers.format(textLength),
                max: numbers.format(REPLY_TEMPLATE_TEXT_MAX),
              })}
            </span>
            <span className="sr-only">
              {t('serverAdmin.templates.sheet.counterLabel', {
                length: numbers.format(textLength),
                max: numbers.format(REPLY_TEMPLATE_TEXT_MAX),
              })}
            </span>
          </p>
          {textError ? (
            <p id={textErrorId} className="status status-error" role="alert">
              {textError}
            </p>
          ) : null}
          {error ? (
            <p className="status status-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="server-admin-report-dialog-actions">
            {template ? (
              <button
                type="button"
                className="server-admin-report-danger-outline"
                disabled={busy || !online}
                onClick={onDelete}
              >
                {deleting ? t('common.deleting') : t('common.delete')}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={busy || !online}>
              {pending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
