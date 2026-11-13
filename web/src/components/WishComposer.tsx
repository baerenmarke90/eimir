import {
  type FormEventHandler,
  type ReactNode,
  type Ref,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { MemoryTagChoices } from './MemoryTagChoices';
import {
  ComposerDescriptionField,
  ComposerTool,
  ComposerToolRow,
} from './PageComposer';
import { ComposerHeader } from './StoryFormPageShell';
import { TaskBackButton } from './TaskBackButton';
import './PlanningCreatePage.css';

export function WishComposer({
  wishId,
  title,
  description,
  tags,
  tagEditorRef,
  focusRef,
  disabled,
  saving,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  onTagDraftChange,
  onSubmit,
  onClose,
  children,
}: {
  wishId?: string;
  title: string;
  description: string;
  tags: readonly string[];
  tagEditorRef: Ref<ContextTagEditorHandle>;
  focusRef: Ref<HTMLDivElement>;
  disabled: boolean;
  saving: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onTagsChange: (tags: string[]) => void;
  onTagDraftChange: (dirty: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [tagToolHost, setTagToolHost] = useState<HTMLSpanElement | null>(null);
  const heading = t(wishId ? 'm5s3.common.edit' : 'm5s3.wish.createHeading');
  const idPrefix = wishId ? 'wish-edit' : 'planning-create';
  const formId = `${idPrefix}-form`;
  const saveLabel = t(saving ? 'm5s3.common.saving' : 'm5s3.common.save');

  return (
    <div className="page wish-composer free-composer quiet-composer page-composer">
      <ComposerHeader
        before={
          <TaskBackButton inline onClick={onClose} aria-disabled={disabled}>
            {t('taskBoundary.close')}
          </TaskBackButton>
        }
        title={heading}
        action={
          <button
            form={formId}
            type="submit"
            disabled={disabled || !title.trim()}
            aria-label={
              wishId && !saving ? t('m5s3.common.saveChanges') : undefined
            }
          >
            {saveLabel}
          </button>
        }
      />
      <div ref={focusRef} tabIndex={-1} className="planning-task-focus" />
      <form id={formId} className="planning-intention-form" onSubmit={onSubmit}>
        <fieldset disabled={disabled}>
          <legend className="sr-only">{heading}</legend>
          <div className="page-composer-writing">
            <label className="sr-only" htmlFor={`${idPrefix}-title`}>
              {t(wishId ? 'm5s3.common.title' : 'm5s3.wish.intentionLabel')}
            </label>
            <input
              id={`${idPrefix}-title`}
              name="title"
              className="page-composer-title"
              required
              maxLength={200}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={t('m5s3.common.title')}
            />
            <ComposerDescriptionField
              id={`${idPrefix}-description`}
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
          </div>
          <MemoryTagChoices
            presentation="composer"
            parentType="WISH"
            parentId={wishId}
            selected={tags}
            onChange={onTagsChange}
            editorRef={tagEditorRef}
            onDraftChange={onTagDraftChange}
            disabled={disabled}
            renderTrigger={(open) =>
              tagToolHost
                ? createPortal(
                    <ComposerTool
                      icon="tag"
                      label={t('composer.tag')}
                      active={Boolean(tags.length)}
                      disabled={disabled}
                      onClick={open}
                    />,
                    tagToolHost,
                  )
                : null
            }
          />
        </fieldset>
      </form>
      {saving ? (
        <p className="composer-status" role="status">
          {saveLabel}
        </p>
      ) : null}
      {children}
      <ComposerToolRow>
        <span className="composer-tool-slot" ref={setTagToolHost} />
      </ComposerToolRow>
    </div>
  );
}
