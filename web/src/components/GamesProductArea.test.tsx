// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { EntitlementStatus } from '../api/generated/models/EntitlementStatus';
import { EntitlementTier } from '../api/generated/models/EntitlementTier';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import {
  GAMES_MOMENTS_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
} from '../client/routes';
import * as whoOfUsSession from '../client/whoOfUsSession';
import type {
  WhoOfUsParticipant,
  WhoOfUsSession,
} from '../client/whoOfUsSession';
import games from '../i18n/locales/games';
import { GAMES_COUPLE_CAPABILITY, GamesProductArea } from './GamesProductArea';

const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANTS: readonly [WhoOfUsParticipant, WhoOfUsParticipant] = [
  { id: 'lea-id', displayName: 'Lea' },
  { id: 'alex-id', displayName: 'Alex' },
];

function entitlement(capabilities: string[]): SpaceEntitlementView {
  return {
    capabilities,
    effectiveUntil: null,
    isInGracePeriod: false,
    spaceId: SPACE_ID,
    status: capabilities.length
      ? EntitlementStatus.ACTIVE
      : EntitlementStatus.EXPIRED,
    tier: capabilities.length ? EntitlementTier.PREMIUM : EntitlementTier.FREE,
  };
}

function renderGames(
  view: SpaceEntitlementView,
  { strictMode = false }: { strictMode?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/games']}>
        <GamesProductArea
          apiBaseUrl="http://api.example.test"
          accessToken="test-token"
          spaceId={SPACE_ID}
          loadEntitlement={async () => view}
          loadPerspectiveParticipants={async () => PARTICIPANTS}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return render(strictMode ? <StrictMode>{ui}</StrictMode> : ui);
}

function expectFiveGameEntries(): void {
  expect(screen.getByText(games.entries.moments.title)).toBeTruthy();
  expect(screen.getByText(games.entries.wishes.title)).toBeTruthy();
  expect(screen.getByText(games.entries.perspective.title)).toBeTruthy();
  expect(screen.getByText(games.entries.happiness.title)).toBeTruthy();
  expect(screen.getByText(games.entries.timeTravel.title)).toBeTruthy();
}

function expectGameStatus(status: string, count: number): void {
  const matchingStatuses = [
    ...document.querySelectorAll<HTMLElement>('.games-entry-status'),
  ].filter((element) => element.textContent === status);
  expect(matchingStatuses).toHaveLength(count);
}

describe('GamesProductArea', () => {
  it('keeps the catalog discoverable for a Free Space without a page-level Premium upsell', async () => {
    renderGames(entitlement([]));

    await screen.findByText(games.entries.moments.title);
    expectFiveGameEntries();
    expectGameStatus(games.status.premium, 5);
    expect(document.querySelector('.games-access-panel')).toBeNull();
    expect(screen.queryByText('Premium ansehen')).toBeNull();
    expect(
      screen.queryByRole('link', {
        name: new RegExp(games.entries.moments.title),
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: new RegExp(games.entries.perspective.title),
      }),
    ).toBeNull();
  });

  it('opens all implemented sofa games without rendering an unlocked Premium panel', async () => {
    renderGames(entitlement([GAMES_COUPLE_CAPABILITY]));

    const momentsLink = await screen.findByRole('link', {
      name: new RegExp(games.entries.moments.title),
    });
    expectFiveGameEntries();
    expect(document.querySelector('.games-access-panel')).toBeNull();
    expectGameStatus(games.status.comingSoon, 0);
    expectGameStatus(games.status.playNow, 5);

    expect(momentsLink.textContent).toContain(games.status.playNow);
    expect(momentsLink.getAttribute('href')).toBe(GAMES_MOMENTS_ROUTE);

    const wishesLink = screen.getByRole('link', {
      name: new RegExp(games.entries.wishes.title),
    });
    expect(wishesLink.textContent).toContain(games.status.playNow);
    expect(wishesLink.getAttribute('href')).toBe(GAMES_WISH_DETECTIVE_ROUTE);

    const perspectiveButton = screen.getByRole('button', {
      name: new RegExp(games.entries.perspective.title),
    });
    expect(perspectiveButton.textContent).toContain(games.status.playNow);
  });

  it('starts the perspective game as a hidden-answer handoff flow from the hub under StrictMode', async () => {
    renderGames(entitlement([GAMES_COUPLE_CAPABILITY]), { strictMode: true });

    const perspectiveButton = await screen.findByRole('button', {
      name: new RegExp(games.entries.perspective.title),
    });
    fireEvent.click(perspectiveButton);

    await screen.findByText(games.whoOfUs.choosePrompt);
    const leaChoice = screen.getByRole('button', {
      name: games.whoOfUs.choiceAria
        .replace('{{responder}}', PARTICIPANTS[0].displayName)
        .replace('{{choice}}', PARTICIPANTS[0].displayName),
    });
    fireEvent.click(leaChoice);

    // The first DOM commit can precede useSyncExternalStore's subscription.
    await screen.findByRole('button', {
      name: games.whoOfUs.handoffConfirm.replace(
        '{{name}}',
        PARTICIPANTS[1].displayName,
      ),
    });
    expect(screen.queryByText(games.whoOfUs.choosePrompt)).toBeNull();
    expect(
      screen.getByText(
        games.whoOfUs.handoffTitle.replace(
          '{{name}}',
          PARTICIPANTS[1].displayName,
        ),
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: games.whoOfUs.handoffConfirm.replace(
          '{{name}}',
          PARTICIPANTS[1].displayName,
        ),
      }),
    );

    await screen.findByText(games.whoOfUs.choosePrompt);
    expect(
      screen.getByRole('button', {
        name: games.whoOfUs.choiceAria
          .replace('{{responder}}', PARTICIPANTS[1].displayName)
          .replace('{{choice}}', PARTICIPANTS[0].displayName),
      }),
    ).toBeTruthy();
  });

  it.each([false, true])(
    'preserves an answer at the first DOM commit and disposes the session (StrictMode=%s)',
    async (strictMode) => {
      const sessions: WhoOfUsSession[] = [];
      const createSession = whoOfUsSession.createLocalWhoOfUsSession;
      const factory = vi
        .spyOn(whoOfUsSession, 'createLocalWhoOfUsSession')
        .mockImplementation(() => {
          const session = createSession();
          vi.spyOn(session, 'dispose');
          sessions.push(session);
          return session;
        });
      let observer: MutationObserver | null = null;
      const view = renderGames(entitlement([GAMES_COUPLE_CAPABILITY]), {
        strictMode,
      });
      try {
        const start = await screen.findByRole('button', {
          name: new RegExp(games.entries.perspective.title),
        });
        let clicks = 0;
        // Exercise the real consumer before its passive subscription can run.
        observer = new MutationObserver(() => {
          const choice = screen.queryByRole('button', {
            name: games.whoOfUs.choiceAria
              .replace('{{responder}}', PARTICIPANTS[0].displayName)
              .replace('{{choice}}', PARTICIPANTS[0].displayName),
          });
          if (!choice) return;
          observer?.disconnect();
          clicks += 1;
          fireEvent.click(choice);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        fireEvent.click(start);
        await waitFor(() => expect(clicks).toBe(1));

        const session = sessions.at(-1);
        if (!session) throw new Error('The game did not create a session.');
        expect(session.dispose).not.toHaveBeenCalled();
        expect(session.getSnapshot().phase).toBe('handoff');
        expect(session.getSnapshot().reveal).toBeNull();
        expect(sessions).toHaveLength(strictMode ? 2 : 1);
        for (const replaySession of sessions.slice(0, -1)) {
          expect(replaySession.dispose).toHaveBeenCalledOnce();
        }

        const confirm = await screen.findByRole('button', {
          name: games.whoOfUs.handoffConfirm.replace(
            '{{name}}',
            PARTICIPANTS[1].displayName,
          ),
        });
        expect(screen.queryByText(games.whoOfUs.choosePrompt)).toBeNull();
        expect(document.querySelector('.who-of-us-question')).toBeNull();
        expect(document.querySelector('.who-of-us-reveal-answers')).toBeNull();
        fireEvent.click(confirm);
        const secondChoice = await screen.findByRole('button', {
          name: games.whoOfUs.choiceAria
            .replace('{{responder}}', PARTICIPANTS[1].displayName)
            .replace('{{choice}}', PARTICIPANTS[0].displayName),
        });
        expect(document.querySelector('.who-of-us-reveal-answers')).toBeNull();
        fireEvent.click(secondChoice);
        await screen.findByText(games.whoOfUs.sameTitle);
        expect(session.getSnapshot().reveal?.firstAnswerPartnerId).toBe(
          PARTICIPANTS[0].id,
        );

        view.unmount();
        for (const disposedSession of sessions) {
          expect(disposedSession.dispose).toHaveBeenCalledOnce();
          const snapshot = disposedSession.getSnapshot();
          disposedSession.dispatch({ type: 'CONTINUE' });
          disposedSession.restart();
          expect(disposedSession.getSnapshot()).toBe(snapshot);
        }
      } finally {
        observer?.disconnect();
        view.unmount();
        factory.mockRestore();
      }
    },
  );

  it('marks the reveal card with a neutral same/different outcome, never a score', async () => {
    renderGames(entitlement([GAMES_COUPLE_CAPABILITY]));

    async function answerRound(
      firstResponder: WhoOfUsParticipant,
      firstChoiceName: string,
      secondResponder: WhoOfUsParticipant,
      secondChoiceName: string,
    ): Promise<void> {
      await screen.findByText(games.whoOfUs.choosePrompt);
      fireEvent.click(
        screen.getByRole('button', {
          name: games.whoOfUs.choiceAria
            .replace('{{responder}}', firstResponder.displayName)
            .replace('{{choice}}', firstChoiceName),
        }),
      );

      fireEvent.click(
        await screen.findByRole('button', {
          name: games.whoOfUs.handoffConfirm.replace(
            '{{name}}',
            secondResponder.displayName,
          ),
        }),
      );

      await screen.findByText(games.whoOfUs.choosePrompt);
      fireEvent.click(
        screen.getByRole('button', {
          name: games.whoOfUs.choiceAria
            .replace('{{responder}}', secondResponder.displayName)
            .replace('{{choice}}', secondChoiceName),
        }),
      );
    }

    const [lea, alex] = PARTICIPANTS;

    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(games.entries.perspective.title),
      }),
    );

    // Round 1: Lea answers first. Both pick Lea -> agreement.
    await answerRound(lea, lea.displayName, alex, lea.displayName);
    await screen.findByText(games.whoOfUs.sameTitle);
    expect(
      document.querySelector('.who-of-us-reveal')?.getAttribute('data-outcome'),
    ).toBe('same');
    expect(screen.queryByText(games.whoOfUs.differentTitle)).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: games.whoOfUs.continue }),
    );

    // Round 2: responders alternate, so Alex answers first this time.
    await answerRound(alex, alex.displayName, lea, lea.displayName);
    await screen.findByText(games.whoOfUs.differentTitle);
    expect(
      document.querySelector('.who-of-us-reveal')?.getAttribute('data-outcome'),
    ).toBe('different');
    expect(screen.queryByText(games.whoOfUs.sameTitle)).toBeNull();
  });
});
