import { expect, it } from 'vitest';
import { sortByProductLabel } from './productLabelOrder';

it('orders a combined selection naturally in its active locale without mutating cached pages', () => {
  const firstPage = [{ title: 'Zoo' }, { title: 'Ausflug 10' }];
  const secondPage = [{ title: 'Äpfel' }, { title: 'ausflug 2' }];
  expect(
    sortByProductLabel(
      [...firstPage, ...secondPage],
      (item) => item.title,
      'de-DE',
    ).map((item) => item.title),
  ).toEqual(['Äpfel', 'ausflug 2', 'Ausflug 10', 'Zoo']);
  expect(firstPage.map((item) => item.title)).toEqual(['Zoo', 'Ausflug 10']);
});
