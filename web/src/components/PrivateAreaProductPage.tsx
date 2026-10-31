import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import {
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
} from '../client/privateArea';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
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
import './PrivateAreaProductPage.css';
import './PrivateAreaReference.css';

const destinations = [
  {
    key: 'notes',
    icon: 'notes',
    href: PRIVATE_NOTES_PATH,
    title: 'privateArea.notes.title',
  },
  {
    key: 'gifts',
    icon: 'geschenk',
    href: PRIVATE_GIFT_IDEAS_PATH,
    title: 'privateArea.gifts.title',
  },
  {
    key: 'collections',
    icon: 'listen',
    href: PRIVATE_COLLECTIONS_PATH,
    title: 'privateArea.collections.title',
  },
] as const;

function PrivateAreaOverview() {
  const { t } = useTranslation();
  return (
    <div className="private-area-reference-overview">
      <nav
        className="private-area-destination-nav"
        aria-label={t('privateArea.navigation.aria')}
      >
        <ul>
          {destinations.map((destination) => (
            <li key={destination.key}>
              <Link
                className="private-area-destination-card"
                to={destination.href}
              >
                <span className="private-area-destination-icon">
                  <EimirIcon name={destination.icon} />
                </span>
                <span className="private-area-destination-copy">
                  <strong>{t(destination.title)}</strong>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function PrivateAreaProductPage({
  api,
  accountId,
  spaceId,
}: {
  api: PrivateAreaApi;
  accountId: string;
  spaceId: string;
}) {
  const props = { api, accountId, spaceId };
  const { pathname } = useLocation();
  const isOverview =
    pathname === '/more/private' || pathname === '/more/private/';

  return (
    <PrivateAreaFrame showNavigation={!isOverview}>
      <Routes>
        <Route index element={<PrivateAreaOverview />} />
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
