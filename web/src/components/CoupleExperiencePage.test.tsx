// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import copy from '../i18n/locales/coupleExperiences';
import { CoupleExperiencePage } from './CoupleExperiencePage';

function setup(
  kind: 'happiness' | 'timeTravel',
  { pro = true, couple = true, saved = false, questionsFail = false } = {},
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
            items: saved
              ? [
                  {
                    id: 'saved',
                    body: 'A real shared note',
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
});
