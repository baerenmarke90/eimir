// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import games from '../i18n/locales/games';
import type { WishDetectiveGameSetup } from './WishDetectiveGamePage';
import { WishDetectiveGamePage } from './WishDetectiveGamePage';

const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const SECRET_WISH_TITLE = 'Stargazing in the garden';

function localized(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

function playableSetup(): WishDetectiveGameSetup {
  return {
    participants: [
      { id: 'lea', displayName: 'Lea' },
      { id: 'alex', displayName: 'Alex' },
    ],
    rounds: [
      { wishId: 'l1', createdBy: 'lea', title: SECRET_WISH_TITLE },
      { wishId: 'a1', createdBy: 'alex', title: 'Weekend by the sea' },
      { wishId: 'l2', createdBy: 'lea', title: 'Picnic by the lake' },
      { wishId: 'a2', createdBy: 'alex', title: 'Concert in Berlin' },
    ],
  };
}

function renderPage(setup: WishDetectiveGameSetup) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/games/wish-detective']}>
          <WishDetectiveGamePage
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            spaceId={SPACE_ID}
            currentAccountId="lea"
            loadSetup={async () => setup}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('WishDetectiveGamePage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('keeps the wish visible during clue entry and hides it for handoff and guessing', async () => {
    renderPage(playableSetup());

    await screen.findByRole('heading', {
      name: games.entries.wishes.title,
      level: 1,
    });
    expect(await screen.findByText(SECRET_WISH_TITLE)).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 1 }),
      ),
      { target: { value: 'Night' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 2 }),
      ),
      { target: { value: 'Blanket' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 3 }),
      ),
      { target: { value: 'Warm' } },
    );

    expect(screen.getByText(SECRET_WISH_TITLE)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: games.wishDetective.startHandoff,
      }),
    );

    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
    expect(
      screen.getByRole('heading', {
        name: localized(games.wishDetective.handoffTitle, { name: 'Alex' }),
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: localized(games.wishDetective.handoffConfirm, { name: 'Alex' }),
      }),
    );
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
    expect(screen.getByText('Night')).toBeTruthy();
    expect(screen.getByText('Blanket')).toBeTruthy();
    expect(screen.getByText('Warm')).toBeTruthy();
    expect(
      screen.getByLabelText(
        localized(games.wishDetective.guessLabel, { name: 'Lea' }),
      ),
    ).toBeTruthy();
  });

  it('does not reveal the secret when a hidden phase is remounted', async () => {
    const firstRender = renderPage(playableSetup());
    await screen.findByText(SECRET_WISH_TITLE);

    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 1 }),
      ),
      { target: { value: 'Night' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 2 }),
      ),
      { target: { value: 'Blanket' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 3 }),
      ),
      { target: { value: 'Warm' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: games.wishDetective.startHandoff,
      }),
    );
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();

    firstRender.unmount();
    renderPage(playableSetup());

    await screen.findByRole('heading', {
      name: games.wishDetective.interruptedTitle,
      level: 2,
    });
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
    expect(
      screen
        .getByRole('link', { name: games.wishDetective.backToGames })
        .getAttribute('href'),
    ).toBe('/games');
  });

  it('shows validation feedback instead of silently accepting invalid clues', async () => {
    renderPage(playableSetup());
    await screen.findByText(SECRET_WISH_TITLE);

    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 1 }),
      ),
      { target: { value: 'romantic evening' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 2 }),
      ),
      { target: { value: 'garden' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 3 }),
      ),
      { target: { value: 'garden' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: games.wishDetective.startHandoff,
      }),
    );

    expect(screen.getByText(games.wishDetective.errors.oneWord)).toBeTruthy();
    expect(
      screen.getAllByText(games.wishDetective.errors.duplicate),
    ).toHaveLength(2);
    expect(screen.getByText(SECRET_WISH_TITLE)).toBeTruthy();
  });

  it('shows the sparse state without exposing hidden candidate totals', async () => {
    const setup = playableSetup();
    renderPage({ participants: setup.participants, rounds: [] });

    await screen.findByRole('heading', {
      name: games.wishDetective.sparseTitle,
      level: 2,
    });
    const wishesLink = screen.getByRole('link', {
      name: games.wishDetective.sparseAction,
    });
    expect(wishesLink.getAttribute('href')).toBe('/plan/wishes/new');
  });

  it('does not start when the active Space is not a two-partner couple', async () => {
    renderPage({ participants: null, rounds: [] });

    await screen.findByText(games.wishDetective.coupleRequiredTitle);
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
  });
});
