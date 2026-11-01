// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import copy from '../i18n/locales/coupleExperiences';
import { COUPLE_EXPERIENCE_PROMPT_IDS } from '../client/coupleExperiencePrompts';
import { CoupleExperiencePage } from './CoupleExperiencePage';

function setup(
  kind: 'happiness' | 'timeTravel',
  { pro = true, couple = true, saved = false } = {},
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
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Authored shared couple experiences', () => {
  it.each(['happiness', 'timeTravel'] as const)(
    'retains all six %s prompts and links each answer to its canonical composer',
    async (kind) => {
      setup(kind);
      await screen.findByRole('link', { name: copy.prompts.answer });
      for (const id of COUPLE_EXPERIENCE_PROMPT_IDS) {
        expect(
          screen.getByRole('heading', { name: copy.prompts[kind][id] }),
        ).toBeTruthy();
        expect(
          screen
            .getByRole('link', { name: copy.prompts.answer })
            .getAttribute('href'),
        ).toBe(
          `${kind === 'happiness' ? '/story/happiness' : '/story/time-travel'}/new?prompt=${id}`,
        );
        fireEvent.click(
          screen.getByRole('button', { name: copy.prompts.next }),
        );
      }
      expect(
        screen.getByRole('heading', { name: copy.prompts[kind].first }),
      ).toBeTruthy();
    },
  );
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
      screen.queryByRole('link', { name: copy.prompts.answer }),
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
