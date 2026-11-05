import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ExperienceAnswer } from '../api/generated/models/ExperienceAnswer';
import { ExperienceAnswers } from './ExperienceAnswers';

const answers: ExperienceAnswer[] = [
  {
    id: 'first',
    body: 'Our coffee together.',
    author: { id: 'a', displayName: 'Alex' },
    version: 1,
    capabilities: { canEdit: false, canDelete: false, canComment: true },
    attachments: [],
  },
  {
    id: 'second',
    body: 'Your smile this morning.',
    author: { id: 'b', displayName: 'Sam' },
    version: 1,
    capabilities: { canEdit: true, canDelete: true, canComment: true },
    attachments: [],
  },
];

describe('shared authored experience responses', () => {
  it.each(['HAPPINESS', 'TIME_TRAVEL'] as const)(
    'retains the shared label by default for %s detail and history consumers',
    (kind) => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <ExperienceAnswers kind={kind} answers={answers} />
        </MemoryRouter>,
      );
      expect(html).toContain('experience-shared-label');
      expect(html).toContain(
        kind === 'HAPPINESS' ? 'eimir-icon-highlights' : 'eimir-icon-kapitel',
      );
    },
  );

  it('renders both responses and only the capability-authorized edit link', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ExperienceAnswers kind="HAPPINESS" answers={answers} editable />
      </MemoryRouter>,
    );
    expect(html).toContain('Our coffee together.');
    expect(html).toContain('Your smile this morning.');
    expect(html).toContain('/story/memories/second/edit');
    expect(html).not.toContain('/story/memories/first/edit');
  });
  it('keeps preview cards free of nested edit links and tolerates one response', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ExperienceAnswers
          kind="HAPPINESS"
          answers={answers.slice(0, 1)}
          compact
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Our coffee together.');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('Your smile this morning.');
  });
});
