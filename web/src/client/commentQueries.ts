import type { CommentsApi } from '../api/generated/apis/CommentsApi';

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

export function listCommentsPage(
  commentsApi: CommentsApi,
  parentKind: CommentParentKind,
  spaceId: string,
  parentId: string,
  cursor: string | null,
  limit = 50,
) {
  const common = { spaceId, cursor: cursor ?? undefined, limit };
  switch (parentKind) {
    case 'memory':
      return commentsApi.listMemoryComments({
        ...common,
        memoryId: parentId,
      });
    case 'heartMoment':
      return commentsApi.listHeartMomentComments({
        ...common,
        heartMomentId: parentId,
      });
    case 'milestone':
      return commentsApi.listMilestoneComments({
        ...common,
        milestoneId: parentId,
      });
  }
}
