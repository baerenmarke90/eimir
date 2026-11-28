/**
 * #2158 H: while a Wish detective game is open, the partner's wishes that may
 * still be the answer stay hidden from the one who guesses. The server sends
 * only a placeholder; this copy names the game, never the wish.
 */
const wishConcealment = {
  groupTitle: 'Im Wunschdetektiv',
  groupIntro:
    'Diese Wünsche bleiben verdeckt, bis euer Spiel vorbei ist. So bleibt das Raten fair.',
  rowTitle: 'Ein Wunsch von {{name}}',
  rowHint: 'Wird nach dem Spiel enthüllt',
  toGame: 'Zum Spiel',
  detailEyebrow: 'Im Wunschdetektiv',
  detailTitle: 'Dieser Wunsch spielt gerade mit',
  detailBody:
    'Er ist Teil eures Wunschdetektiv-Spiels. Damit das Raten fair bleibt, siehst du ihn, sobald {{name}} ihn im Spiel verraten hat oder das Spiel vorbei ist.',
  linkedTitle: 'Verdeckter Wunsch',
};

export default wishConcealment;
