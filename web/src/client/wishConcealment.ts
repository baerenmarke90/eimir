import type { WishDetail } from '../api/generated/models/WishDetail';

/**
 * #2158 H: the server hides a partner's Wish from the reader while it may
 * still be the answer of an open Wish detective game. The placeholder keeps
 * its place and creator but carries no title, description or tags.
 */
export function isHiddenDuringGame(
  wish: Pick<WishDetail, 'hiddenDuringGame'>,
): boolean {
  return wish.hiddenDuringGame === true;
}

/** Pickers offer only Wishes the reader may see and act on. */
export function withoutHiddenWishes<
  T extends Pick<WishDetail, 'hiddenDuringGame'>,
>(wishes: readonly T[]): T[] {
  return wishes.filter((wish) => !isHiddenDuringGame(wish));
}
