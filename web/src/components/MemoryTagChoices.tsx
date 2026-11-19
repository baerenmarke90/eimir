import { useTranslation } from '../i18n';
import type { Ref, ReactNode } from 'react';
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
  presentation,
  renderTrigger,
  selected,
  onChange,
  disabled = false,
  discloseEmpty = false,
  onDraftChange,
  draftValue,
  onDraftValueChange,
  editorRef,
  parentId,
  parentType = 'MEMORY',
}: {
  presentation?: 'default' | 'composer';
  renderTrigger?: (open: () => void) => ReactNode;
  selected: readonly string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  discloseEmpty?: boolean;
  onDraftChange?: (dirty: boolean) => void;
  draftValue?: string;
  onDraftValueChange?: (value: string) => void;
  editorRef?: Ref<ContextTagEditorHandle>;
  parentId?: string;
  parentType?: 'MEMORY' | 'PLAN' | 'WISH';
}) {
  const { t } = useTranslation();
  return (
    <ContextTagEditor
      presentation={presentation}
      renderTrigger={renderTrigger}
      parentId={parentId}
      parentType={parentType}
      ref={editorRef}
      selected={selected}
      onChange={onChange}
      disabled={disabled}
      discloseEmpty={discloseEmpty}
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
