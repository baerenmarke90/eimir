import {
  memoryDateInputValue,
  memoryIfMatch,
  memoryPreviewTitle,
  memoryUpdatePayload,
} from './memoryProduct';
import { i18n } from '../i18n';

describe('memory product helpers', () => {
  it('uses one readable date for empty and generated titles while preserving authored titles', () => {
    const date = new Date('2026-10-26T00:00:00Z');
    for (const title of ['', '  ', 'Erinnerung vom 26.10.2026']) {
      expect(memoryPreviewTitle(title, date, i18n.t)).toEqual({
        title: '26. Oktober 2026',
        titleIsDate: true,
      });
    }
    expect(memoryPreviewTitle('Unser Ausflug', date, i18n.t)).toEqual({
      title: 'Unser Ausflug',
      titleIsDate: false,
    });
    expect(memoryPreviewTitle('Erinnerung vom Meer', date, i18n.t).title).toBe(
      'Erinnerung vom Meer',
    );
    expect(memoryPreviewTitle('', null, i18n.t)).toEqual({
      title: i18n.t('story.kind.memory'),
      titleIsDate: false,
    });
  });
  it('keeps date-only values stable for edit inputs', () => {
    expect(memoryDateInputValue(new Date('2026-08-30T00:00:00.000Z'))).toBe(
      '2026-08-30',
    );
    expect(memoryDateInputValue(null)).toBe('');
  });

  it('builds an update payload that can also clear happenedOn', () => {
    expect(
      memoryUpdatePayload({
        title: 'At the lake',
        body: 'A good day',
        happenedOn: '2026-08-30',
        tags: ['home'],
      }),
    ).toEqual({
      title: 'At the lake',
      body: 'A good day',
      happenedOn: new Date('2026-08-30T00:00:00.000Z'),
      tags: ['home'],
    });

    expect(
      memoryUpdatePayload({
        title: 'At the lake',
        body: '',
        happenedOn: '',
        tags: [],
      }),
    ).toEqual({ title: 'At the lake', body: '', happenedOn: null, tags: [] });
  });

  it('uses the observed resource version as If-Match value', () => {
    expect(memoryIfMatch({ version: 7 })).toBe('7');
  });
});
