import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  normalizeWishLink,
  safeWishLink,
  type WishLinkInvalidReason,
  wishLinkHost,
} from '../client/wishLinkPhoto';
import { useTranslation } from '../i18n';
import { ComposerChip, ComposerTool } from './PageComposer';
import { ShortTaskSheet } from './ShortTaskSheet';
import './WishLinkPhoto.css';

/**
 * The one optional link of a Wish inside its editor: a tool in the tool row, a
 * chip showing the host once a link is set, and a small sheet to paste, change
 * or remove it. The address is normalized on the device; it is never fetched.
 */
export function WishLinkEditor({
  value,
  onChange,
  toolHost,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  toolHost: HTMLElement | null;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<WishLinkInvalidReason | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const safeValue = safeWishLink(value);
  const host = safeValue ? wishLinkHost(safeValue) : null;

  function openSheet() {
    setText(value ?? '');
    setProblem(null);
    setOpen(true);
  }

  // Focus the field once the sheet is on screen.
  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);

  function normalizeField(): boolean {
    const result = normalizeWishLink(text);
    if (result.kind === 'valid') {
      setText(result.url);
      setProblem(null);
      return true;
    }
    if (result.kind === 'empty') {
      setProblem(null);
      return true;
    }
    setProblem(result.reason);
    return false;
  }

  function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = normalizeWishLink(text);
    if (result.kind === 'invalid') {
      setProblem(result.reason);
      input.current?.focus();
      return;
    }
    onChange(result.kind === 'valid' ? result.url : null);
    setOpen(false);
  }

  function remove() {
    onChange(null);
    setOpen(false);
  }

  const tool = (
    <ComposerTool
      ref={trigger}
      icon="link"
      label={t('m5s3.wish.link.tool')}
      active={Boolean(value)}
      disabled={disabled}
      onClick={openSheet}
    />
  );
  return (
    <>
      {toolHost ? createPortal(tool, toolHost) : null}
      {host ? (
        <div className="composer-selected-chips wish-link-chips">
          <ComposerChip
            icon="link"
            disabled={disabled}
            aria-label={t('m5s3.wish.link.editNamed', { host })}
            onClick={openSheet}
          >
            {host}
          </ComposerChip>
        </div>
      ) : null}
      <ShortTaskSheet
        open={open}
        title={t('m5s3.wish.link.sheetTitle')}
        restoreFocusRef={trigger}
        initialFocusRef={input}
        onClose={() => setOpen(false)}
      >
        <form className="form-grid wish-link-form" onSubmit={commit} noValidate>
          <label htmlFor={fieldId}>{t('m5s3.wish.link.label')}</label>
          <input
            ref={input}
            id={fieldId}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4096}
            value={text}
            placeholder={t('m5s3.wish.link.placeholder')}
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${fieldId}-help${problem ? ` ${fieldId}-error` : ''}`}
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
            onBlur={normalizeField}
          />
          <p id={`${fieldId}-help`} className="field-help">
            {t('m5s3.wish.link.help')}
          </p>
          {problem ? (
            <p id={`${fieldId}-error`} className="wish-link-error" role="alert">
              {t(`m5s3.wish.link.invalid.${problem}`)}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit">{t('m5s3.wish.link.done')}</button>
            {value ? (
              <button type="button" className="tertiary" onClick={remove}>
                {t('m5s3.wish.link.remove')}
              </button>
            ) : null}
          </div>
        </form>
      </ShortTaskSheet>
    </>
  );
}
