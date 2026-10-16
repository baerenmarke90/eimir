import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import type { ImportantDateFields } from '../api/generated/models/ImportantDateFields';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';

export interface ImportantDateDraft {
  date: string;
  label: string;
  relatedPersonId: string;
  repeats: ImportantDateFields['repeats'];
  type: ImportantDateFields['type'];
  visibility: ImportantDateFields['visibility'];
}

export const IMPORTANT_DATE_LABEL_MAX_LENGTH = 120;

export const EMPTY_IMPORTANT_DATE_DRAFT: ImportantDateDraft = {
  date: '',
  label: '',
  relatedPersonId: '',
  repeats: DateRepeat.ANNUALLY,
  type: ImportantDateType.CUSTOM,
  visibility: ContentVisibility.SHARED,
};

export function importantDateFieldsFromDraft(
  draft: ImportantDateDraft,
): ImportantDateFields {
  const date = new Date(`${draft.date}T00:00:00.000Z`);
  return {
    date,
    label: draft.label.trim(),
    relatedPersonId: draft.relatedPersonId || null,
    repeats: draft.repeats,
    type: draft.type,
    visibility: draft.visibility,
  };
}
