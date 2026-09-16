import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { isDemoModeConfigured } from './client/demoMode';
import { identityBuildVariable } from './client/identityEnvironment';
import { DemoBanner } from './components/DemoBanner';
import { i18n } from './i18n';
import { initializeTheme } from './theme';
import './styles.css';
import './story-media.css';
import './theme.css';
import './design/product-roles.css';
import './shell.css';
import './layout.css';
import './attachment-drafts.css';
import './demo.css';
import './components/CommentsPanel.css';
import './components/GamesProductArea.css';
import './components/OurMomentsGamePage.css';
import './components/WishDetectiveGamePage.css';
import './components/HeartMomentCreateReference.css';
import './components/LoginExperience.css';
import './components/MediaGallery.css';
import './components/MemoryProductPage.css';
import './components/MoreOverviewPage.css';
import './components/ProfilePage.css';
import './components/RelatedPeoplePage.css';
import './components/RelatedPeopleAccessibility.css';
import './components/StoryProductPages.css';
import './components/StoryMomentMetadata.css';
import './components/SharedPlanningSanctuary.css';
import './components/SharedPlanningMotion.css';
import './product-reflow.css';
import './memory-create-polish.css';
import './planning-focused-create.css';

initializeTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: false } },
});

const demoMode = isDemoModeConfigured();
const demoResetTimerEnabled =
  identityBuildVariable('DEMO_RESET_TIMER') === 'true';
const demoResetInterval = String(
  identityBuildVariable('DEMO_RESET_INTERVAL') || '6h',
).trim();
const demoUrl = String(identityBuildVariable('DEMO_URL'))
  .trim()
  .replace(/\/+$/, '');

function RootApp() {
  return (
    <>
      {demoMode ? (
        <DemoBanner
          resetTimerEnabled={demoResetTimerEnabled}
          resetInterval={demoResetInterval}
        />
      ) : null}
      <App demoMode={demoMode} />
      {!demoMode && demoUrl ? (
        <a className="demo-launch" href={demoUrl}>
          {i18n.t('demo.launch')}
        </a>
      ) : null}
    </>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <RootApp />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
