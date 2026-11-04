import { i18n } from '../i18n';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SharedExperienceReveal } from './SharedExperienceReveal';
import type { DashboardExperience } from '../api/generated/models/DashboardExperience';
import copy from '../i18n/locales/coupleExperiences';

afterEach(cleanup);

it.each(['HAPPINESS', 'TIME_TRAVEL'] as const)(
  'keeps the original %s prompt, answer, author, date and canonical destination together',
  (kind) => {
    const entry: DashboardExperience = {
      id: `shared-${kind}`,
      kind,
      prompt: 'Which part of the morning stayed with you?',
      text:
        kind === 'TIME_TRAVEL'
          ? 'Waking up beside you. '.repeat(10).trim()
          : 'Waking up beside you.',
      authorId: 'partner',
      happenedOn: new Date('2026-11-04T00:00:00Z'),
      createdAt: new Date(Date.now() + 60_000),
    };
    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <SharedExperienceReveal
                entry={entry}
                partnerName="Ben"
                scope={['test', kind]}
              />
            }
          />
          <Route
            path={`/story/memories/${entry.id}`}
            element={<h1>Original moment</h1>}
          />
        </Routes>
      </MemoryRouter>,
    );
    const question = screen.getByText(entry.prompt as string);
    const answer = screen.getByText(entry.text);
    expect(
      question.compareDocumentPosition(answer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(
        i18n.t('coupleExperiences.incoming.from', { name: 'Ben' }),
      ),
    ).toBeTruthy();
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-11-04',
    );
    expect(container.querySelector('.moment-date svg')).not.toBeNull();
    const open = screen.getByRole('link', { name: copy.incoming.open });
    expect(open.getAttribute('href')).toBe(`/story/memories/${entry.id}`);
    fireEvent.click(open);
    expect(
      screen.getByRole('heading', { name: 'Original moment' }),
    ).toBeTruthy();
  },
);

it.each(['HAPPINESS', 'TIME_TRAVEL'] as const)(
  'uses truthful %s context for an older projection without a prompt',
  (kind) => {
    render(
      <MemoryRouter>
        <SharedExperienceReveal
          partnerName="Ben"
          entry={{
            id: `legacy-${kind}`,
            kind,
            text: 'An authored thought.',
            authorId: 'partner',
            happenedOn: null,
            createdAt: new Date(Date.now() + 60_000),
          }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        kind === 'HAPPINESS' ? copy.sharedHappiness : copy.sharedTimeTravel,
      ),
    ).toBeTruthy();
    expect(screen.getByText('An authored thought.')).toBeTruthy();
  },
);
