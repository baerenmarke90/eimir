import { useTranslation } from '../i18n';
import type { Ref } from 'react';
import {
  ContextTagEditor,
  type ContextTagEditorHandle,
} from './ContextTagEditor';

export const MEMORY_TAGS = [
  'out_together',
  'laughter',
  'home',
  'special_day',
] as const;
export type MemoryTag = string;

export function MemoryTagChoices({
  selected,
  onChange,
  disabled = false,
  onDraftChange,
  draftValue,
  onDraftValueChange,
  editorRef,
}: {
  selected: readonly string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  onDraftChange?: (dirty: boolean) => void;
  draftValue?: string;
  onDraftValueChange?: (value: string) => void;
  editorRef?: Ref<ContextTagEditorHandle>;
}) {
  const { t } = useTranslation();
  return (
    <ContextTagEditor
      ref={editorRef}
      selected={selected}
      onChange={onChange}
      disabled={disabled}
      onDraftChange={onDraftChange}
      draftValue={draftValue}
      onDraftValueChange={onDraftValueChange}
      suggestions={MEMORY_TAGS}
      labelForTag={(tag) =>
        (MEMORY_TAGS as readonly string[]).includes(tag)
          ? t(`memory.tagLabels.${tag}`)
          : tag
      }
    />
  );
}
