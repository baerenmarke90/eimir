import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { ContextTagEditor } from './ContextTagEditor';

export const HEART_MOMENT_TAGS = [
  'everyday',
  'out_together',
  'home',
  'special_day',
] as const;
export type HeartMomentTag = string;

export function HeartMomentTagChoices({
  selected = [],
}: {
  selected?: readonly string[];
}) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<string[]>([...selected]);
  const identity = JSON.stringify(selected);
  useEffect(() => {
    setTags(JSON.parse(identity) as string[]);
  }, [identity]);
  return (
    <ContextTagEditor
      selected={tags}
      onChange={setTags}
      suggestions={HEART_MOMENT_TAGS}
      labelForTag={(tag) =>
        (HEART_MOMENT_TAGS as readonly string[]).includes(tag)
          ? t(`heartMomentProduct.tagLabels.${tag}`)
          : tag
      }
    />
  );
}
