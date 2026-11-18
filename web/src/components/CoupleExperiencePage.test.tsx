// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { CoupleExperienceQuestionState } from '../api/generated/models/CoupleExperienceQuestionState';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import copy from '../i18n/locales/coupleExperiences';
import { CoupleExperiencePage } from './CoupleExperiencePage';

function setup(
  kind: 'happiness' | 'timeTravel',
  {
    pro = true,
    couple = true,
    saved = false,
    questionsFail = false,
    states,
    entries,
  }: {
    pro?: boolean;
    couple?: boolean;
    saved?: boolean;
    questionsFail?: boolean;
    states?: CoupleExperienceQuestionState[];
    entries?: MemoryDetail[];
  } = {},
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={[
          kind === 'happiness' ? '/story/happiness' : '/story/time-travel',
        ]}
      >
        <CoupleExperiencePage
          kind={kind}
          accountId="a"
          apiBaseUrl=""
          accessToken="test"
          spaceId="space"
          loadEntitlement={async () =>
            ({
              capabilities: pro ? ['games.couple'] : [],
            }) as SpaceEntitlementView
          }
          loadParticipants={async () =>
            couple
              ? [
                  { id: 'a', displayName: 'A' },
                  { id: 'b', displayName: 'B' },
                ]
              : null
          }
          loadHistory={async () => ({
            items: entries
              ? entries
              : saved
                ? [
                    {
                      id: 'saved',
                      body: 'A real shared note',
                      experienceKind:
                        kind === 'happiness' ? 'HAPPINESS' : 'TIME_TRAVEL',
                      author: { id: 'b', displayName: 'B' },
                      createdAt: new Date('2026-10-01'),
                    } as MemoryDetail,
                  ]
                : [],
            hasMore: false,
            nextCursor: null,
          })}
          loadQuestions={async () => {
            if (questionsFail)
              throw new Error('Questions temporarily unavailable');
            return {
              kind: kind === 'happiness' ? 'HAPPINESS' : 'TIME_TRAVEL',
              localDate: new Date('2026-11-01'),
              questionIds: Object.keys(copy.questions[kind]).slice(0, 3),
              ...(states ? { questionStates: states } : {}),
              refreshAfterSeconds: 3600,
            };
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Authored shared couple experiences', () => {
  it('retains every approved original prompt once in its daily inspiration pools', () => {
    const pools = [
      ...Object.values(copy.questions.happiness),
      ...Object.values(copy.questions.timeTravel),
    ];
    for (const original of [
      ...Object.values(copy.prompts.happiness),
      ...Object.values(copy.prompts.timeTravel),
    ]) {
      expect(pools.filter((wording) => wording === original)).toHaveLength(1);
    }
    expect(Object.values(copy.questions.timeTravel)).toContain(
      copy.prompts.happiness.fourth,
    );
  });
  it.each(['happiness', 'timeTravel'] as const)(
    'offers exactly three optional daily questions in %s',
    async (kind) => {
      setup(kind);
      const first = Object.values(copy.questions[kind])[0];
      await screen.findByRole('link', { name: first });
      const links = document.querySelectorAll('.couple-experience-questions a');
      expect(links.length).toBe(3);
      expect(links[0].getAttribute('href')).toContain(
        `?question=${Object.keys(copy.questions[kind])[0]}`,
      );
      expect(
        screen.getByRole('link', { name: copy.create[kind] }),
      ).toBeTruthy();
    },
  );
  it('keeps free writing and history available when daily inspiration fails', async () => {
    setup('happiness', { saved: true, questionsFail: true });
    expect(await screen.findByText(copy.questionsUnavailable)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: copy.create.happiness }),
    ).toBeTruthy();
    expect(screen.getByText('A real shared note')).toBeTruthy();
  });
  it.each(['happiness', 'timeTravel'] as const)(
    'opens the guarded canonical composer for %s',
    async (kind) => {
      setup(kind);
      const action = await screen.findByRole('link', {
        name: copy.create[kind],
      });
      expect(action.getAttribute('href')).toBe(
        kind === 'happiness'
          ? '/story/happiness/new'
          : '/story/time-travel/new',
      );
      expect(await screen.findByText(copy.empty[kind])).toBeTruthy();
    },
  );
  it('keeps authored history readable after losing Pro', async () => {
    setup('happiness', { pro: false, saved: true });
    expect(await screen.findByText('A real shared note')).toBeTruthy();
    expect(await screen.findByText(copy.proTitle)).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: copy.create.happiness }),
    ).toBeNull();
    expect(
      screen.getByText('A real shared note').closest('a')?.getAttribute('href'),
    ).toBe('/story/memories/saved');
  });
  it('requires a partner for a new share without hiding retained history', async () => {
    setup('timeTravel', { couple: false, saved: true });
    expect(
      await screen.findByText(copy.session.coupleRequiredTitle),
    ).toBeTruthy();
    expect(await screen.findByText('A real shared note')).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: copy.create.timeTravel }),
    ).toBeNull();
  });
  it('leads with the question the partner answered and replies in that thread', async () => {
    const [first, second, third] = Object.keys(copy.questions.happiness);
    setup('happiness', {
      states: [
        { questionId: first, answeredByMe: false, answeredByPartner: false },
        {
          questionId: second,
          memoryId: 'waiting',
          answeredByMe: false,
          answeredByPartner: true,
        },
        {
          questionId: third,
          memoryId: 'done',
          answeredByMe: true,
          answeredByPartner: true,
        },
      ],
    });
    const reply = await screen.findByRole('link', { name: copy.addOwnAnswer });
    expect(reply.getAttribute('href')).toBe(
      '/story/happiness/new?replyTo=waiting',
    );
    const focus = reply.closest('.experience-question-focus');
    expect(focus?.textContent).toContain(
      copy.questionState.partnerAnswered.replace('{{name}}', 'B'),
    );
    expect(focus?.textContent).toContain(
      copy.questions.happiness[second as keyof typeof copy.questions.happiness],
    );
    const rows = document.querySelectorAll('.couple-experience-questions li a');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('href')).toBe(
      `/story/happiness/new?question=${first}`,
    );
    expect(rows[0].textContent).toContain(copy.questionState.open);
    // The state describes the link; the question alone remains its name.
    const named = screen.getByRole('link', {
      name: copy.questions.happiness[
        first as keyof typeof copy.questions.happiness
      ],
    });
    expect(named).toBe(rows[0]);
    expect(
      document.getElementById(named.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toBe(copy.questionState.open);
    expect(rows[1].getAttribute('href')).toBe('/story/memories/done');
    expect(rows[1].textContent).toContain(copy.questionState.bothAnswered);
  });
  it('groups history by time and shows each author once with an answer prompt', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    const answer = (id: string, author: string, body: string) => ({
      id,
      body,
      author: { id: author, displayName: author.toUpperCase() },
      version: 1,
      capabilities: { canEdit: author === 'a', canDelete: author === 'a' },
    });
    setup('happiness', {
      entries: [
        {
          id: 'mine',
          title: 'What made today lovely?',
          body: '',
          experienceKind: 'HAPPINESS',
          author: { id: 'a', displayName: 'A' },
          createdAt: now,
          experienceAnswers: [answer('x', 'a', 'Our coffee.')],
        },
        {
          id: 'theirs',
          title: 'What are you grateful for?',
          body: '',
          experienceKind: 'HAPPINESS',
          author: { id: 'b', displayName: 'B' },
          createdAt: yesterday,
          experienceAnswers: [answer('y', 'b', 'Your patience.')],
        },
        {
          id: 'old',
          title: 'What made you laugh?',
          body: '',
          experienceKind: 'HAPPINESS',
          author: { id: 'b', displayName: 'B' },
          createdAt: new Date(Date.UTC(2024, 1, 10, 12)),
          experienceAnswers: [
            answer('z1', 'b', 'The dog.'),
            answer('z2', 'a', 'The dog, too.'),
          ],
        },
      ] as MemoryDetail[],
    });
    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      copy.historyGroups.today,
      copy.historyGroups.yesterday,
      expect.stringContaining('2024'),
    ]);
    // One visible name per answer; no repeated entry author above it.
    const names = [
      ...document.querySelectorAll('.couple-experience-history strong'),
    ].map((name) => name.textContent);
    expect(names).toEqual(['A', 'B', 'B', 'A']);
    expect(document.querySelector('.couple-experience-author')).toBeNull();
    const prompts = screen.getAllByRole('link', { name: copy.addOwnAnswer });
    expect(prompts.map((link) => link.getAttribute('href'))).toEqual([
      '/story/happiness/new?replyTo=theirs',
    ]);
    expect(
      screen.getByText('Our coffee.').closest('a')?.getAttribute('href'),
    ).toBe('/story/memories/mine');
    expect(document.querySelectorAll('time')).toHaveLength(1);
  });
});
