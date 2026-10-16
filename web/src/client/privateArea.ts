import { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import { Configuration } from '../api/generated/runtime';
import { normalizeClientError } from './problemDetails';

export const PRIVATE_AREA_ROOT_PATH = '/more/private';
export const PRIVATE_NOTES_PATH = '/more/private/notes';
export const PRIVATE_GIFT_IDEAS_PATH = '/more/private/gift-ideas';
export const PRIVATE_COLLECTIONS_PATH = '/more/private/collections';

export function createPrivateAreaApi(
  apiBaseUrl: string,
  accessToken: string,
): PrivateAreaApi {
  const configuration = new Configuration({
    basePath: apiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return new PrivateAreaApi(configuration);
}

export async function privateApiCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export const privateAreaQueryKeys = {
  root(accountId: string, spaceId: string) {
    return ['m5-s4-private', accountId, spaceId, 'owner', accountId] as const;
  },
  notes(accountId: string, spaceId: string) {
    return [...this.root(accountId, spaceId), 'notes'] as const;
  },
  note(accountId: string, spaceId: string, noteId: string) {
    return [...this.notes(accountId, spaceId), noteId] as const;
  },
  giftIdeas(accountId: string, spaceId: string) {
    return [...this.root(accountId, spaceId), 'gift-ideas'] as const;
  },
  giftIdea(accountId: string, spaceId: string, giftIdeaId: string) {
    return [...this.giftIdeas(accountId, spaceId), giftIdeaId] as const;
  },
  collections(accountId: string, spaceId: string) {
    return [...this.root(accountId, spaceId), 'collections'] as const;
  },
  collection(accountId: string, spaceId: string, collectionId: string) {
    return [...this.collections(accountId, spaceId), collectionId] as const;
  },
};

export function privateNotePath(noteId: string): string {
  return `${PRIVATE_NOTES_PATH}/${encodeURIComponent(noteId)}`;
}

export function privateNoteEditPath(noteId: string): string {
  return `${privateNotePath(noteId)}/edit`;
}

export function privateGiftIdeaPath(giftIdeaId: string): string {
  return `${PRIVATE_GIFT_IDEAS_PATH}/${encodeURIComponent(giftIdeaId)}`;
}

export function privateGiftIdeaEditPath(giftIdeaId: string): string {
  return `${privateGiftIdeaPath(giftIdeaId)}/edit`;
}

export function privateCollectionPath(collectionId: string): string {
  return `${PRIVATE_COLLECTIONS_PATH}/${encodeURIComponent(collectionId)}`;
}

export function privateCollectionEditPath(collectionId: string): string {
  return `${privateCollectionPath(collectionId)}/edit`;
}

export function movePrivateCollectionItem(
  itemIds: readonly string[],
  itemId: string,
  direction: -1 | 1,
): string[] {
  const currentIndex = itemIds.indexOf(itemId);
  if (currentIndex < 0) return [...itemIds];
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= itemIds.length) return [...itemIds];
  const reordered = [...itemIds];
  [reordered[currentIndex], reordered[nextIndex]] = [
    reordered[nextIndex],
    reordered[currentIndex],
  ];
  return reordered;
}
