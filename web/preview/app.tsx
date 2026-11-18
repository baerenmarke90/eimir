import './replay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App } from '../src/App';
import { dateAwareStructuralSharing } from '../src/client/structuralSharing';
import { useControlPressFeedback } from '../src/client/useControlPressFeedback';
import { useFloatingCreateScrollTuck } from '../src/client/useFloatingCreateScrollTuck';
import { initializeTheme } from '../src/theme';
import messages from './locales/preview.json';
import { seedPreviewSession } from './replay';
import '../src/styles.css';
import '../src/story-media.css';
import '../src/theme.css';
import '../src/design/product-roles.css';
import '../src/shell.css';
import '../src/layout.css';
import '../src/attachment-drafts.css';
import '../src/demo.css';
import '../src/components/CommentsPanel.css';
import '../src/components/GamesProductArea.css';
import '../src/components/OurMomentsGamePage.css';
import '../src/components/WishDetectiveGamePage.css';
import '../src/components/HeartMomentCreateReference.css';
import '../src/components/LoginExperience.css';
import '../src/components/MediaGallery.css';
import '../src/components/MemoryProductPage.css';
import '../src/components/MoreOverviewPage.css';
import '../src/components/ProfilePage.css';
import '../src/components/RelatedPeoplePage.css';
import '../src/components/RelatedPeopleAccessibility.css';
import '../src/components/StoryProductPages.css';
import '../src/components/StoryDetailContentFirst.css';
import '../src/components/StoryMomentMetadata.css';
import '../src/components/SharedPlanningSanctuary.css';
import '../src/product-reflow.css';
import '../src/components/FreeComposer.css';
import '../src/components/StoryReading.css';
import '../src/design/identity-roles.css';
import '../src/design/person-colors.css';
import '../src/design/identity-components.css';
import '../src/design/app-designs.css';
import './preview.css';

/** The areas the preview opens. Everything else, and anything that creates or edits, returns to Wir. */
const OPEN_AREAS = ['/today', '/story'];
const CLOSED_PATHS = [
  '/story/map',
  '/story/memories/new',
  '/story/heart-moments/new',
  '/story/milestones/new',
];

function isOpen(path: string): boolean {
  if (CLOSED_PATHS.some((closed) => path.startsWith(closed))) return false;
  if (/\/(new|edit)(\/|$)/.test(path)) return false;
  return OPEN_AREAS.some(
    (area) => path === area || path.startsWith(`${area}/`),
  );
}

function PreviewGuard({
  children,
  unavailableMessage,
}: {
  children: React.ReactNode;
  unavailableMessage: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(false);
  const open = isOpen(location.pathname);
  useEffect(() => {
    if (open) return;
    setNotice(true);
    navigate('/today', { replace: true });
  }, [open, navigate]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(false), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return (
    <>
      {children}
      {notice ? (
        <p className="preview-notice" role="status">
          {unavailableMessage}
        </p>
      ) : null}
    </>
  );
}

function PreviewApp({ unavailableMessage }: { unavailableMessage: string }) {
  useControlPressFeedback();
  useFloatingCreateScrollTuck();
  return (
    <PreviewGuard unavailableMessage={unavailableMessage}>
      <App />
    </PreviewGuard>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: false,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      structuralSharing: dateAwareStructuralSharing,
    },
  },
});

export function startPreview(
  root: HTMLElement,
  language: 'de' | 'en' = 'de',
): void {
  seedPreviewSession(language);
  initializeTheme();
  ReactDOM.createRoot(root).render(
    <MemoryRouter initialEntries={['/today']}>
      <QueryClientProvider client={queryClient}>
        <PreviewApp unavailableMessage={messages[language].unavailable} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
