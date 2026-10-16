import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import {
  EMPTY_IMPORTANT_DATE_DRAFT,
  importantDateFieldsFromDraft,
} from './importantDateDraft';

describe('ImportantDate form mapping', () => {
  it('uses safe product defaults for a new date', () => {
    expect(EMPTY_IMPORTANT_DATE_DRAFT).toEqual({
      date: '',
      label: '',
      relatedPersonId: '',
      repeats: DateRepeat.ANNUALLY,
      type: ImportantDateType.CUSTOM,
      visibility: ContentVisibility.SHARED,
    });
  });

  it('maps a linked date to the generated contract', () => {
    const fields = importantDateFieldsFromDraft({
      date: '2026-10-12',
      label: '  Contract fixture  ',
      relatedPersonId: 'person-1',
      repeats: DateRepeat.NONE,
      type: ImportantDateType.ANNIVERSARY,
      visibility: ContentVisibility.PRIVATE,
    });

    expect(fields).toEqual({
      date: new Date('2026-10-12T00:00:00.000Z'),
      label: 'Contract fixture',
      relatedPersonId: 'person-1',
      repeats: DateRepeat.NONE,
      type: ImportantDateType.ANNIVERSARY,
      visibility: ContentVisibility.PRIVATE,
    });
  });

  it('maps an unlinked date to null rather than inventing a person id', () => {
    const fields = importantDateFieldsFromDraft({
      ...EMPTY_IMPORTANT_DATE_DRAFT,
      date: '2026-11-01',
      label: 'Fixture',
    });

    expect(fields.relatedPersonId).toBeNull();
    expect(fields.date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
