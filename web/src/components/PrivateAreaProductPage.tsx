import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import {
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
} from '../client/privateArea';
import { useTranslation } from '../i18n';
import {
  GiftIdeaCreatePage,
  GiftIdeaDetailPage,
  GiftIdeaEditPage,
  GiftIdeasListPage,
} from './GiftIdeasPage';
import {
  PrivateCollectionCreatePage,
  PrivateCollectionDetailPage,
  PrivateCollectionEditPage,
  PrivateCollectionsListPage,
} from './PrivateCollectionsPage';
import { PrivateAreaBackToMore, PrivateAreaFrame } from './PrivateAreaLayout';
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
    href: PRIVATE_NOTES_PATH,
    title: 'privateArea.notes.title',
    intro: 'privateArea.notes.intro',
  },
  {
    key: 'gifts',
    href: PRIVATE_GIFT_IDEAS_PATH,
    title: 'privateArea.gifts.title',
    intro: 'privateArea.gifts.intro',
  },
  {
    key: 'collections',
    href: PRIVATE_COLLECTIONS_PATH,
    title: 'privateArea.collections.title',
    intro: 'privateArea.collections.intro',
  },
] as const;

function DestinationIcon({
  kind,
}: {
  kind: (typeof destinations)[number]['key'];
}) {
  if (kind === 'gifts') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 12v9H4v-9M2 7h20v5H2V7Zm10 14V7m0 0H8.5A2.5 2.5 0 1 1 11 4.5L12 7Zm0 0h3.5A2.5 2.5 0 1 0-2.5-2.5L12 7Z" />
      </svg>
    );
  }
  if (kind === 'collections') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5" />
    </svg>
  );
}

function PrivateAreaOverview() {
  const { t } = useTranslation();
  return (
    <div className="private-area-reference-overview">
      <PrivateAreaBackToMore />
      <section className="private-area-privacy-banner" role="note">
        <span className="private-area-privacy-banner-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V7Z" />
          </svg>
        </span>
        <div>
          <strong>{t('privateArea.privacyLabel')}</strong>
          <p>{t('privateArea.entry.privacy')}</p>
        </div>
      </section>
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
                  <DestinationIcon kind={destination.key} />
                </span>
                <span className="private-area-destination-copy">
                  <strong>{t(destination.title)}</strong>
                  <span>{t(destination.intro)}</span>
                </span>
                <span
                  className="private-area-destination-chevron"
                  aria-hidden="true"
                >
                  ›
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
