/**
 * Volatile hand-off of content shared into eimir. from another app (for
 * example a WhatsApp message) to the Wish editor. Nothing here is persisted and
 * nothing becomes visible to the partner: only the explicit Save in the Wish
 * editor creates or changes a Wish.
 */
export interface SharedWishDraft {
  /** Suggested Wish title taken from the shared text, never auto-saved. */
  title?: string;
  /** Remaining shared text that belongs in the description. */
  description?: string;
  /** First web link found in the shared text, already normalized. */
  linkUrl?: string;
  /** One shared photo, held until the editor starts its normal upload. */
  photo?: File;
}

/** `create` opens the Wish editor empty; `add` merges into an existing Wish. */
export type SharedWishMode = 'create' | 'add';

/** Router state carried by the navigation that opens the Wish editor. */
export interface SharedWishNavigationState {
  wishShareKey: string;
  wishShareMode: SharedWishMode;
}

let draft: { scope: string; key: string; value: SharedWishDraft } | null = null;

export function stageSharedWishDraft(
  scope: string,
  value: SharedWishDraft,
): string {
  const key = crypto.randomUUID();
  draft = { scope, key, value };
  return key;
}

/** Reads the staged draft once; a second read or a foreign scope gets null. */
export function takeSharedWishDraft(
  scope: string,
  key: string,
): SharedWishDraft | null {
  if (!draft || draft.scope !== scope || draft.key !== key) return null;
  const value = draft.value;
  draft = null;
  return value;
}

export function clearSharedWishDraft(scope: string): void {
  if (draft?.scope === scope) draft = null;
}
