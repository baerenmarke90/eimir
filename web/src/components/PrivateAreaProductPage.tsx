import {
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { ProfilesApi } from '../client/mediaApis';
import {
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
} from '../client/privateArea';
import {
  GiftIdeaCreatePage,
  GiftIdeaDetailPage,
  GiftIdeaEditPage,
  GiftIdeasListPage,
} from './GiftIdeasPage';
import { PrivateAreaFrame } from './PrivateAreaLayout';
import {
  PrivateCollectionCreatePage,
  PrivateCollectionDetailPage,
  PrivateCollectionEditPage,
  PrivateCollectionsListPage,
} from './PrivateCollectionsPage';
import {
  PrivateNoteCreatePage,
  PrivateNoteDetailPage,
  PrivateNoteEditPage,
  PrivateNotesListPage,
} from './PrivateNotesPage';
import { PrivatePartnerNotesPage } from './PrivatePartnerNotesPage';
import './PrivateAreaProductPage.css';
import './PrivateAreaReference.css';

export function PrivateAreaProductPage({
  api,
  accountId,
  spaceId,
  profilesApi,
  spacesApi,
}: {
  api: PrivateAreaApi;
  accountId: string;
  spaceId: string;
  profilesApi?: ProfilesApi;
  spacesApi?: SpacesApi;
}) {
  const props = { api, accountId, spaceId };
  const { pathname } = useLocation();
  const isGiftEditor = Boolean(
    matchPath(`${PRIVATE_GIFT_IDEAS_PATH}/new`, pathname) ||
      matchPath(`${PRIVATE_GIFT_IDEAS_PATH}/:giftIdeaId/edit`, pathname),
  );

  // One note, list or gift idea, including its editor, leads with its own
  // header row; the area card and tabs belong to the lists (#1907 C4).
  const isItem =
    !isGiftEditor &&
    [
      `${PRIVATE_NOTES_PATH}/:noteId`,
      `${PRIVATE_NOTES_PATH}/:noteId/edit`,
      `${PRIVATE_COLLECTIONS_PATH}/:collectionId`,
      `${PRIVATE_COLLECTIONS_PATH}/:collectionId/edit`,
      `${PRIVATE_GIFT_IDEAS_PATH}/:giftIdeaId`,
    ].some((pattern) => matchPath(pattern, pathname));

  return (
    <PrivateAreaFrame editorFirst={isGiftEditor} itemFirst={isItem}>
      <Routes>
        {/* The chips below the header are the only way between sections, so
            the area opens on the first one instead of a second picker. */}
        <Route index element={<Navigate replace to="notes" />} />
        {profilesApi && spacesApi ? (
          <Route
            path="partner-notes"
            element={
              <PrivatePartnerNotesPage
                profilesApi={profilesApi}
                spacesApi={spacesApi}
                accountId={accountId}
                spaceId={spaceId}
              />
            }
          />
        ) : null}
        <Route path="notes" element={<PrivateNotesListPage {...props} />} />
        <Route
          path="notes/new"
          element={<PrivateNoteCreatePage {...props} />}
        />
        <Route
          path="notes/:noteId/edit"
          element={<PrivateNoteEditPage {...props} />}
        />
        <Route
          path="notes/:noteId"
          element={<PrivateNoteDetailPage {...props} />}
        />
        <Route path="gift-ideas" element={<GiftIdeasListPage {...props} />} />
        <Route
          path="gift-ideas/new"
          element={<GiftIdeaCreatePage {...props} />}
        />
        <Route
          path="gift-ideas/:giftIdeaId/edit"
          element={<GiftIdeaEditPage {...props} />}
        />
        <Route
          path="gift-ideas/:giftIdeaId"
          element={<GiftIdeaDetailPage {...props} />}
        />
        <Route
          path="collections"
          element={<PrivateCollectionsListPage {...props} />}
        />
        <Route
          path="collections/new"
          element={<PrivateCollectionCreatePage {...props} />}
        />
        <Route
          path="collections/:collectionId/edit"
          element={<PrivateCollectionEditPage {...props} />}
        />
        <Route
          path="collections/:collectionId"
          element={<PrivateCollectionDetailPage {...props} />}
        />
        <Route path="*" element={<Navigate replace to="notes" />} />
      </Routes>
    </PrivateAreaFrame>
  );
}
