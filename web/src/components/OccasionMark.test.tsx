// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import type { OccasionMatch } from '../client/occasionMatches';
import { i18n } from '../i18n';
import germanMarks from '../i18n/locales/occasionMarks';
import { OccasionMark } from './OccasionMark';

afterEach(() => {
  cleanup();
});

const anniversary = (years: number): OccasionMatch => ({
  kind: 'relationship',
  key: 'relationship',
  years,
});
const partnerBirthday: OccasionMatch = {
  kind: 'birthday',
  key: 'birthday:partner',
  accountId: 'partner',
  displayName: 'Alex',
  isViewer: false,
};
const ownBirthday: OccasionMatch = {
  kind: 'birthday',
  key: 'birthday:viewer',
  accountId: 'viewer',
  displayName: 'Lea',
  isViewer: true,
};
const de = {
  anniversary3: germanMarks.anniversary_ordinal_other.replace('{{count}}', '3'),
  firstDay: germanMarks.relationshipStart,
  ownBirthday: germanMarks.ownBirthday,
  alexBirthday: germanMarks.partnerBirthday.replace('{{name}}', 'Alex'),
  moreOne: germanMarks.more_one,
  moreTwo: germanMarks.more_other.replace('{{count}}', '2'),
};
const custom = (label: string): OccasionMatch => ({
  kind: 'custom',
  key: `date:${label}`,
  label,
  type: 'CUSTOM',
});

async function switchLanguage(language: string) {
  const previous = i18n.language;
  onTestFinished(async () => {
    await i18n.changeLanguage(previous);
  });
  await i18n.changeLanguage(language);
}

describe('OccasionMark (#1907 F2)', () => {
  it('renders nothing without an occasion', () => {
    const { container } = render(<OccasionMark matches={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('names the anniversary with a German ordinal and the first day', async () => {
    await switchLanguage('de');
    const { rerender } = render(
      <OccasionMark id="mark" matches={[anniversary(3)]} />,
    );
    expect(screen.getByText(de.anniversary3)).toBeTruthy();
    rerender(<OccasionMark id="mark" matches={[anniversary(0)]} />);
    expect(screen.getByText(de.firstDay)).toBeTruthy();
  });

  it('uses English ordinal suffixes', async () => {
    await switchLanguage('en');
    const { rerender } = render(<OccasionMark matches={[anniversary(1)]} />);
    expect(screen.getByText('On your 1st anniversary')).toBeTruthy();
    for (const [years, text] of [
      [2, 'On your 2nd anniversary'],
      [3, 'On your 3rd anniversary'],
      [11, 'On your 11th anniversary'],
      [22, 'On your 22nd anniversary'],
    ] as const) {
      rerender(<OccasionMark matches={[anniversary(years)]} />);
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('distinguishes the viewer’s and the partner’s birthday', async () => {
    await switchLanguage('de');
    const { rerender } = render(<OccasionMark matches={[ownBirthday]} />);
    expect(screen.getByText(de.ownBirthday)).toBeTruthy();
    rerender(<OccasionMark matches={[partnerBirthday]} />);
    expect(screen.getByText(de.alexBirthday)).toBeTruthy();
  });

  it('joins two occasions and counts the rest', async () => {
    await switchLanguage('de');
    const { container, rerender } = render(
      <OccasionMark matches={[anniversary(3), custom('Move')]} />,
    );
    expect(container.textContent).toContain(`${de.anniversary3} · Move`);
    rerender(
      <OccasionMark
        matches={[
          anniversary(3),
          partnerBirthday,
          custom('Move'),
          custom('Graduation'),
        ]}
      />,
    );
    expect(container.textContent).toContain(
      `${de.anniversary3} · ${de.alexBirthday} ${de.moreTwo}`,
    );
    rerender(
      <OccasionMark
        matches={[anniversary(3), partnerBirthday, custom('Move')]}
      />,
    );
    expect(container.textContent).toContain(de.moreOne);
  });

  it('keeps the icon decorative so the text is the accessible meaning', async () => {
    await switchLanguage('de');
    const { container } = render(
      <OccasionMark id="mark" matches={[anniversary(3)]} />,
    );
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.querySelector('#mark')?.textContent).toBe(de.anniversary3);
  });
});
