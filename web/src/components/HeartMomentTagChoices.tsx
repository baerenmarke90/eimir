import { useEffect, useState, type Ref, type ReactNode } from 'react';
import { useTranslation } from '../i18n';
import {
  ContextTagEditor,
  type ContextTagEditorHandle,
} from './ContextTagEditor';

export const HEART_MOMENT_TAGS = [
  'everyday',
  'out_together',
  'home',
  'special_day',
] as const;
export type HeartMomentTag = string;

export function HeartMomentTagChoices({
  selected = [],
  editorRef,
  parentId,
  discloseEmpty = false,
  presentation,
  renderTrigger,
  onChange,
  onDraftChange,
  disabled,
}: {
  presentation?: 'composer';
  renderTrigger?: (open: () => void) => ReactNode;
  onChange?: (tags: string[]) => void;
  onDraftChange?: (dirty: boolean) => void;
  disabled?: boolean;
  selected?: readonly string[];
  editorRef?: Ref<ContextTagEditorHandle>;
  parentId?: string;
  discloseEmpty?: boolean;
}) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<string[]>([...selected]);
  const identity = JSON.stringify(selected);
  useEffect(() => {
    setTags(JSON.parse(identity) as string[]);
  }, [identity]);
  return (
    <ContextTagEditor
      presentation={presentation}
      renderTrigger={renderTrigger}
      onDraftChange={onDraftChange}
      disabled={disabled}
      discloseEmpty={discloseEmpty}
      parentId={parentId}
      parentType="HEART_MOMENT"
      ref={editorRef}
      selected={tags}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
      suggestions={HEART_MOMENT_TAGS}
      labelForTag={(tag) =>
        (HEART_MOMENT_TAGS as readonly string[]).includes(tag)
          ? t(`heartMomentProduct.tagLabels.${tag}`)
          : tag
      }
    />
  );
}
