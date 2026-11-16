import {
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SharedNotesApi } from '../api/generated/apis/SharedNotesApi';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import type { SharedNotePage } from '../api/generated/models/SharedNotePage';
import {
  authorSummaryQueryKeys,
  invalidateSharedNoteConsumers,
} from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { sharedNoteApiCall } from '../client/sharedNotes';

/** One note. The overview's loaded copy seeds it so the page opens at once. */
export function useSharedNote(
  api: SharedNotesApi,
  spaceId: string,
  noteId: string | undefined,
) {
  const client = useQueryClient();
  return useQuery({
    queryKey: authorSummaryQueryKeys.sharedNoteDetail(spaceId, noteId ?? ''),
    enabled: Boolean(noteId),
    retry: false,
    queryFn: ({ signal }) =>
      sharedNoteApiCall(() =>
        api.getSharedNote({ spaceId, sharedNoteId: noteId ?? '' }, { signal }),
      ),
    initialData: () =>
      client
        .getQueryData<InfiniteData<SharedNotePage>>(
          authorSummaryQueryKeys.sharedNoteOverview(spaceId),
        )
        ?.pages.flatMap((page) => page.items)
        .find((note) => note.id === noteId),
    initialDataUpdatedAt: () =>
      client.getQueryState(authorSummaryQueryKeys.sharedNoteOverview(spaceId))
        ?.dataUpdatedAt,
  });
}

/** Pin and "title only on Wir" are idempotent state sets and need no version. */
export function useSharedNotePresentation(
  api: SharedNotesApi,
  spaceId: string,
) {
  const client = useQueryClient();
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (change: {
      noteId: string;
      pinned?: boolean;
      wirTitleOnly?: boolean;
    }) => {
      assertOnlineWrite();
      return sharedNoteApiCall(() =>
        api.setSharedNotePresentation({
          spaceId,
          sharedNoteId: change.noteId,
          sharedNotePresentation: {
            pinned: change.pinned,
            wirTitleOnly: change.wirTitleOnly,
          },
        }),
      );
    },
    onSuccess: (note: SharedNoteDetail) => {
      client.setQueryData(
        authorSummaryQueryKeys.sharedNoteDetail(spaceId, note.id),
        note,
      );
      void invalidateSharedNoteConsumers(client, spaceId);
    },
  });
}

export function useSharedNoteDelete(api: SharedNotesApi, spaceId: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (note: Pick<SharedNoteDetail, 'id' | 'version'>) => {
      assertOnlineWrite();
      await sharedNoteApiCall(() =>
        api.deleteSharedNote({
          spaceId,
          sharedNoteId: note.id,
          ifMatch: String(note.version),
        }),
      );
    },
    // The page forgets the deleted note itself once it has left it, so the
    // still-open page never flashes an error for the note it just deleted.
    onSuccess: () => {
      void invalidateSharedNoteConsumers(client, spaceId);
    },
    onError: (_error, note) => {
      // A stale version is the usual failure; the next attempt starts fresh.
      void client.invalidateQueries({
        queryKey: authorSummaryQueryKeys.sharedNoteDetail(spaceId, note.id),
      });
    },
  });
}
