// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  RemoteWhoOfUsGame,
  RemoteWishDetectiveGame,
} from '../client/useRemoteCoupleGames';
import games from '../i18n/locales/games';
import {
  CoupleGameModes,
  RemoteWhoOfUsView,
  RemoteWishDetectiveView,
} from './RemoteCoupleGames';

const people = {
  me: { id: 'lea', displayName: 'Lea' },
  partner: { id: 'alex', displayName: 'Alex' },
};

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

const base = {
  isLoading: false,
  loadError: null,
  problem: null,
  busy: false,
  refetch: vi.fn(),
  end: vi.fn(async () => ({ ok: true as const })),
  continue: vi.fn(),
};

describe('CoupleGameModes (#2048)', () => {
  it('lets the couple choose and starts the game at a distance', async () => {
    const start = vi.fn(async () => ({ ok: true as const }));
    render(
      <CoupleGameModes
        partnerName="Alex"
        remote={{ ...base, state: { game: null }, start }}
        renderLocal={() => <p>local game</p>}
        renderRemote={() => <p>remote game</p>}
      />,
    );
    expect(
      screen.getByRole('radio', { name: new RegExp(games.playMode.apart) }),
    ).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: games.playMode.start }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it('plays on one phone without asking the server', () => {
    const start = vi.fn();
    render(
      <CoupleGameModes
        partnerName="Alex"
        remote={{ ...base, state: { game: null }, start }}
        renderLocal={() => <p>local game</p>}
        renderRemote={() => <p>remote game</p>}
      />,
    );
    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(games.playMode.together) }),
    );
    fireEvent.click(screen.getByRole('button', { name: games.playMode.start }));
    expect(screen.getByText('local game')).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it('resumes an open game at a distance without asking again', () => {
    render(
      <CoupleGameModes
        partnerName="Alex"
        remote={{
          ...base,
          state: { game: { id: 'g1', status: 'OPEN' } },
          start: vi.fn(),
        }}
        renderLocal={() => <p>local game</p>}
        renderRemote={() => <p>remote game</p>}
      />,
    );
    expect(screen.getByText('remote game')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('RemoteWhoOfUsView (#2048)', () => {
  it('answers for a person and never shows the partner answer first', () => {
    const answer = vi.fn(async () => ({ ok: true as const }));
    const question = {
      questionId: 'snack',
      myAnswer: null,
      partnerAnswered: true,
      partnerAnswer: null,
      matches: null,
    };
    const game = {
      id: 'g1',
      status: 'OPEN',
      startedBy: 'lea',
      endedBy: null,
      turnAccountId: null,
      questions: [question],
      myAnsweredCount: 0,
      partnerAnsweredCount: 1,
      revealedCount: 0,
      agreementCount: 0,
      updatedAt: new Date(),
    };
    const remote = {
      ...base,
      state: { game },
      view: { phase: 'myTurn', game, question, questionIndex: 0 },
      start: vi.fn(),
      answer,
    } as unknown as RemoteWhoOfUsGame;
    render(
      <RemoteWhoOfUsView game={remote} people={people} onNewGame={vi.fn()} />,
    );
    expect(
      screen.getByText(
        fill(games.remote.whoOfUs.partnerAnswered, { name: 'Alex' }),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Alex/ }));
    expect(answer).toHaveBeenCalledWith('snack', 'alex');
  });
});

describe('RemoteWishDetectiveView (#2048)', () => {
  it('shows the guesser only the clues and refuses an empty guess', () => {
    const guess = vi.fn(async () => ({ ok: true as const }));
    const round = {
      round: 2,
      giverId: 'alex',
      guesserId: 'lea',
      phase: 'GUESS',
      wish: null,
      skipsLeft: 3,
      clues: ['sea', 'tent', 'stars'],
    };
    const game = {
      id: 'g1',
      status: 'OPEN',
      startedBy: 'lea',
      endedBy: null,
      turnAccountId: 'lea',
      roundsTotal: 4,
      roundsPlayed: 1,
      current: round,
      revealed: [],
      scores: [],
      updatedAt: new Date(),
    };
    const remote = {
      ...base,
      state: { game, readiness: null },
      view: {
        phase: 'guess',
        game,
        round,
        clues: round.clues,
        lastRevealed: null,
      },
      missingWishes: null,
      start: vi.fn(),
      skipWish: vi.fn(),
      submitClues: vi.fn(),
      guess,
      pass: vi.fn(),
    } as unknown as RemoteWishDetectiveGame;
    render(
      <RemoteWishDetectiveView
        game={remote}
        people={people}
        onNewGame={vi.fn()}
      />,
    );
    for (const clue of round.clues) expect(screen.getByText(clue)).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: games.remote.wishDetective.guess,
    });
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.change(
      screen.getByLabelText(games.remote.wishDetective.guessLabel),
      { target: { value: 'Camping by the sea' } },
    );
    fireEvent.click(submit);
    expect(guess).toHaveBeenCalledWith('Camping by the sea');
  });
});
