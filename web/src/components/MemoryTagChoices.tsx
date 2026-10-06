import { useTranslation } from '../i18n';
import { ContextTagEditor } from './ContextTagEditor';

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
}: {
  selected: readonly string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  onDraftChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <ContextTagEditor
      selected={selected}
      onChange={onChange}
      disabled={disabled}
      onDraftChange={onDraftChange}
      suggestions={MEMORY_TAGS}
      labelForTag={(tag) =>
        (MEMORY_TAGS as readonly string[]).includes(tag)
          ? t(`memory.tagLabels.${tag}`)
          : tag
      }
    />
  );
}
