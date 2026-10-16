import {
  birthdayFromInput,
  birthdayInputParts,
  daysInMonth,
} from './relatedPersonBirthday';

describe('related-person birthday mapping', () => {
  it('keeps a known birthday as the exact submitted date', () => {
    expect(
      birthdayFromInput({
        yearKnown: true,
        dateValue: '1998-05-24',
        monthValue: '',
        dayValue: '',
      })?.toISOString(),
    ).toBe('1998-05-24T00:00:00.000Z');
  });

  it('maps an unknown-year birthday from month and day without using the server placeholder', () => {
    const value = birthdayFromInput({
      yearKnown: false,
      dateValue: '',
      monthValue: '2',
      dayValue: '29',
    });

    expect(value?.getUTCMonth()).toBe(1);
    expect(value?.getUTCDate()).toBe(29);
    expect(value?.getUTCFullYear()).not.toBe(1904);
  });

  it('extracts only month and day from an existing unknown-year value', () => {
    expect(birthdayInputParts(new Date('1904-11-07T00:00:00.000Z'))).toEqual({
      monthValue: '11',
      dayValue: '7',
    });
  });

  it('supports February 29 and rejects impossible day ranges', () => {
    expect(daysInMonth(2)).toBe(29);
    expect(
      birthdayFromInput({
        yearKnown: false,
        dateValue: '',
        monthValue: '2',
        dayValue: '30',
      }),
    ).toBeNull();
  });
});
