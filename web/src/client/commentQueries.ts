import type { CommentsApi } from '../api/generated/apis/CommentsApi';
import { normalizeClientError } from './problemDetails';

export type CommentParentKind = 'memory' | 'heartMoment' | 'milestone';

export function commentsQueryKey(
  spaceId: string,
  parentKind: CommentParentKind,
  parentId: string,
) {
  return ['comments', spaceId, parentKind, parentId] as const;
}

export function commentPresenceQueryKey(
  spaceId: string,
  parentKind: CommentParentKind,
  parentId: string,
) {
  return ['comment-presence', spaceId, parentKind, parentId] as const;
}

export async function listCommentsPage(
  commentsApi: CommentsApi,
  parentKind: CommentParentKind,
  spaceId: string,
  parentId: string,
  cursor: string | null,
  limit = 50,
) {
  const common = { spaceId, cursor: cursor ?? undefined, limit };
  try {
    switch (parentKind) {
      case 'memory':
        return await commentsApi.listMemoryComments({
          ...common,
          memoryId: parentId,
        });
      case 'heartMoment':
        return await commentsApi.listHeartMomentComments({
          ...common,
          heartMomentId: parentId,
        });
      case 'milestone':
        return await commentsApi.listMilestoneComments({
          ...common,
          milestoneId: parentId,
        });
    }
  } catch (error) {
    throw await normalizeClientError(error);
  }
}
