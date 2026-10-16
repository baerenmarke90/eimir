import {
  memoryDateInputValue,
  memoryIfMatch,
  memoryUpdatePayload,
} from './memoryProduct';

describe('memory product helpers', () => {
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
